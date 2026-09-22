import { randomBytes, randomInt } from "node:crypto"
import {
  canTransition,
  generateCardNumber,
  isCardCategory,
  lastFour,
  MAX_SPEND_LIMIT_MINOR_UNITS,
  NICKNAME_MAX_LENGTH,
} from "@/lib/cards"
import { isCurrency } from "@/lib/money"
import { pad } from "./generate"
import { merchantById } from "./merchants"
import { paginate, PAGE_SIZE } from "./queries"
import { store } from "./store"
import {
  Card,
  CardCategory,
  CardEvent,
  CardFilters,
  CardStatus,
  Currency,
} from "./types"

/**
 * Server-only card data: the id allocator, the issue validator, and the
 * mutations. `src/lib/cards.ts` holds the isomorphic pieces (Luhn, masking,
 * the transition table) that a client component also imports — this module
 * may use `node:crypto` and the store, so nothing here is ever imported by
 * one.
 */

export function cardById(id: string): Card | null {
  return store.cards.find((card) => card.id === id) ?? null
}

/**
 * Filter, sort newest-first, and paginate. `paginate` is the generic helper
 * behind every payments query too — reused unchanged, per the ticket's own
 * rule against a second query path.
 */
export function queryCards(filters: CardFilters) {
  const { status, merchantId, page, pageSize } = filters

  const filtered = store.cards.filter((card) => {
    if (status && status !== "all" && card.status !== status) return false
    if (merchantId && card.merchantId !== merchantId) return false
    return true
  })

  // ISO-8601 UTC strings sort lexicographically, so this is a correct
  // newest-first sort without touching the numeric-vs-string trap in
  // queries.ts's `sortPayments`.
  const sorted = [...filtered].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  return paginate(sorted, page, pageSize ?? PAGE_SIZE)
}

export interface IssueCardInput {
  merchantId: string
  nickname: string
  /** Integer minor units. */
  spendLimit: number
  currency: Currency
  categoryLock: CardCategory | null
  /** The client's one-shot dedup key, if it sent one. */
  requestKey: string | null
}

export type ValidateResult =
  | { ok: true; value: IssueCardInput }
  | { ok: false; field?: string; message: string }

/**
 * Hand-rolled on purpose — there is no zod in this repo. Unlike
 * `parseFilters` in `queries.ts`, which allowlists and silently falls back
 * to a default, this REJECTS: a POST that creates a card is not a place to
 * coerce `"JPY"` into `"USD"` and return 201.
 */
export function validateIssueCard(body: unknown): ValidateResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, message: "Request body must be a JSON object." }
  }

  const record = body as Record<string, unknown>

  const merchantId = record.merchantId
  if (typeof merchantId !== "string" || merchantId.length === 0) {
    return {
      ok: false,
      field: "merchantId",
      message: "merchantId is required.",
    }
  }
  if (!merchantById(merchantId)) {
    return {
      ok: false,
      field: "merchantId",
      message: `No merchant with id "${merchantId}".`,
    }
  }

  // `Number.isInteger` rejects NaN, Infinity, and 250.5 in one call.
  // Never `Number(body.x)` — `Number(true) === 1` would create a one-cent card.
  const spendLimit = record.spendLimit
  if (
    typeof spendLimit !== "number" ||
    !Number.isInteger(spendLimit) ||
    spendLimit <= 0 ||
    spendLimit > MAX_SPEND_LIMIT_MINOR_UNITS
  ) {
    return {
      ok: false,
      field: "spendLimit",
      message: `spendLimit must be an integer greater than 0 and no more than ${MAX_SPEND_LIMIT_MINOR_UNITS} (minor units).`,
    }
  }

  const currency = record.currency
  if (!isCurrency(currency)) {
    return {
      ok: false,
      field: "currency",
      message: "currency must be one of USD, EUR, GBP.",
    }
  }

  let categoryLock: CardCategory | null = null
  const categoryLockRaw = record.categoryLock
  if (categoryLockRaw !== undefined && categoryLockRaw !== null) {
    if (!isCardCategory(categoryLockRaw)) {
      return {
        ok: false,
        field: "categoryLock",
        message: "categoryLock is not a recognized category.",
      }
    }
    categoryLock = categoryLockRaw
  }

  const nicknameRaw = record.nickname
  if (typeof nicknameRaw !== "string") {
    return { ok: false, field: "nickname", message: "nickname is required." }
  }
  const nickname = nicknameRaw.trim()
  if (nickname.length === 0 || nickname.length > NICKNAME_MAX_LENGTH) {
    return {
      ok: false,
      field: "nickname",
      message: `nickname must be 1-${NICKNAME_MAX_LENGTH} characters.`,
    }
  }

  // Not in the rejection matrix: an absent or non-string requestKey just
  // means "no dedup requested," not a bad request.
  const requestKeyRaw = record.requestKey
  const requestKey =
    typeof requestKeyRaw === "string" && requestKeyRaw.length > 0
      ? requestKeyRaw
      : null

  return {
    ok: true,
    value: { merchantId, nickname, spendLimit, currency, categoryLock, requestKey },
  }
}

/**
 * The highest existing `card_NNNN` suffix, plus one. Derived from the store
 * on every call rather than a module-level counter, which would reset to 1
 * on a dev-server hot reload and collide with a card already issued.
 */
function nextCardId(): string {
  let max = 0
  for (const card of store.cards) {
    const match = /^card_(\d+)$/.exec(card.id)
    if (match) max = Math.max(max, Number(match[1]))
  }
  return `card_${pad(max + 1, 4)}`
}

/**
 * Issues a card, or replays a prior issue if `input.requestKey` matches one
 * already in the store — a double submit must not mint a second card, and
 * a replay must not re-reveal the number.
 *
 * `cardNumber` is a local const, never assigned onto `card`. `Card` has no
 * such field, so every other payload in this codebase is safe by
 * construction; there is nothing to strip and no mapper to get wrong.
 */
export function issueCard(
  input: IssueCardInput,
  now: Date,
): { card: Card; cardNumber: string } | { card: Card; replayed: true } {
  if (input.requestKey) {
    const existing = store.cards.find(
      (card) => card.requestKey === input.requestKey,
    )
    if (existing) {
      return { card: existing, replayed: true }
    }
  }

  // `randomInt(0, 10)`, not `randomBytes(1)[0] % 10` — the modulo skews low.
  const cardNumber = generateCardNumber(() => randomInt(0, 10))
  const createdAt = now.toISOString()

  const card: Card = {
    id: nextCardId(),
    merchantId: input.merchantId,
    nickname: input.nickname,
    // Independently random, never derived from the number: a fixed BIN plus
    // a Luhn digit leaves ~10^11 candidates, which is brute-forceable.
    numberRef: `cnr_${randomBytes(8).toString("hex")}`,
    last4: lastFour(cardNumber),
    spendLimit: input.spendLimit,
    spent: 0,
    currency: input.currency,
    status: "active",
    categoryLock: input.categoryLock,
    createdAt,
    events: [{ from: null, to: "active", at: createdAt }],
    requestKey: input.requestKey,
  }

  store.cards.push(card)

  return { card, cardNumber }
}

export type SetStatusResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_transition"; card: Card }

/**
 * `active <-> frozen`, either to `cancelled`, `cancelled` terminal — guarded
 * here, not only in the UI. A same-status request is a no-op success,
 * short-circuited before `canTransition` is asked: it is deliberately
 * strict and returns `false` for `X -> X`.
 */
export function setCardStatus(
  id: string,
  next: CardStatus,
  now: Date,
): SetStatusResult {
  const card = store.cards.find((c) => c.id === id)
  if (!card) return { ok: false, reason: "not_found" }

  if (card.status === next) return { ok: true, card }

  if (!canTransition(card.status, next)) {
    return { ok: false, reason: "invalid_transition", card }
  }

  const event: CardEvent = { from: card.status, to: next, at: now.toISOString() }
  card.status = next
  card.events.push(event)

  return { ok: true, card }
}
