import { json, LoaderFunctionArgs } from "@remix-run/node"
import { NavLink, Outlet, useLoaderData, useParams } from "@remix-run/react"
import { db } from "~/config.server"
import { cn } from "~/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select"
import { useState } from "react"
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert"
import { AlertCircle } from "lucide-react"

export async function loader({ params }: LoaderFunctionArgs) {
  const { deliberationId } = params

  const [chats, questions, contexts] = await Promise.all([
    db.chat.findMany({
      orderBy: { createdAt: "desc" },
      where: {
        deliberationId: Number(deliberationId)!,
      },
      select: {
        id: true,
        createdAt: true,
        copiedFromId: true,
        evaluation: true,
        questionId: true,
        Question: {
          select: {
            ContextsForQuestions: {
              select: {
                contextId: true,
              },
            },
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        ValuesCard: true,
      },
    }),
    db.question.findMany({
      where: { deliberationId: Number(deliberationId)! },
      select: { id: true, title: true },
    }),
    db.context.findMany({
      where: { deliberationId: Number(deliberationId)! },
      select: { id: true },
    }),
  ])

  return json({ chats, questions, contexts })
}

function StatusBadge({ hasValuesCard }: { hasValuesCard: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        hasValuesCard
          ? "bg-green-100 text-green-800"
          : "bg-yellow-100 text-yellow-800"
      )}
    >
      {hasValuesCard ? "Submitted Card" : "No Card"}
    </span>
  )
}

export default function AdminChats() {
  const data = useLoaderData<typeof loader>()
  const [selectedQuestion, setSelectedQuestion] = useState("all")
  const [selectedContext, setSelectedContext] = useState("all")

  const filteredChats = data.chats.filter((chat) => {
    const matchesQuestion =
      selectedQuestion === "all" ||
      chat.questionId?.toString() === selectedQuestion
    const matchesContext =
      selectedContext === "all" ||
      chat.Question.ContextsForQuestions.some(
        (context) => context.contextId === selectedContext
      )
    return matchesQuestion && matchesContext
  })

  return (
    <div className="flex h-full">
      <div className="w-64 flex-shrink-0 border-r overflow-y-auto bg-white px-3 py-4">
        <div className="mb-6">
          <div className="flex items-center rounded-lg px-3 py-2 text-slate-900">
            <svg
              className="h-5 w-5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="ml-3 text-base font-semibold">Chats</span>
          </div>
          <div className="px-3 text-sm text-slate-500">
            {filteredChats.length} chat{filteredChats.length !== 1 ? "s" : ""}
          </div>
        </div>

        <div className="mb-6 space-y-4">
          <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Question" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Questions</SelectItem>
              {data.questions.map((question) => (
                <SelectItem key={question.id} value={question.id.toString()}>
                  {question.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedContext} onValueChange={setSelectedContext}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select Context" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Contexts</SelectItem>
              {data.contexts.map((context) => (
                <SelectItem key={context.id} value={context.id}>
                  {context.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredChats.length === 0 ? (
          <Alert className="bg-slate-50">
            <div className="flex flex-row space-x-2">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>No chats found</AlertTitle>
            </div>
            <AlertDescription>
              {selectedQuestion !== "all" || selectedContext !== "all"
                ? "No chats match your selected filters."
                : "No chats available yet."}
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="space-y-2 text-sm font-medium">
            {filteredChats.map((chat) => (
              <NavLink
                prefetch="intent"
                to={chat.id}
                key={chat.id}
                className={({ isActive, isPending }) =>
                  cn(
                    "block rounded-lg hover:bg-slate-100 ",
                    isPending && "bg-slate-50 ",
                    isActive && "bg-slate-100 "
                  )
                }
              >
                <li className="px-3 py-2">
                  <div className="font-medium">{chat.user?.name}</div>
                  <div className="text-sm text-slate-500 ">
                    {chat.user?.email}
                  </div>
                  <div className="text-xs text-slate-400  mt-1">
                    {chat.createdAt}
                  </div>
                  {chat.evaluation && (
                    <div className="mt-1">
                      <span className="text-sm text-red-500">
                        {(chat.evaluation as any).worst_score}
                      </span>
                    </div>
                  )}
                  {chat.copiedFromId && (
                    <div className="text-xs font-bold mt-1 text-slate-500">
                      Copied from {chat.copiedFromId}
                    </div>
                  )}
                  <div className="mt-2">
                    <StatusBadge hasValuesCard={chat.ValuesCard !== null} />
                  </div>
                </li>
              </NavLink>
            ))}
          </ul>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
