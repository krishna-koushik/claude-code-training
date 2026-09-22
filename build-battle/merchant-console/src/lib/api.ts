import { NextResponse } from "next/server"

/**
 * The one error shape every card route returns. There is no precedent for
 * this in the codebase yet - `GET /api/payments` has no error path - so this
 * is the convention going forward, not a pattern lifted from elsewhere.
 *
 * Four codes, not fourteen: `field` carries whatever specificity a case
 * needs beyond the code.
 */
export interface ApiError {
  code: "invalid_json" | "invalid_field" | "not_found" | "invalid_transition"
  /** Safe to show an ops user verbatim. Never contains a card number. */
  message: string
  /** The request-body field the message belongs to, when there is one. */
  field?: string
}

/** Wraps an `ApiError` in the standard `{ error }` envelope at the given status. */
export function jsonError(status: number, error: ApiError) {
  return NextResponse.json({ error }, { status })
}
