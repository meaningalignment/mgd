import { redirect } from "@remix-run/node"
import { db } from "~/config.server"

export async function loader() {
  const defaultCase = (await db.question.findFirst({ orderBy: { id: "asc" } }))!
    .id
  return redirect(`/case/${defaultCase}/link`)
}
