import { DigitSource, generateCardNumber, lastFour } from "@/lib/cards"
import { merchants } from "./merchants"
import {
  Card,
  CardCategory,
  CardEvent,
  CardStatus,
  Currency,
  Dispute,
  Payment,
  PaymentStatus,
  Payout,
  Refund,
} from "./types"

/**
 * Deterministic seed data. Everyone in the room gets identical records,
 * so a bug reproduces the same way on every machine.
 */

const SEED = 20260813
const DAYS = 120
const PAYMENTS_PER_DAY = 14

/** Small, fast, deterministic PRNG. Not for anything that matters. */
function mulberry32(a: number) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(SEED)
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(rand() * items.length)]
const between = (min: number, max: number) =>
  Math.floor(rand() * (max - min + 1)) + min

const DESCRIPTIONS = [
  "Online order",
  "In-store purchase",
  "Subscription renewal",
  "Gift card",
  "Wholesale invoice",
  "Repeat order",
  "Marketplace order",
]

const REASON_CODES = [
  "10.4 Other Fraud",
  "12.6 Duplicate Processing",
  "13.1 Merchandise Not Received",
  "13.3 Not as Described",
  "13.7 Cancelled Merchandise",
]

export const pad = (n: number, width = 6) => String(n).padStart(width, "0")

/** The anchor date. Fixed, so "the last 30 days" is stable across runs. */
export const GENERATED_AT = new Date("2026-08-13T00:00:00.000Z")

function statusFor(): PaymentStatus {
  const roll = rand()
  if (roll < 0.78) return "captured"
  if (roll < 0.86) return "authorized"
  if (roll < 0.93) return "refunded"
  if (roll < 0.98) return "failed"
  return "disputed"
}

export function generate() {
  const payments: Payment[] = []
  const refunds: Refund[] = []
  const disputes: Dispute[] = []
  let paymentSeq = 0
  let refundSeq = 0
  let disputeSeq = 0

  for (let day = DAYS - 1; day >= 0; day--) {
    const dayStart = new Date(GENERATED_AT)
    dayStart.setUTCDate(dayStart.getUTCDate() - day)

    const count = between(PAYMENTS_PER_DAY - 5, PAYMENTS_PER_DAY + 5)

    for (let i = 0; i < count; i++) {
      const merchant = pick(merchants)
      const createdAt = new Date(dayStart)
      createdAt.setUTCHours(between(0, 23), between(0, 59), between(0, 59), 0)

      const status = statusFor()
      const method = rand() < 0.82 ? "card" : rand() < 0.6 ? "wallet" : "bank_transfer"
      const amount = between(450, 480_00)

      const payment: Payment = {
        id: `pay_${pad(++paymentSeq)}`,
        merchantId: merchant.id,
        amount,
        currency: merchant.currency as Currency,
        status,
        method,
        cardBrand:
          method === "card" ? pick(["visa", "mastercard", "amex"] as const) : null,
        last4: method === "card" ? String(between(1000, 9999)) : null,
        createdAt: createdAt.toISOString(),
        description: pick(DESCRIPTIONS),
      }
      payments.push(payment)

      if (status === "refunded") {
        const full = rand() < 0.7
        refunds.push({
          id: `re_${pad(++refundSeq)}`,
          paymentId: payment.id,
          amount: full ? amount : Math.floor(amount / 2),
          currency: payment.currency,
          reason: pick([
            "requested_by_customer",
            "duplicate",
            "fraudulent",
          ] as const),
          createdAt: new Date(
            createdAt.getTime() + between(1, 6) * 86_400_000,
          ).toISOString(),
        })
      }

      if (status === "disputed") {
        const openedAt = new Date(createdAt.getTime() + between(2, 10) * 86_400_000)
        disputes.push({
          id: `dp_${pad(++disputeSeq)}`,
          paymentId: payment.id,
          merchantId: merchant.id,
          amount,
          currency: payment.currency,
          reasonCode: pick(REASON_CODES),
          status: pick([
            "needs_response",
            "needs_response",
            "under_review",
            "won",
            "lost",
          ] as const),
          openedAt: openedAt.toISOString(),
          evidenceDueAt: new Date(
            openedAt.getTime() + 14 * 86_400_000,
          ).toISOString(),
        })
      }
    }
  }

  const payouts = generatePayouts(payments)
  return { payments, refunds, disputes, payouts }
}

const HEX_CHARS = "0123456789abcdef"

/** Deterministic hex, for the seed `numberRef`s. Never `node:crypto` here. */
function seededHex(length: number): string {
  let out = ""
  for (let i = 0; i < length; i++) out += HEX_CHARS[Math.floor(rand() * 16)]
  return out
}

/** Feeds `generateCardNumber` from the seed PRNG, so `generate()` stays reproducible. */
const cardDigitSource: DigitSource = () => Math.floor(rand() * 10)

interface CardSeed {
  merchantId: string
  nickname: string
  categoryLock: CardCategory | null
  /** Integer minor units. */
  spendLimit: number
  /** Integer minor units. Always <= spendLimit. */
  spent: number
  status: CardStatus
  /** Days before GENERATED_AT that the card was issued. */
  issuedDaysAgo: number
}

/**
 * Hand-picked, not randomly assembled: covers every status, every currency in
 * `merchants`, and one card past 80% of its limit so the amber progress bar
 * has something to show. `mch_02`'s card is that one.
 */
const CARD_SEEDS: readonly CardSeed[] = [
  {
    merchantId: "mch_01",
    nickname: "Ops – Software Subscriptions",
    categoryLock: "software",
    spendLimit: 200_000,
    spent: 45_000,
    status: "active",
    issuedDaysAgo: 40,
  },
  {
    merchantId: "mch_02",
    nickname: "Marketing – Paid Ads",
    categoryLock: "advertising",
    spendLimit: 500_000,
    spent: 430_000,
    status: "active",
    issuedDaysAgo: 25,
  },
  {
    merchantId: "mch_04",
    nickname: "EU Travel Desk",
    categoryLock: "travel",
    spendLimit: 300_000,
    spent: 120_000,
    status: "frozen",
    issuedDaysAgo: 60,
  },
  {
    merchantId: "mch_05",
    nickname: "Freelance Design Payouts",
    categoryLock: "contractors",
    spendLimit: 150_000,
    spent: 20_000,
    status: "active",
    issuedDaysAgo: 15,
  },
  {
    merchantId: "mch_06",
    nickname: "Warehouse Utilities",
    categoryLock: "utilities",
    spendLimit: 100_000,
    spent: 60_000,
    status: "cancelled",
    issuedDaysAgo: 90,
  },
  {
    merchantId: "mch_09",
    nickname: "General Ops Card",
    categoryLock: null,
    spendLimit: 250_000,
    spent: 5_000,
    status: "active",
    issuedDaysAgo: 10,
  },
  {
    merchantId: "mch_03",
    nickname: "Reading Room Software",
    categoryLock: "software",
    spendLimit: 400_000,
    spent: 180_000,
    status: "frozen",
    issuedDaysAgo: 50,
  },
]

/**
 * Seed cards for NWP-201: 6-8 cards, spread across merchants, currencies and
 * every `CardStatus`. Deterministic like the rest of `generate()` — the card
 * number comes from `generateCardNumber` fed by the seed PRNG, never from
 * `node:crypto`, so a fresh boot never changes what ops sees.
 */
export function generateCards(): Card[] {
  const cards: Card[] = []

  CARD_SEEDS.forEach((seed, index) => {
    const merchant = merchants.find((m) => m.id === seed.merchantId)
    if (!merchant) {
      throw new Error(`generateCards: unknown seed merchant ${seed.merchantId}`)
    }

    const issuedAt = new Date(GENERATED_AT)
    issuedAt.setUTCDate(issuedAt.getUTCDate() - seed.issuedDaysAgo)
    issuedAt.setUTCHours(between(8, 18), between(0, 59), between(0, 59), 0)

    const events: CardEvent[] = [
      { from: null, to: "active", at: issuedAt.toISOString() },
    ]

    if (seed.status !== "active") {
      const changedAt = new Date(
        issuedAt.getTime() + between(3, 20) * 86_400_000,
      )
      events.push({
        from: "active",
        to: seed.status,
        at: changedAt.toISOString(),
      })
    }

    const cardNumber = generateCardNumber(cardDigitSource)

    cards.push({
      id: `card_${pad(index + 1, 4)}`,
      merchantId: merchant.id,
      nickname: seed.nickname,
      numberRef: `cnr_${seededHex(16)}`,
      last4: lastFour(cardNumber),
      spendLimit: seed.spendLimit,
      spent: seed.spent,
      currency: merchant.currency as Currency,
      status: seed.status,
      categoryLock: seed.categoryLock,
      createdAt: issuedAt.toISOString(),
      events,
      requestKey: null,
    })
  })

  return cards
}

function generatePayouts(payments: Payment[]): Payout[] {
  const payouts: Payout[] = []
  let seq = 0

  for (const merchant of merchants) {
    for (let week = 0; week < 8; week++) {
      const periodEnd = new Date(GENERATED_AT)
      periodEnd.setUTCDate(periodEnd.getUTCDate() - week * 7)
      const periodStart = new Date(periodEnd)
      periodStart.setUTCDate(periodStart.getUTCDate() - 7)

      const inPeriod = payments.filter(
        (p) =>
          p.merchantId === merchant.id &&
          p.status === "captured" &&
          p.createdAt >= periodStart.toISOString() &&
          p.createdAt < periodEnd.toISOString(),
      )
      if (inPeriod.length === 0) continue

      const gross = inPeriod.reduce((sum, p) => sum + p.amount, 0)
      const fees = Math.round(gross * 0.029) + inPeriod.length * 30

      payouts.push({
        id: `po_${pad(++seq, 4)}`,
        merchantId: merchant.id,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        gross,
        fees,
        net: gross - fees,
        currency: merchant.currency,
        status: week === 0 ? "pending" : week === 1 ? "in_transit" : "paid",
        paymentIds: inPeriod.map((p) => p.id),
      })
    }
  }

  return payouts
}
