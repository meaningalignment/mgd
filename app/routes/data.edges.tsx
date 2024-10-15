import { useEffect, useState } from "react"
import { MoralGraph } from "~/components/moral-graph"
import { Loader2 } from "lucide-react"
import MoralGraphSettings, {
  GraphSettings,
  defaultGraphSettings,
} from "~/components/moral-graph-settings"
import { useLoaderData, useSearchParams } from "@remix-run/react"

function LoadingScreen() {
  return (
    <div className="h-screen w-full mx-auto flex items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin" />
    </div>
  )
}

export default function DefaultGraphPage() {
  const [settings, setSettings] = useState<GraphSettings>(defaultGraphSettings)
  const [graph, setGraph] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [searchParams, _] = useSearchParams()

  useEffect(() => {
    setIsLoading(true)
    if (!graph && !isLoading) {
      fetchData(settings)
    }
  }, [])

  const fetchData = async (settings: GraphSettings) => {
    setIsLoading(true)

    const headers = { "Content-Type": "application/json" }
    const params: {
      questionId?: string
      hypothesisRunId?: string
      batches?: string
    } = {}

    const graph = await fetch(
      "/api/data/edges?" + new URLSearchParams(params).toString(),
      { headers }
    ).then((res) => res.json())

    console.log(graph)

    setGraph(graph)
    setIsLoading(false)
  }

  function onUpdateSettings(newSettings: GraphSettings) {
    setSettings(newSettings)
    fetchData(newSettings)
  }

  return (
    <div style={{ display: "flex", flexDirection: "row" }}>
      {/* Graph */}
      <div className="flex-grow">
        {graph && graph.values.length < 2 && graph.edges.length < 2 && (
          <div className="h-screen w-full flex items-center justify-center">
            <div>
              <h1 className="text-2xl font-bold text-center">
                Not Enough Data
              </h1>
              <p className="text-center text-gray-400 mt-4">
                We don't have enough data to show a graph yet. Please try again
                later.
              </p>
            </div>
          </div>
        )}

        {isLoading || !graph ? (
          <LoadingScreen />
        ) : (
          <MoralGraph
            nodes={graph.values}
            edges={graph.edges}
            settings={settings}
          />
        )}
      </div>

      <div className="hidden md:block flex-shrink-0 max-w-sm">
        <MoralGraphSettings
          initialSettings={settings}
          onUpdateSettings={onUpdateSettings}
        />
      </div>
    </div>
  )
}
