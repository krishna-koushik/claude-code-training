import { lastUtcDays, utcDayKey } from "@/lib/dates"
import { GENERATED_AT } from "./generate"
import { store } from "./store"

/**
 * Dashboard metrics. Everything here is reported in USD minor units for the
 * headline figures, because the overview is an internal ops screen rather
 * than a merchant statement.
 */

export interface DailyVolume {
  date: string
  captured: number
  refunded: number
}

export function dailyVolume(days = 30): DailyVolume[] {
  const keys = lastUtcDays(days, GENERATED_AT)
  const buckets = new Map<string, DailyVolume>(
    keys.map((date) => [date, { date, captured: 0, refunded: 0 }]),
  )

  for (const payment of store.payments) {
    // USD only, for the same reason as grossVolume below: the chart renders
    // one currency symbol, so mixing minor units from three currencies into
    // a bucket would draw a number that means nothing.
    if (payment.currency !== "USD") continue

    // Bucket by calendar date.
    const key = utcDayKey(payment.createdAt)
    const bucket = buckets.get(key)
    if (!bucket) continue

    if (payment.status === "captured") {
      bucket.captured += payment.amount
    }
    if (payment.status === "refunded") {
      bucket.refunded += payment.amount
    }
  }

  return keys.map((date) => buckets.get(date)!)
}

export function headlineMetrics() {
  const captured = store.payments.filter((p) => p.status === "captured")
  const refunded = store.payments.filter((p) => p.status === "refunded")

  // Gross volume is USD only. Summing across currencies without converting
  // is a bug even when the number looks right (money.md) - there's no FX
  // rate here, so this stays scoped to the platform's primary currency
  // rather than mixing USD, EUR, and GBP minor units into one meaningless
  // total.
  const grossVolume =
    captured
      .filter((p) => p.currency === "USD")
      .reduce((sum, p) => sum + p.amount, 0) +
    refunded
      .filter((p) => p.currency === "USD")
      .reduce((sum, p) => sum + p.amount, 0)

  const authorized = store.payments.filter(
    (p) => p.status !== "failed",
  ).length
  const authRate = store.payments.length
    ? authorized / store.payments.length
    : 0

  const openDisputes = store.disputes.filter(
    (d) => d.status === "needs_response" || d.status === "under_review",
  )

  return {
    grossVolume,
    authRate,
    paymentCount: store.payments.length,
    // The count spans every currency; a count of disputes is currency-agnostic.
    openDisputes: openDisputes.length,
    // The amount does not. Same rule as grossVolume: USD only, no FX rate here.
    disputedAmount: openDisputes
      .filter((d) => d.currency === "USD")
      .reduce((sum, d) => sum + d.amount, 0),
  }
}
