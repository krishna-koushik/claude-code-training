import { afterEach, describe, expect, it } from "vitest"
import { GENERATED_AT } from "./generate"
import { dailyVolume, headlineMetrics } from "./metrics"
import { store } from "./store"
import { Dispute, Payment } from "./types"

/**
 * `store.payments` is a singleton shared by every test in this file (each
 * test file gets its own module registry under vitest's default isolation,
 * but tests within a file share it) - every test below swaps it out for a
 * small fixture set and restores the original afterwards.
 */

let counter = 0
function payment(overrides: Partial<Payment> = {}): Payment {
  counter += 1
  return {
    id: `pay_fixture_${counter}`,
    merchantId: "mch_01",
    amount: 1_000,
    currency: "USD",
    status: "captured",
    method: "card",
    cardBrand: "visa",
    last4: "4242",
    createdAt: GENERATED_AT.toISOString(),
    description: "test fixture",
    ...overrides,
  }
}

let disputeCounter = 0
function dispute(overrides: Partial<Dispute> = {}): Dispute {
  disputeCounter += 1
  return {
    id: `dp_fixture_${disputeCounter}`,
    paymentId: "pay_fixture_0",
    merchantId: "mch_01",
    amount: 1_000,
    currency: "USD",
    reasonCode: "10.4 Other Fraud",
    status: "needs_response",
    openedAt: GENERATED_AT.toISOString(),
    evidenceDueAt: GENERATED_AT.toISOString(),
    ...overrides,
  }
}

describe("dailyVolume", () => {
  const originalPayments = store.payments
  const originalTz = process.env.TZ

  afterEach(() => {
    store.payments = originalPayments
    process.env.TZ = originalTz
  })

  it("buckets by the UTC calendar day, not the server's local day", () => {
    // The server's local timezone must never affect bucketing (CLAUDE.md:
    // "Storage and bucketing are UTC"). Force a non-UTC TZ so the test
    // fails regardless of what timezone it happens to run in.
    process.env.TZ = "America/New_York"

    store.payments = [
      // 02:00 UTC on Aug 2 is still 22:00 on Aug 1 in New York. A local-time
      // bucketer files this under Aug 1; the UTC calendar day is Aug 2.
      payment({
        amount: 5_000,
        status: "captured",
        createdAt: "2026-08-02T02:00:00.000Z",
      }),
    ]

    const days = dailyVolume(15)
    const aug1 = days.find((d) => d.date === "2026-08-01")
    const aug2 = days.find((d) => d.date === "2026-08-02")

    expect(aug1).toBeDefined()
    expect(aug2).toBeDefined()
    expect(aug2!.captured).toBe(5_000)
    expect(aug1!.captured).toBe(0)
  })

  it("accumulates minor units exactly instead of drifting through a float", () => {
    // A single payment, or a realistic day of them, never drifts far enough
    // for Math.round to disagree with the exact total - that's exactly why
    // this bug went unnoticed. The drift only becomes visible once the
    // running float total is large enough that each `+=` rounds off real
    // cents. These numbers are chosen purely to cross that threshold in as
    // few records as possible; they are not meant to look like a real
    // payment.
    const amount = 10_000_000_000_001
    const count = 50

    store.payments = Array.from({ length: count }, () =>
      payment({ amount, status: "captured", createdAt: GENERATED_AT.toISOString() }),
    )

    const days = dailyVolume(1)
    expect(days).toHaveLength(1)
    expect(days[0].captured).toBe(amount * count)
  })

  it("buckets USD only, so the chart's single currency symbol stays honest", () => {
    store.payments = [
      payment({ amount: 10_000, currency: "USD", status: "captured" }),
      payment({ amount: 2_000, currency: "USD", status: "refunded" }),
      // Minor units in another currency. The chart renders one `$`, so
      // folding these in would draw a number that totals nothing real.
      payment({ amount: 999_999, currency: "EUR", status: "captured" }),
      payment({ amount: 888_888, currency: "GBP", status: "refunded" }),
    ]

    const days = dailyVolume(1)
    expect(days[0].captured).toBe(10_000)
    expect(days[0].refunded).toBe(2_000)
  })
})

describe("headlineMetrics", () => {
  const originalPayments = store.payments

  afterEach(() => {
    store.payments = originalPayments
  })

  it("scopes gross volume to USD instead of summing currencies together", () => {
    store.payments = [
      payment({ amount: 10_000, currency: "USD", status: "captured" }),
      payment({ amount: 5_000, currency: "USD", status: "refunded" }),
      // Every amount below is minor units in its own currency - adding them
      // to the USD total the way the old code did produces a number that
      // isn't a total of anything real (money.md).
      payment({ amount: 999_999, currency: "EUR", status: "captured" }),
      payment({ amount: 999_999, currency: "GBP", status: "captured" }),
      payment({ amount: 250, currency: "GBP", status: "refunded" }),
    ]

    expect(headlineMetrics().grossVolume).toBe(15_000)
  })

  it("scopes the disputed amount to USD but counts disputes in every currency", () => {
    const originalDisputes = store.disputes
    store.payments = []
    store.disputes = [
      dispute({ amount: 20_000, currency: "USD" }),
      dispute({ amount: 30_000, currency: "USD" }),
      // Open, and so counted - but its minor units belong to another
      // currency and must not land in a figure rendered with a $.
      dispute({ amount: 999_999, currency: "EUR" }),
      // Closed, so neither counted nor summed.
      dispute({ amount: 777_777, currency: "USD", status: "won" }),
    ]

    const metrics = headlineMetrics()
    expect(metrics.disputedAmount).toBe(50_000)
    expect(metrics.openDisputes).toBe(3)

    store.disputes = originalDisputes
  })
})
