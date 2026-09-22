import { Button } from "@/components/Button"
import Link from "next/link"

export default function CardNotFound() {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <p className="font-medium text-gray-900 dark:text-gray-50">
        Card not found
      </p>
      <p className="text-sm text-gray-500">
        It may have been removed, or the link is out of date.
      </p>
      <Button variant="secondary" className="py-1.5" asChild>
        <Link href="/cards">Back to cards</Link>
      </Button>
    </div>
  )
}
