export type Currency = "USD" | "EUR" | "GBP"

export type PaymentStatus =
  | "authorized"
  | "captured"
  | "refunded"
  | "failed"
  | "disputed"

export type DisputeStatus = "needs_response" | "under_review" | "won" | "lost"

export type PayoutStatus = "paid" | "in_transit" | "pending"

export interface Merchant {
  id: string
  name: string
  country: string
  /** IANA timezone. Display converts to this; storage never does. */
  timezone: string
  currency: Currency
  riskTier: "low" | "standard" | "elevated"
}

export interface Payment {
  id: string
  merchantId: string
  /** Integer minor units. Never a float. */
  amount: number
  currency: Currency
  status: PaymentStatus
  method: "card" | "wallet" | "bank_transfer"
  cardBrand: "visa" | "mastercard" | "amex" | null
  last4: string | null
  /** ISO 8601, always UTC. */
  createdAt: string
  description: string
}

export interface Refund {
  id: string
  paymentId: string
  amount: number
  currency: Currency
  reason: "requested_by_customer" | "duplicate" | "fraudulent"
  createdAt: string
}

export interface Dispute {
  id: string
  paymentId: string
  merchantId: string
  amount: number
  currency: Currency
  reasonCode: string
  status: DisputeStatus
  openedAt: string
  /** Evidence deadline, UTC. */
  evidenceDueAt: string
}

export interface Payout {
  id: string
  merchantId: string
  periodStart: string
  periodEnd: string
  gross: number
  fees: number
  net: number
  currency: Currency
  status: PayoutStatus
  paymentIds: string[]
}

export interface PaymentFilters {
  status?: PaymentStatus | "all"
  merchantId?: string
  search?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
  sort?: "createdAt" | "amount"
  direction?: "asc" | "desc"
}

export type CardStatus = "active" | "frozen" | "cancelled"

/** What a card may be spent on. Chosen at issue; not editable (NWP-202). */
export type CardCategory =
  | "advertising"
  | "software"
  | "travel"
  | "contractors"
  | "utilities"

/** One entry in a card's status history. Append-only. */
export interface CardEvent {
  /** Null on issue; otherwise the status the card left. */
  from: CardStatus | null
  to: CardStatus
  /** ISO 8601, always UTC. */
  at: string
}

export interface Card {
  id: string
  merchantId: string
  /** What ops calls it. Trimmed, 1-48 characters. */
  nickname: string
  /**
   * Opaque handle for the generated number. Independently random - never
   * derived from it, because a fixed BIN plus a Luhn digit leaves few enough
   * candidates that a hash would be reversible.
   */
  numberRef: string
  /** Last four of the generated number. The only digits kept. */
  last4: string
  /** Integer minor units. Never a float. */
  spendLimit: number
  /** Integer minor units, in `currency`. Authorizations are not modelled yet. */
  spent: number
  currency: Currency
  status: CardStatus
  categoryLock: CardCategory | null
  /** ISO 8601, always UTC. */
  createdAt: string
  /** Status history, oldest first. Starts with the issue event. */
  events: CardEvent[]
  /**
   * The client's one-shot key for the issue request, so a double submit
   * returns this card instead of issuing a second one.
   */
  requestKey: string | null
}

export interface CardFilters {
  status?: CardStatus | "all"
  merchantId?: string
  page?: number
  pageSize?: number
}
