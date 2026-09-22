import { Divider } from "@/components/Divider"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardCategory, Currency } from "@/data/types"
import { maskCardNumber } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardStatusActions } from "../card-status-actions"

const CATEGORY_LABELS: Record<CardCategory, string> = {
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
  utilities: "Utilities",
}

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)!

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
          {card.nickname}
        </h1>
        <span className="font-mono text-sm text-gray-500">
          {maskCardNumber(card.last4)}
        </span>
        <StatusBadge status={card.status} />
      </div>
      <p className="mt-1 font-mono text-sm text-gray-500">{card.id}</p>

      <div className="mt-4">
        <CardStatusActions cardId={card.id} status={card.status} />
      </div>

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant.name}
          <span className="ml-2 text-gray-500">{merchant.country}</span>
        </Field>
        <Field label="Spend limit">
          {formatMoney(card.spendLimit, card.currency)}
        </Field>
        <Field label="Category lock">
          {card.categoryLock ? CATEGORY_LABELS[card.categoryLock] : "None"}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        <Field label={`Created (${merchant.timezone})`}>
          {formatInZone(card.createdAt, merchant.timezone)}
        </Field>
      </dl>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Spend
      </h2>
      <div className="mt-4">
        <SpendProgress
          spent={card.spent}
          limit={card.spendLimit}
          currency={card.currency}
        />
      </div>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Timeline
      </h2>
      <ol className="mt-4 space-y-4">
        {card.events.map((entry, index) => (
          <li key={index} className="flex gap-3">
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-500"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-50">
                {entry.from === null
                  ? "Card issued"
                  : `Status changed to ${capitalize(entry.to)}`}
              </p>
              <p className="text-sm text-gray-500">
                {formatInZone(entry.at, merchant.timezone)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * `<progress value max>` needs no inline style and is natively accessible,
 * unlike a dynamic arbitrary Tailwind class (`w-[${pct}%]`), which the
 * scanner cannot see and silently renders zero width. The bar's `value` is
 * clamped to `limit` so the rendered width never exceeds 100%, while the
 * text next to it always shows the true, uncapped percentage.
 */
function SpendProgress({
  spent,
  limit,
  currency,
}: {
  spent: number
  limit: number
  currency: Currency
}) {
  if (spent === 0) {
    return <p className="text-sm text-gray-500">No spend yet.</p>
  }

  if (limit <= 0) {
    return (
      <p className="text-sm text-gray-900 dark:text-gray-50">
        {formatMoney(spent, currency)} spent · no spend limit set
      </p>
    )
  }

  // Integer comparison on purpose: comparing a rounded display percentage
  // (e.g. 79.6% -> "80%") would flip the bar amber a shade early.
  const isAmber = spent * 5 >= limit * 4
  const truePercent = Math.round((spent / limit) * 100)
  const barValue = Math.min(spent, limit)

  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-gray-900 dark:text-gray-50">
          {formatMoney(spent, currency)} of {formatMoney(limit, currency)}
        </span>
        <span className="text-gray-500">{truePercent}%</span>
      </div>
      <progress
        value={barValue}
        max={limit}
        aria-label="Card spend progress"
        className={cx(
          "mt-2 h-2 w-full overflow-hidden rounded-full",
          "[&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full",
          "[&::-webkit-progress-bar]:bg-gray-100 dark:[&::-webkit-progress-bar]:bg-gray-800",
          isAmber
            ? "[&::-webkit-progress-value]:bg-amber-500 [&::-moz-progress-bar]:bg-amber-500"
            : "[&::-webkit-progress-value]:bg-blue-500 [&::-moz-progress-bar]:bg-blue-500",
        )}
      />
      {spent > limit && (
        <p className="mt-1 text-sm text-amber-600 dark:text-amber-500">
          Over limit
        </p>
      )}
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">{children}</dd>
    </div>
  )
}
