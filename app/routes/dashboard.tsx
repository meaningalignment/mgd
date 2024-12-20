import {
  Outlet,
  NavLink,
  useLoaderData,
  redirect,
  useParams,
  useLocation,
} from "@remix-run/react"
import type { LoaderFunctionArgs } from "@remix-run/node"
import { auth, db } from "~/config.server"
import { Button } from "~/components/ui/button"
import { ScrollArea } from "~/components/ui/scroll-area"
import { cn } from "~/lib/utils"

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const user = await auth.getCurrentUser(request)
  if (!user) return redirect("/auth/login")
  const where = user.isAdmin ? {} : { createdBy: user.id }
  const deliberations = await db.deliberation.findMany({ where })
  const participatingIn = await db.deliberation.findMany({
    where: {
      createdBy: {
        not: user.id,
      },
      OR: [
        {
          edges: {
            some: {
              userId: user.id,
            },
          },
        },
        {
          chats: {
            some: {
              userId: user.id,
            },
          },
        },
      ],
    },
  })
  return { deliberations, participatingIn }
}

export default function Deliberations() {
  const { deliberations, participatingIn } = useLoaderData<typeof loader>()
  const params = useParams()
  const location = useLocation()

  const currentDeliberation = [...deliberations, ...participatingIn].find(
    (d) => d.id === Number(params.deliberationId)
  )

  const pathSegments = location.pathname
    .split("/")
    .filter(Boolean)
    .slice(2) // Skip 'deliberations' and deliberationId
    .filter((segment) => isNaN(Number(segment))) // Filter out numeric segments

  return (
    <div className="h-screen flex">
      <aside
        id="sidebar"
        className="fixed left-0 top-0 z-40 h-screen w-64 transition-transform"
        aria-label="Sidebar"
      >
        <div className="flex h-full flex-col overflow-y-auto border-r border-slate-200 bg-white px-3 py-4  ">
          <div className="mb-10 flex items-center rounded-lg px-3 py-2 text-slate-900 ">
            <svg
              className="h-5 w-5"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
            </svg>
            <span className="ml-3 text-base font-semibold">
              Moral Graph Elicitation
            </span>
          </div>
          <ScrollArea className="flex-grow">
            <div className="mb-2 px-3 text-xs font-semibold text-slate-500 ">
              Your Deliberations
            </div>
            <ul className="space-y-2 text-sm font-medium">
              {deliberations.map((delib: any) => (
                <li key={delib.id}>
                  <NavLink
                    prefetch="render"
                    to={`/dashboard/${delib.id}`}
                    className={({ isActive, isPending }) =>
                      cn(
                        "flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  ",
                        isPending && "bg-slate-50 ",
                        isActive && "bg-slate-100 "
                      )
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="ml-3 flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                      <span className="inline-block max-w-full truncate">
                        {delib.title}
                      </span>
                    </span>
                  </NavLink>
                </li>
              ))}
            </ul>

            {participatingIn.length > 0 && (
              <>
                <div className="mt-6 mb-2 px-3 text-xs font-semibold text-slate-500 ">
                  Participating In
                </div>
                <ul className="space-y-2 text-sm font-medium">
                  {participatingIn.map((delib: any) => (
                    <li key={delib.id}>
                      <NavLink
                        to={`/dashboard/${delib.id}`}
                        className={({ isActive, isPending }) =>
                          cn(
                            "flex items-center rounded-lg px-3 py-2 text-slate-900 hover:bg-slate-100  ",
                            isPending && "bg-slate-50 ",
                            isActive && "bg-slate-100 "
                          )
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                          <circle cx="9" cy="7" r="4"></circle>
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                        </svg>
                        <span className="ml-3 flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                          <span className="inline-block max-w-full truncate">
                            {delib.title}
                          </span>
                        </span>
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ScrollArea>
          <div className="mt-auto pt-4">
            <Button variant="outline" className="w-full">
              <NavLink
                to="/dashboard/new"
                prefetch="intent"
                className="w-full flex items-center justify-center"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 mr-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                New Deliberation
              </NavLink>
            </Button>
          </div>
        </div>
      </aside>
      <main className="ml-64 flex-1 flex flex-col h-full">
        {params.deliberationId && (
          <nav className="px-6 py-4 flex-none border-b border-slate-200">
            <ol className="flex items-center text-sm">
              <li className="font-medium text-slate-800 ">
                <NavLink
                  prefetch="render"
                  to={`/dashboard/${params.deliberationId}`}
                  className="hover:text-slate-600  transition-colors"
                >
                  {currentDeliberation?.title}
                </NavLink>
              </li>
              {pathSegments.map((segment, index) => (
                <li key={segment} className="flex items-center">
                  <span className="mx-2 text-slate-400 ">/</span>
                  <NavLink
                    prefetch="intent"
                    to={`/dashboard/${params.deliberationId}/${pathSegments
                      .slice(0, index + 1)
                      .join("/")}`}
                    className="font-medium text-slate-500  capitalize hover:text-slate-700  transition-colors"
                  >
                    {segment}
                  </NavLink>
                </li>
              ))}
            </ol>
          </nav>
        )}
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
