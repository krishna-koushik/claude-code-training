import { describe, expect, it } from "vitest"
import { Payment } from "./types"
import { sortPayments } from "./queries"

/**
 * `sortPayments` is the one query builder every list, export, and metric
 * goes through. A lexicographic sort on `amount` looks fine for round
 * numbers and quietly breaks the moment a value crosses a digit-count
 * boundary - "900" sorts after "10000" as text.
 */

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay_0001",
    merchantId: "mch_01",
    amount: 0,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt: "2026-01-01T00:00:00.000Z",
    description: "test",
    ...overrides,
  }
}

describe("sortPayments", () => {
  it("sorts amount numerically rather than as text", () => {
    const payments = [
      payment({ id: "ten-thousand", amount: 10_000 }),
      payment({ id: "nine-hundred", amount: 900 }),
      payment({ id: "five-thousand", amount: 5_000 }),
    ]

    expect(sortPayments(payments, "amount", "asc").map((p) => p.id)).toEqual([
      "nine-hundred",
      "five-thousand",
      "ten-thousand",
    ])

    expect(sortPayments(payments, "amount", "desc").map((p) => p.id)).toEqual(
      ["ten-thousand", "five-thousand", "nine-hundred"],
    )
  })

  it("still sorts createdAt lexicographically (ISO strings sort correctly as text)", () => {
    const payments = [
      payment({ id: "later", createdAt: "2026-02-01T00:00:00.000Z" }),
      payment({ id: "earlier", createdAt: "2026-01-01T00:00:00.000Z" }),
    ]

    expect(
      sortPayments(payments, "createdAt", "asc").map((p) => p.id),
    ).toEqual(["earlier", "later"])
  })
})
