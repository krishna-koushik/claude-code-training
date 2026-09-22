import { setCardStatus } from "@/data/cards"
import { isCardStatus } from "@/data/card-status"
import { jsonError } from "@/lib/api"
import { NextRequest, NextResponse } from "next/server"

/**
 * Moves a card between `active`, `frozen`, and `cancelled`. Body is
 * `{ status }` only — `spendLimit` is NWP-202, not this ticket, so accepting
 * it here would build that ticket by accident.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonError(400, {
      code: "invalid_json",
      message: "Request body must be valid JSON.",
    })
  }

  const status =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).status
      : undefined

  if (!isCardStatus(status)) {
    return jsonError(400, {
      code: "invalid_field",
      field: "status",
      message: "status must be one of active, frozen, cancelled.",
    })
  }

  // Both `await`s (params, request.json()) already happened above, so the
  // find-check-mutate inside `setCardStatus` below runs with no `await` in
  // the middle — two concurrent PATCHes cannot interleave across it.
  const result = setCardStatus(id, status, new Date())

  if (!result.ok) {
    if (result.reason === "not_found") {
      return jsonError(404, {
        code: "not_found",
        message: `No card with id "${id}".`,
      })
    }
    return jsonError(409, {
      code: "invalid_transition",
      field: "status",
      message: `Card ${id} is currently ${result.card.status} and cannot move to ${status}.`,
    })
  }

  return NextResponse.json({ card: result.card })
}
