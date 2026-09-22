"use client"

import { Button } from "@/components/Button"
import { allowedTransitions } from "@/lib/cards"
import { CardStatus } from "@/data/types"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

/**
 * The label describes the status the card is MOVING TO, so "frozen" reads as
 * the "Freeze" action and "active" reads as "Unfreeze". Cancel gets its own
 * two-step inline confirm below rather than a label lookup.
 */
const ACTION_LABELS: Partial<Record<CardStatus, string>> = {
  active: "Unfreeze",
  frozen: "Freeze",
}

export function CardStatusActions({
  cardId,
  status,
}: {
  cardId: string
  status: CardStatus
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [submitting, setSubmitting] = useState(false)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const targets = allowedTransitions(status)

  if (targets.length === 0) return null

  const applyStatus = async (next: CardStatus) => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(
          body?.error?.message ?? "Could not update this card. Try again.",
        )
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError("Could not reach the server. Check your connection and try again.")
    } finally {
      setSubmitting(false)
      setConfirmingCancel(false)
    }
  }

  const busy = submitting || isPending

  return (
    <div className="flex flex-wrap items-center gap-2">
      {targets.map((next) =>
        next === "cancelled" ? (
          <Button
            key={next}
            type="button"
            variant="destructive"
            className="py-1.5"
            disabled={busy}
            onClick={() => {
              if (confirmingCancel) {
                void applyStatus("cancelled")
              } else {
                setConfirmingCancel(true)
              }
            }}
            onBlur={() => setConfirmingCancel(false)}
          >
            {confirmingCancel ? "Confirm cancel" : "Cancel card"}
          </Button>
        ) : (
          <Button
            key={next}
            type="button"
            variant="secondary"
            className="py-1.5"
            disabled={busy}
            onClick={() => void applyStatus(next)}
          >
            {ACTION_LABELS[next] ?? next}
          </Button>
        ),
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      )}
    </div>
  )
}
