import {
  ChatCompletionRequestMessage,
  Configuration,
  OpenAIApi,
} from "openai-edge"
import { ActionFunctionArgs, ActionFunction } from "@remix-run/node"
import { auth, db } from "~/config.server"
import { ArticulatorService } from "~/services/articulator"
import DeduplicationService from "~/services/deduplication"
import EmbeddingService from "~/services/embedding"
import { OpenAIStream, OpenAIStreamCallbacks, StreamingTextResponse } from "ai"

export const runtime = "edge"

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(configuration)
const embeddings = new EmbeddingService(openai, db)
const deduplication = new DeduplicationService(embeddings, openai, db)

function isFunctionCall(completion: string) {
  return completion.replace(/[^a-zA-Z0-9_]/g, "").startsWith("function_call")
}

export const action: ActionFunction = async ({
  request,
}: ActionFunctionArgs): Promise<Response> => {
  const articulatorConfig = request.headers.get("X-Articulator-Config")
  const userId = await auth.getUserId(request)
  const json = await request.json()

  // Unpack the post body.
  const { messages: clientMessages, chatId, caseId, function_call } = json

  // Create the Articulator service.
  const articulator = new ArticulatorService(
    articulatorConfig ?? "default",
    deduplication,
    embeddings,
    openai,
    db
  )

  //
  // Add the user's message to the chat.
  //
  let messages: ChatCompletionRequestMessage[]

  if ((await db.chat.count({ where: { id: chatId } })) === 0) {
    const chat = await articulator.createChat(
      chatId,
      caseId,
      userId,
      clientMessages
    )
    messages = chat.transcript as any as ChatCompletionRequestMessage[]
  } else {
    messages = await articulator.addServerSideMessage(
      chatId,
      clientMessages[clientMessages.length - 1]
    )
  }

  //
  // Configure streaming callbacks.
  //
  const callbacks: OpenAIStreamCallbacks = {
    experimental_onFunctionCall: async (payload) => {
      return articulator.func(payload, chatId, messages)
    },
    onCompletion: async (completion) => {
      if (isFunctionCall(completion)) {
        // Function call completions are handled by the onFunctionCall callback.
        return
      }

      // Save the message to database.
      await articulator.addServerSideMessage(chatId, {
        content: completion,
        role: "assistant",
      })
    },
  }

  // Get the chat response.
  const response = await articulator.chat(messages, function_call)

  // Return a streaming response.
  return new StreamingTextResponse(OpenAIStream(response, callbacks))
}
