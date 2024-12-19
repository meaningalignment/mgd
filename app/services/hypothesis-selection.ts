import { CanonicalValuesCard, EdgeHypothesis } from "@prisma/client"
import { db } from "~/config.server"
import { Upgrade } from "values-tools"
import { getUserEmbedding } from "./embedding"

type EdgeHypothesisData = {
  to: CanonicalValuesCard
  from: CanonicalValuesCard
  contextId: string
  story: string
  hypothesisRunId: string
  deliberationId: number
  reason?: {
    totalVotes: number
    totalAgrees: number
    selecedDueTo: "agrees" | "interesting" | "sparsity"
  }
}

function sortedOnInterestingness(
  hypothesesWithVotes: (EdgeHypothesis & {
    to: CanonicalValuesCard
    from: CanonicalValuesCard
  } & { totalAgrees: number; totalVotes: number })[]
) {
  // Calculate vote statistics for each toId
  const votesByToId = new Map<number, number[]>()
  hypothesesWithVotes.forEach((h) => {
    const votes = votesByToId.get(h.toId) || []
    votes.push(h.totalAgrees)
    votesByToId.set(h.toId, votes)
  })

  // Sort hypotheses prioritizing those that:
  // 1. Point to a toId that has at least one highly-voted hypothesis
  // 2. But this particular hypothesis has few votes
  const sortedByConvergence = hypothesesWithVotes.toSorted((a, b) => {
    const aVotes = votesByToId.get(a.toId) || []
    const bVotes = votesByToId.get(b.toId) || []

    const aMaxVotes = Math.max(...aVotes)
    const bMaxVotes = Math.max(...bVotes)

    // Calculate how "interesting" each hypothesis is based on
    // the difference between max votes for its toId and its own votes
    const aScore = aMaxVotes > 0 ? (aMaxVotes - a.totalAgrees) / aMaxVotes : 0
    const bScore = bMaxVotes > 0 ? (bMaxVotes - b.totalAgrees) / bMaxVotes : 0

    return bScore - aScore
  })

  return sortedByConvergence
}

/**
 * Sorts hypotheses based on a combination of:
 * 1. How many people agree with it (popularity)
 * 2. How "interesting" it is (points to popular values but itself isn't highly voted)
 * 3. How sparsely voted on it is (to surface under-explored hypotheses)
 */
export async function drawFreceny(
  deliberationId: number,
  size: number = 5,
  weights = { agrees: 0.3, interesting: 0.3, sparsity: 0.4 }
): Promise<EdgeHypothesisData[]> {
  // Find edge hypotheses that the user has not linked together yet.
  const hypotheses = (await db.edgeHypothesis.findMany({
    where: {
      deliberationId,
      archivedAt: null,
    },
    include: {
      from: true,
      to: true,
    },
  })) as (EdgeHypothesis & {
    from: CanonicalValuesCard
    to: CanonicalValuesCard
  })[]

  const links = await db.edge.findMany({
    where: { deliberationId },
  })

  const hypothesesWithFrequency = hypotheses.map((h) => {
    const totalVotes = links.filter(
      (l) => l.fromId === h.fromId && l.toId === h.toId
    )
    const totalAgrees = totalVotes.filter((v) => v.type === "upgrade")

    return {
      ...h,
      totalVotes: totalVotes.length,
      totalAgrees: totalAgrees.length,
    }
  })

  const sortedOnAgrees = hypothesesWithFrequency.toSorted(
    (a, b) => b.totalAgrees - a.totalAgrees
  )
  const sortedOnInteresting = sortedOnInterestingness(hypothesesWithFrequency)

  const sortedOnSparsity = hypothesesWithFrequency.toSorted(
    (a, b) => a.totalVotes - b.totalVotes
  )

  //
  // Roll a dice to determine which list to draw from, weighted by `weights`.
  // Continue drawing until we have `size` unique hypotheses.
  //
  const result: EdgeHypothesisData[] = []
  const used = new Set<string>()

  while (result.length < size) {
    const roll = Math.random()
    let hypothesis: (typeof hypothesesWithFrequency)[0] | undefined
    let reason: "agrees" | "interesting" | "sparsity" | undefined

    if (roll < weights.agrees) {
      hypothesis = sortedOnAgrees.find(
        (h) => !used.has(`${h.fromId}-${h.toId}`)
      )
      reason = "agrees"
    } else if (roll < weights.agrees + weights.interesting) {
      hypothesis = sortedOnInteresting.find(
        (h) => !used.has(`${h.fromId}-${h.toId}`)
      )
      reason = "interesting"
    } else {
      hypothesis = sortedOnSparsity.find(
        (h) => !used.has(`${h.fromId}-${h.toId}`)
      )
      reason = "sparsity"
    }

    if (!hypothesis) break

    used.add(`${hypothesis.fromId}-${hypothesis.toId}`)
    result.push({
      to: hypothesis.to,
      from: hypothesis.from,
      story: hypothesis.story!,
      contextId: hypothesis.contextId,
      hypothesisRunId: hypothesis.hypothesisRunId,
      deliberationId: hypothesis.deliberationId,
      reason: {
        totalVotes: hypothesis.totalVotes,
        totalAgrees: hypothesis.totalAgrees,
        selecedDueTo: reason,
      },
    })
  }

  return result
}
