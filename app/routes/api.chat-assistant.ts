import { ActionFunctionArgs } from "@remix-run/node"
import { kv } from "@vercel/kv"
import { AssistantResponse, DataMessage } from "ai"
import { AssistantStream } from "openai/lib/AssistantStream.mjs"
import { openai, ensureLoggedIn, db } from "~/config.server"
import { embedNonCanonicalCard } from "~/services/embedding"

export const config = { maxDuration: 300 }

export async function action({ request }: ActionFunctionArgs) {
  const authorId = await ensureLoggedIn(request)

  const { threadId, deliberationId, questionId, message } = await request.json()
  return await assistantResponseWithTools({
    assistant_id: "asst_aPIlnXJb5RmDyVuSWd2FLil5",
    context: { authorId, threadId, deliberationId, questionId },
    threadId,
    message,
    tools: { submit_values_card: submitValuesCard },
  })
}

async function submitValuesCard(
  {
    authorId,
    threadId,
    questionId,
    deliberationId,
  }: {
    authorId: number
    threadId: string
    questionId: number
    deliberationId: number
  },
  {
    title,
    description,
    policies,
  }: {
    title: string
    description: string
    policies: string[]
  },
  sendDataMessage: (message: DataMessage) => void
) {
  const chat = await db.chat.upsert({
    create: {
      id: threadId,
      userId: authorId,
      deliberationId,
      questionId,
      transcript: [],
    },
    update: {},
    where: { id: threadId },
  })
  const card = await db.valuesCard.upsert({
    create: {
      title,
      chatId: chat.id,
      deliberationId: chat.deliberationId,
      description,
      policies,
    },
    update: {
      title,
      chatId: chat.id,
      description,
      policies,
    },
    where: { chatId: chat.id },
  })
  await embedNonCanonicalCard(card)
  // TODO Here we should create a new context for the card if needed, or link card to existing contexts.
  const data = {
    type: "values_card",
    title,
    description,
    policies,
  }
  console.log("Data in KV", data)
  kv.set(`data:${threadId}`, JSON.stringify(data)) // Data messages are not saved, so we persist in KV for reloads.
  sendDataMessage({ role: "data", data })

  return "<Submitted values card. Go ahead and thank the user.>"
}

// When the first "function call" token is streamed, we store the function name in KV
// in order to show a spinner in the client (data messages won't work here).
function initFunctionSpinner(stream: AssistantStream, threadId: string) {
  stream.on("event", (event: any) => {
    const toolCalls = event?.data?.delta?.step_details?.tool_calls
    const fnKey = toolCalls?.length && toolCalls[0]?.function?.name
    if (fnKey) kv.set(`function:${threadId}`, fnKey)
  })
}

// When the function call is done, we remove the spinner.
function cancelFunctionSpinner(threadId: string) {
  kv.set(`function:${threadId}`, null)
}

type Tool<C> = (
  context: C,
  params: any,
  sendDataMessage: (message: DataMessage) => void
) => Promise<any>

async function assistantResponseWithTools<C>({
  assistant_id,
  context,
  threadId,
  message,
  tools,
  additional_instructions,
}: {
  assistant_id: string
  context: C
  threadId: string
  message: string
  tools: Record<string, Tool<C>>
  additional_instructions?: string
}) {
  const createdMessage = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: message,
  })

  return AssistantResponse(
    { threadId, messageId: createdMessage.id },
    async ({ forwardStream, sendDataMessage }) => {
      // Run the assistant on the thread
      const runStream = openai.beta.threads.runs.stream(threadId!, {
        assistant_id,
        additional_instructions,
      })

      initFunctionSpinner(runStream, threadId)

      let runResult = await forwardStream(runStream)
      while (
        runResult?.status === "requires_action" &&
        runResult.required_action?.type === "submit_tool_outputs"
      ) {
        cancelFunctionSpinner(threadId)
        const tool_outputs = await Promise.all(
          runResult.required_action.submit_tool_outputs.tool_calls.map(
            async (toolCall: any) => {
              const fn = toolCall.function.name
              const parameters = JSON.parse(toolCall.function.arguments)
              const output = await tools[fn](
                context,
                parameters,
                sendDataMessage
              )
              return {
                tool_call_id: toolCall.id,
                output: JSON.stringify(output),
              }
            }
          )
        )
        runResult = await forwardStream(
          openai.beta.threads.runs.submitToolOutputsStream(
            threadId,
            runResult.id,
            { tool_outputs }
          )
        )
      }
    }
  )
}
