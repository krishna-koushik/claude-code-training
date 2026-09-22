"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { useRouter } from "next/navigation"

const LABELS: Record<string, string> = {
  all: "All statuses",
  active: "Active",
  frozen: "Frozen",
  cancelled: "Cancelled",
}

export function CardsFilterBar({
  statuses,
  merchants,
  current,
}: {
  statuses: string[]
  merchants: { id: string; name: string }[]
  current: { status: string; merchantId: string }
}) {
  const router = useRouter()

  const apply = (changes: Record<string, string>) => {
    const next = new URLSearchParams()
    const merged = { ...current, ...changes }
    if (merged.status && merged.status !== "all") next.set("status", merged.status)
    if (merged.merchantId) next.set("merchantId", merged.merchantId)
    router.push(`/cards?${next.toString()}`)
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div>
        <label id="cards-status-label" className="sr-only">
          Status
        </label>
        <Select
          value={current.status || "all"}
          onValueChange={(status) => apply({ status })}
        >
          <SelectTrigger
            id="cards-status-trigger"
            aria-labelledby="cards-status-label"
            className="w-full py-1.5 sm:w-40"
          >
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent align="end">
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {LABELS[status] ?? status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <label id="cards-merchant-label" className="sr-only">
          Merchant
        </label>
        <Select
          value={current.merchantId || "all"}
          onValueChange={(merchantId) =>
            apply({ merchantId: merchantId === "all" ? "" : merchantId })
          }
        >
          <SelectTrigger
            id="cards-merchant-trigger"
            aria-labelledby="cards-merchant-label"
            className="w-full py-1.5 sm:w-52"
          >
            <SelectValue placeholder="All merchants" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All merchants</SelectItem>
            {merchants.map((merchant) => (
              <SelectItem key={merchant.id} value={merchant.id}>
                {merchant.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
