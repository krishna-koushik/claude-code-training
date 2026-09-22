import { Button } from "@/components/Button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from "@/components/Table"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { queryCards } from "@/data/cards"
import { maskCardNumber } from "@/data/card-number"
import { merchantById, merchants } from "@/data/merchants"
import { CardFilters, CardStatus } from "@/data/types"
import { formatDate } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import Link from "next/link"
import { CardStatusActions } from "./card-status-actions"
import { CardsFilterBar } from "./filter-bar"
import { IssueCardDrawer } from "./issue-card-drawer"

const STATUSES: (CardStatus | "all")[] = ["all", "active", "frozen", "cancelled"]

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const filtersActive = Boolean(
    (params.status && params.status !== "all") || params.merchantId,
  )

  const filters: CardFilters = {
    status: (STATUSES.includes(params.status as CardStatus)
      ? params.status
      : "all") as CardFilters["status"],
    merchantId: params.merchantId || undefined,
    page: Number(params.page ?? "1") || 1,
  }

  const { rows, total, page, pageCount } = queryCards(filters)
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => Boolean(v)) as [string, string][],
  )

  const pageHref = (next: number) => {
    const q = new URLSearchParams(query)
    q.set("page", String(next))
    return `/cards?${q.toString()}`
  }

  return (
    <section aria-label="Cards">
      <div className="flex flex-col justify-between gap-2 px-4 py-6 sm:flex-row sm:items-center sm:p-6">
        <CardsFilterBar
          statuses={STATUSES}
          merchants={merchants.map((m) => ({ id: m.id, name: m.name }))}
          current={{
            status: (filters.status as string) ?? "all",
            merchantId: filters.merchantId ?? "",
          }}
        />
        <IssueCardDrawer
          merchants={merchants.map((m) => ({
            id: m.id,
            name: m.name,
            currency: m.currency,
          }))}
        />
      </div>

      <TableRoot className="border-t border-gray-200 dark:border-gray-800">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Card</TableHeaderCell>
              <TableHeaderCell>Nickname</TableHeaderCell>
              <TableHeaderCell>Merchant</TableHeaderCell>
              <TableHeaderCell>Number</TableHeaderCell>
              <TableHeaderCell className="text-right">Limit</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-16 text-center">
                  {filtersActive ? (
                    <>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        No cards match these filters
                      </p>
                      <p className="mt-1 text-gray-500">
                        Clear the search or pick a different status.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="font-medium text-gray-900 dark:text-gray-50">
                        No cards issued yet
                      </p>
                      <p className="mt-1 text-gray-500">
                        Issue the first one with the button above.
                      </p>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )}
            {rows.map((card) => {
              const merchant = merchantById(card.merchantId)
              return (
                <TableRow key={card.id}>
                  <TableCell>
                    <Link
                      href={`/cards/${card.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-500"
                    >
                      {card.id}
                    </Link>
                  </TableCell>
                  <TableCell>{card.nickname}</TableCell>
                  <TableCell>{merchant?.name}</TableCell>
                  <TableCell>
                    <span className="font-mono tabular-nums">
                      {maskCardNumber(card.last4)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-50">
                    {formatMoney(card.spendLimit, card.currency)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={card.status} />
                  </TableCell>
                  <TableCell>{formatDate(card.createdAt)}</TableCell>
                  <TableCell>
                    <CardStatusActions cardId={card.id} status={card.status} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableRoot>

      <div className="flex items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <p className="text-sm text-gray-500">
          {total.toLocaleString()} cards · page {page} of {pageCount}
        </p>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="py-1.5"
            disabled={page <= 1}
            asChild={page > 1}
          >
            {page > 1 ? <Link href={pageHref(page - 1)}>Previous</Link> : <span>Previous</span>}
          </Button>
          <Button
            variant="secondary"
            className="py-1.5"
            disabled={page >= pageCount}
            asChild={page < pageCount}
          >
            {page < pageCount ? <Link href={pageHref(page + 1)}>Next</Link> : <span>Next</span>}
          </Button>
        </div>
      </div>
    </section>
  )
}
