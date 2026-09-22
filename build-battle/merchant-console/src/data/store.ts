import { generate, generateCards } from "./generate"
import { merchants } from "./merchants"
import { Card, Dispute, Payment, Payout, Refund } from "./types"

/**
 * In-memory store.
 *
 * Data is generated once at boot and lives for the life of the process.
 * Writes survive the session and vanish on restart. That is deliberate:
 * persistence is NWP-203 and is out of scope for workshop exercises.
 *
 * Held on globalThis so the Next.js dev server's module reloading does not
 * hand every request a fresh copy.
 */

interface Store {
  merchants: typeof merchants
  payments: Payment[]
  refunds: Refund[]
  disputes: Dispute[]
  payouts: Payout[]
  cards: Card[]
}

declare global {
  // eslint-disable-next-line no-var
  var __northwindStore: Store | undefined
}

function createStore(): Store {
  const { payments, refunds, disputes, payouts } = generate()
  const cards = generateCards()
  return { merchants, payments, refunds, disputes, payouts, cards }
}

export const store: Store = globalThis.__northwindStore ?? createStore()

// NWP-201 added `cards` after some dev servers already pinned a store on
// globalThis. Without a restart, `createStore()` never re-runs and the pinned
// store has no `cards` key even though the `Store` type promises one — guard
// so a hot-reloaded dev server doesn't crash on `store.cards.push(...)`.
// A real restart still runs `createStore()` and never needs this.
store.cards ??= []

if (process.env.NODE_ENV !== "production") {
  globalThis.__northwindStore = store
}
