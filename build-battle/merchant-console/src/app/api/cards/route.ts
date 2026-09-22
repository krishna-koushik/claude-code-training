import { issueCard, validateIssueCard } from "@/data/cards"
import { jsonError } from "@/lib/api"
import { NextRequest, NextResponse } from "next/server"

/**
 * Issues a virtual card. `201` with the full number, once, as a sibling of
 * the card record — never a field on it. A replay of a prior `requestKey`
 * comes back `200` with the existing card and no number, because reveal
 * happens exactly once.
 */
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, {
      code: "invalid_json",
      message: "Request body must be valid JSON.",
    })
  }

  const result = validateIssueCard(body)
  if (!result.ok) {
    return jsonError(400, {
      code: "invalid_field",
      message: result.message,
      field: result.field,
    })
  }

  const issued = issueCard(result.value, new Date())

  if ("replayed" in issued) {
    return NextResponse.json({ card: issued.card, replayed: true })
  }

  return NextResponse.json(
    { card: issued.card, cardNumber: issued.cardNumber },
    {
      status: 201,
      headers: { Location: `/api/cards/${issued.card.id}` },
    },
  )
}
