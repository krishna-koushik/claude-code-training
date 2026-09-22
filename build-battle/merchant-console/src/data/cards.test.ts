import { describe, expect, it } from "vitest"
import { MAX_SPEND_LIMIT_MINOR_UNITS } from "./card-number"
import {
  IssueCardInput,
  cardById,
  issueCard,
  setCardStatus,
  validateIssueCard,
} from "./cards"
import { merchants } from "./merchants"
import { store } from "./store"

/**
 * `NODE_ENV=test` pins one store on `globalThis`, so every test in this file
 * shares it with every other test in the process. Assertions here are on
 * returned objects and on deltas, never on absolute counts or `store.cards[0]`.
 */

const merchant = merchants[0]

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    merchantId: merchant.id,
    nickname: "Ops Card",
    spendLimit: 10_000,
    currency: "USD",
    ...overrides,
  }
}

function issueValid(overrides: Record<string, unknown> = {}, now = new Date()) {
  const result = validateIssueCard(validBody(overrides))
  if (!result.ok) throw new Error("expected a valid body in this helper")
  return issueCard(result.value as IssueCardInput, now)
}

describe("validateIssueCard", () => {
  it("rejects a body that is not a JSON object", () => {
    expect(validateIssueCard(null).ok).toBe(false)
    expect(validateIssueCard([1, 2, 3]).ok).toBe(false)
    expect(validateIssueCard("hello").ok).toBe(false)
    expect(validateIssueCard(42).ok).toBe(false)
    expect(validateIssueCard(true).ok).toBe(false)
  })

  it("rejects a missing merchantId", () => {
    const result = validateIssueCard(validBody({ merchantId: undefined }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("merchantId")
  })

  it("rejects a well-formed but nonexistent merchantId with 400, not 404", () => {
    const result = validateIssueCard(validBody({ merchantId: "mch_does_not_exist" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("merchantId")
  })

  it("rejects a non-integer spendLimit", () => {
    const result = validateIssueCard(validBody({ spendLimit: 250.5 }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("spendLimit")
  })

  it("rejects a spendLimit of zero or below", () => {
    expect(validateIssueCard(validBody({ spendLimit: 0 })).ok).toBe(false)
    expect(validateIssueCard(validBody({ spendLimit: -100 })).ok).toBe(false)
  })

  it("rejects a spendLimit above the ceiling", () => {
    const result = validateIssueCard(
      validBody({ spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS + 1 }),
    )
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("spendLimit")
  })

  it("rejects NaN, Infinity, and a boolean masquerading as a number", () => {
    expect(validateIssueCard(validBody({ spendLimit: NaN })).ok).toBe(false)
    expect(validateIssueCard(validBody({ spendLimit: Infinity })).ok).toBe(false)
    expect(validateIssueCard(validBody({ spendLimit: true })).ok).toBe(false)
  })

  it("accepts a spendLimit of exactly the ceiling", () => {
    const result = validateIssueCard(
      validBody({ spendLimit: MAX_SPEND_LIMIT_MINOR_UNITS }),
    )
    expect(result.ok).toBe(true)
  })

  it("accepts a spendLimit of 1", () => {
    const result = validateIssueCard(validBody({ spendLimit: 1 }))
    expect(result.ok).toBe(true)
  })

  it("rejects a currency outside USD/EUR/GBP", () => {
    const result = validateIssueCard(validBody({ currency: "JPY" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("currency")
  })

  it("rejects a lowercase currency code", () => {
    const result = validateIssueCard(validBody({ currency: "usd" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("currency")
  })

  it("rejects an unknown categoryLock", () => {
    const result = validateIssueCard(validBody({ categoryLock: "shopping" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("categoryLock")
  })

  it("accepts a null or absent categoryLock", () => {
    expect(validateIssueCard(validBody({ categoryLock: null })).ok).toBe(true)
    expect(validateIssueCard(validBody()).ok).toBe(true)
  })

  it("rejects a nickname that is empty or whitespace after trimming", () => {
    expect(validateIssueCard(validBody({ nickname: "" })).ok).toBe(false)
    expect(validateIssueCard(validBody({ nickname: "   " })).ok).toBe(false)
  })

  it("rejects a nickname longer than 48 characters", () => {
    const result = validateIssueCard(validBody({ nickname: "x".repeat(49) }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("nickname")
  })

  it("accepts a nickname of exactly 48 characters", () => {
    const result = validateIssueCard(validBody({ nickname: "x".repeat(48) }))
    expect(result.ok).toBe(true)
  })
})

describe("issueCard", () => {
  it("never puts the full number on the card record", () => {
    const result = issueValid()
    expect("cardNumber" in result.card).toBe(false)
  })

  it("keeps last4 consistent with the revealed number", () => {
    const result = issueValid()
    if ("replayed" in result) throw new Error("expected a fresh issue")
    expect(result.card.last4).toBe(result.cardNumber.slice(-4))
  })

  it("issues active with exactly one event, from null", () => {
    const result = issueValid()
    expect(result.card.status).toBe("active")
    expect(result.card.events).toHaveLength(1)
    expect(result.card.events[0]).toMatchObject({ from: null, to: "active" })
  })

  it("writes createdAt from the injected clock, not wall-clock time", () => {
    const now = new Date("2026-01-01T00:00:00.000Z")
    const result = issueValid({}, now)
    expect(result.card.createdAt).toBe("2026-01-01T00:00:00.000Z")
    expect(result.card.events[0].at).toBe("2026-01-01T00:00:00.000Z")
  })

  it("gives two consecutive issues different ids", () => {
    const first = issueValid()
    const second = issueValid()
    expect(first.card.id).not.toBe(second.card.id)
  })

  it("replays a matching requestKey instead of issuing a second card", () => {
    const key = `test-key-${Date.now()}-${Math.random()}`
    const before = store.cards.length

    const first = issueValid({ requestKey: key })
    const second = issueValid({ requestKey: key })

    expect(store.cards.length).toBe(before + 1)
    expect("replayed" in second).toBe(true)
    expect(second.card.id).toBe(first.card.id)
    expect("cardNumber" in second).toBe(false)
  })

  it("appends exactly one card to the store per fresh issue", () => {
    const before = store.cards.length
    issueValid()
    expect(store.cards.length).toBe(before + 1)
  })
})

describe("issueCard currency verification", () => {
  it("rejects a currency that differs from the merchant's settlement currency", () => {
    // merchant (mch_01) settles in USD; requesting EUR must be rejected.
    const result = validateIssueCard(validBody({ currency: "EUR" }))
    expect(result.ok).toBe(false)
    expect(!result.ok && result.field).toBe("currency")
  })

  it("validates and issues normally when the currency matches the merchant's", () => {
    // validBody() defaults to USD, and merchant (mch_01) settles in USD too.
    const result = issueValid()
    expect("cardNumber" in result).toBe(true)
    expect(result.card.status).toBe("active")
    expect(result.card.currency).toBe("USD")
  })
})

describe("setCardStatus", () => {
  it("moves active -> frozen and appends an event", () => {
    const issued = issueValid()
    const before = issued.card.events.length

    const result = setCardStatus(issued.card.id, "frozen", new Date())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.card.status).toBe("frozen")
      expect(result.card.events.length).toBe(before + 1)
      expect(result.card.events.at(-1)).toMatchObject({
        from: "active",
        to: "frozen",
      })
    }
  })

  it("no-ops on a same-status request without appending an event", () => {
    const issued = issueValid()
    const before = issued.card.events.length

    const result = setCardStatus(issued.card.id, "active", new Date())

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.card.events.length).toBe(before)
    }
  })

  it("rejects any transition off a cancelled card", () => {
    const issued = issueValid()
    setCardStatus(issued.card.id, "cancelled", new Date())

    const before = cardById(issued.card.id)
    const beforeStatus = before?.status
    const beforeEventCount = before?.events.length ?? 0

    const result = setCardStatus(issued.card.id, "active", new Date())

    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe("invalid_transition")

    const after = cardById(issued.card.id)
    expect(after?.status).toBe(beforeStatus)
    expect(after?.events.length).toBe(beforeEventCount)
  })

  it("returns not_found for an unknown id", () => {
    const result = setCardStatus("card_does_not_exist", "frozen", new Date())
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toBe("not_found")
  })
})

describe("cardById", () => {
  it("finds a card just issued and returns null for an unknown id", () => {
    const issued = issueValid()
    expect(cardById(issued.card.id)?.id).toBe(issued.card.id)
    expect(cardById("card_does_not_exist")).toBeNull()
  })
})
