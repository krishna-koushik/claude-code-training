import { CardCategory, CardStatus } from "./types"

/**
 * Card status state machine and type guards. Isomorphic on purpose: the
 * freeze/unfreeze controls are a client component and import the transition
 * table from here, so this module must never reach for `node:crypto` or the
 * store. Server-only card work lives in `src/data/cards.ts`; PAN generation
 * and masking live in `src/data/card-number.ts`.
 */

const CARD_STATUSES: readonly CardStatus[] = ["active", "frozen", "cancelled"]

export function isCardStatus(value: unknown): value is CardStatus {
  return typeof value === "string" && (CARD_STATUSES as readonly string[]).includes(value)
}

const CARD_CATEGORIES: readonly CardCategory[] = [
  "advertising",
  "software",
  "travel",
  "contractors",
  "utilities",
]

export function isCardCategory(value: unknown): value is CardCategory {
  return typeof value === "string" && (CARD_CATEGORIES as readonly string[]).includes(value)
}

/**
 * `active <-> frozen`, either to `cancelled`, `cancelled` terminal. A no-op
 * is not a transition, so same-status pairs are absent from every list below.
 */
const ALLOWED_TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

/**
 * Strict: a no-op is not a transition, so `active -> active` is false.
 * Route handlers short-circuit a same-status request before asking.
 */
export function canTransition(current: CardStatus, next: CardStatus): boolean {
  return ALLOWED_TRANSITIONS[current].includes(next)
}

/** The moves ops may make from here. Drives which buttons render. */
export function allowedTransitions(current: CardStatus): readonly CardStatus[] {
  return ALLOWED_TRANSITIONS[current]
}
