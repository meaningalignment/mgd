import { Configuration, OpenAIApi } from "openai-edge"
import { ActionArgs, ActionFunction } from "@remix-run/node"
import { functions, systemPrompt, articulationPrompt } from "~/lib/consts"
import { ChatCompletionRequestMessage } from "openai-edge"
import { OpenAIStream, StreamingTextResponse } from "../lib/openai-stream"
// import { OpenAIStream, StreamingTextResponse } from "ai"   TODO replace the above import with this once https://github.com/vercel-labs/ai/issues/199 is fixed.

export const runtime = "edge"

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
})

const openai = new OpenAIApi(configuration)

export type ArticulationFunction = {
  name: string
  arguments: {
    summary: string
    description?: string
  }
}

export type SubmitFunction = {
  name: string
  arguments: {
    values_card: string
  }
}

// For debug purposes.
export type DebugFunction = {
  name: string
  arguments: {
    location: string
    unit?: string
  }
}

//
// Vercel AI openai functions handling is broken in Remix. The `experimental_onFunctionCall` provided by the `ai` package does not work.
//
// We have to handle them manually, until https://github.com/vercel-labs/ai/issues/199 is fixed.
// This is done by listening to the first token and seeing if it is a function call.
// If so, wait for the whole response and handle the function call.
// Otherwise, return the stream as-is.
//
async function getFunctionCall(
  res: Response
): Promise<ArticulationFunction | SubmitFunction | DebugFunction | null> {
  const stream = OpenAIStream(res.clone())
  const reader = stream.getReader()

  //
  // In the case of a function call, the first token in the stream
  // is an unfinished JSON object, with "function_call" as the first key.
  //
  // We can use that key to check if the response is a function call.
  //
  const { value: first } = await reader.read()
  const isFunctionCall = first
    ?.replace(/[^a-zA-Z0-9_]/g, "")
    ?.startsWith("function_call")

  if (!isFunctionCall) {
    return null
  }

  //
  // Function arguments are streamed as tokens, so we need to
  // read the whole stream, concatenate the tokens, and parse the resulting JSON.
  //
  let result = first

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    result += value
  }

  // Return the resulting function call.
  const json = JSON.parse(result)["function_call"]
  json["arguments"] = JSON.parse(json["arguments"]) // This is needed due to the way tokens are streamed with escape characters.
  return json as ArticulationFunction | SubmitFunction | DebugFunction
}

async function articulateValuesCard(
  summary: string,
  messages: ChatCompletionRequestMessage[]
): Promise<string> {
  const msg =
    "Here is a transcript. Return a values card summarizing the source of meaning that was discussed.\n\n" +
    messages
      .filter((m) => m.role === "assistant" || m.role === "user")
      .map((m) =>
        m.role === "assistant"
          ? "Assistant: " + m.content
          : "User: " + m.content
      )
      .join("\n")

  const res = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages: [
      {
        role: "system",
        content: articulationPrompt,
      },
      {
        role: "user",
        content: msg,
      },
    ],
    temperature: 0.7,
  })

  const data = await res.json()
  console.log(data)
  return data.choices[0].text
}

async function submitValuesCard(valuesCard: string): Promise<string> {
  return "<the values card was submitted. The user has now submitted 1 value in total. Proceed to thank the user>"
}

/** Call the right function recursively and return the resulting stream. */
async function streamingFunctionCallResponse(
  func: ArticulationFunction | SubmitFunction | DebugFunction,
  messages: any[] = []
): Promise<StreamingTextResponse> {
  //
  // Call the right function.
  //
  let result: string = ""

  switch (func.name) {
    case "articulate_values_card": {
      const summary = (func as ArticulationFunction).arguments.summary
      result = await articulateValuesCard(summary, messages)
      break
    }
    case "submit_values_card": {
      const valuesCard = (func as SubmitFunction).arguments.values_card
      result = await submitValuesCard(valuesCard)
      break
    }
  }

  //
  // Call the OpenAI API with the function result.
  //
  const res = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages: [
      ...messages,
      {
        role: "function",
        name: func.name,
        content: result,
      },
    ],
    temperature: 0.7,
    stream: true,
    function_call: "auto",
    functions,
  })

  // If a subsequent function call is present, call this method recursively...
  const nextFunc = await getFunctionCall(res)

  if (nextFunc) {
    return streamingFunctionCallResponse(nextFunc, messages)
  }

  // ...otherwise, return the response.
  return new StreamingTextResponse(OpenAIStream(res))
}

/** Prepend the system message if needed. */
function withSystemPrompt(
  messages: ChatCompletionRequestMessage[]
): ChatCompletionRequestMessage[] {
  if (messages[0]?.role !== "system") {
    return [
      {
        role: "system",
        content: systemPrompt,
      },
      ...messages,
    ]
  }

  return messages
}

export const action: ActionFunction = async ({
  request,
}: ActionArgs): Promise<Response> => {
  const json = await request.json()
  const { messages } = json

  const res = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0613",
    messages: withSystemPrompt(messages),
    temperature: 0.7,
    functions,
    function_call: "auto",
    stream: true,
  })

  // Print out the entire error for now.
  if (!res.ok) {
    const body = await res.json()
    throw body.error
  }

  // If a function call is present, call this method recursively...
  const func = await getFunctionCall(res)
  if (func) {
    return streamingFunctionCallResponse(func, messages)
  }

  // ...otherwise, return the response.
  return new StreamingTextResponse(OpenAIStream(res))
}
