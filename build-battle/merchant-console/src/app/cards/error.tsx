"use client"

import { Button } from "@/components/Button"
import { useEffect } from "react"

export default function CardsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="font-medium text-gray-900 dark:text-gray-50">
        Something went wrong loading cards.
      </p>
      <p className="text-sm text-gray-500">
        Try again, or come back in a moment.
      </p>
      <Button variant="secondary" className="py-1.5" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
