"use client"

import { Button } from "@/components/Button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { CardCategory, Card, Currency } from "@/data/types"
import { MAX_SPEND_LIMIT_MINOR_UNITS, NICKNAME_MAX_LENGTH } from "@/lib/cards"
import { CURRENCIES, formatMoney, parseAmountToMinorUnits } from "@/lib/money"
import { Check, Copy, Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"

/**
 * The client's one-shot key for the issue request, so a double submit (a
 * slow network, a second click) returns the already-issued card instead of
 * minting a second one. `crypto.randomUUID` is the Web Crypto API, available
 * in the browser - not `node:crypto`, which this file may never import.
 */
function mintRequestKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `req_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

const CATEGORIES: { value: CardCategory; label: string }[] = [
  { value: "advertising", label: "Advertising" },
  { value: "software", label: "Software" },
  { value: "travel", label: "Travel" },
  { value: "contractors", label: "Contractors" },
  { value: "utilities", label: "Utilities" },
]

type Issued = { card: Card; cardNumber: string | null }

export function IssueCardDrawer({
  merchants,
}: {
  merchants: { id: string; name: string; currency: Currency }[]
}) {
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<"form" | "success">("form")
  const [submitting, setSubmitting] = useState(false)
  const [requestKey, setRequestKey] = useState(() => mintRequestKey())
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)

  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [spendLimitInput, setSpendLimitInput] = useState("")
  const [currency, setCurrency] = useState<Currency | "">("")
  const [categoryLock, setCategoryLock] = useState<CardCategory | "none">(
    "none",
  )
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const nicknameRef = useRef<HTMLInputElement>(null)
  const merchantTriggerRef = useRef<HTMLButtonElement>(null)
  const spendLimitRef = useRef<HTMLInputElement>(null)
  const currencyTriggerRef = useRef<HTMLButtonElement>(null)
  const categoryTriggerRef = useRef<HTMLButtonElement>(null)

  const selectedMerchant = merchants.find((m) => m.id === merchantId)
  const currencyForDisplay: Currency =
    (currency || selectedMerchant?.currency || "USD") as Currency
  const showCurrencyMismatch =
    Boolean(selectedMerchant) &&
    Boolean(currency) &&
    currency !== selectedMerchant?.currency

  const resetFields = () => {
    setNickname("")
    setMerchantId("")
    setSpendLimitInput("")
    setCurrency("")
    setCategoryLock("none")
    setFormError(null)
    setFieldErrors({})
  }

  const handleMerchantChange = (id: string) => {
    setMerchantId(id)
    const merchant = merchants.find((m) => m.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  const focusField = (field: string) => {
    if (field === "nickname") nicknameRef.current?.focus()
    else if (field === "merchantId") merchantTriggerRef.current?.focus()
    else if (field === "spendLimit") spendLimitRef.current?.focus()
    else if (field === "currency") currencyTriggerRef.current?.focus()
    else if (field === "categoryLock") categoryTriggerRef.current?.focus()
  }

  const handleCopy = async () => {
    if (!issued?.cardNumber) return
    try {
      await navigator.clipboard.writeText(issued.cardNumber)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be denied by the browser; the number is still
      // visible on screen to copy by hand.
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError(null)

    const errors: Record<string, string> = {}
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      errors.nickname = "Enter a nickname."
    } else if (trimmedNickname.length > NICKNAME_MAX_LENGTH) {
      errors.nickname = `Nicknames are at most ${NICKNAME_MAX_LENGTH} characters.`
    }

    if (!merchantId) {
      errors.merchantId = "Choose a merchant."
    }

    const minorUnits = parseAmountToMinorUnits(spendLimitInput)
    if (minorUnits === null) {
      errors.spendLimit = "Enter an amount like 250 or 250.00."
    } else if (minorUnits <= 0) {
      errors.spendLimit = "Enter an amount greater than 0."
    } else if (minorUnits > MAX_SPEND_LIMIT_MINOR_UNITS) {
      errors.spendLimit = `Spend limit cannot exceed ${formatMoney(MAX_SPEND_LIMIT_MINOR_UNITS, currencyForDisplay)}.`
    }

    if (!currency) {
      errors.currency = "Choose a currency."
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstField = ["nickname", "merchantId", "spendLimit", "currency"].find(
        (field) => errors[field],
      )
      if (firstField) focusField(firstField)
      return
    }
    if (minorUnits === null || !currency) return // narrows for TS; unreachable given the checks above

    setFieldErrors({})
    setSubmitting(true)
    try {
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: trimmedNickname,
          merchantId,
          spendLimit: minorUnits,
          currency,
          categoryLock: categoryLock === "none" ? null : categoryLock,
          requestKey,
        }),
      })

      if (res.status === 201 || res.status === 200) {
        const body = await res.json()
        setIssued({ card: body.card, cardNumber: body.cardNumber ?? null })
        setPhase("success")
        router.refresh()
        return
      }

      const body = await res.json().catch(() => null)
      const apiError = body?.error
      if (apiError?.field) {
        setFieldErrors({ [apiError.field]: apiError.message })
        focusField(apiError.field)
      } else {
        setFormError(apiError?.message ?? "Could not issue this card. Try again.")
      }
    } catch {
      setFormError(
        "Could not reach the server. Check your connection and try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setIssued(null)
          setPhase("form")
          setCopied(false)
          resetFields()
          setRequestKey(mintRequestKey())
        }
      }}
    >
      <DrawerTrigger asChild>
        <Button variant="primary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>
            {phase === "form" ? "Issue card" : "Card issued"}
          </DrawerTitle>
        </DrawerHeader>

        {phase === "form" ? (
          <form
            onSubmit={handleSubmit}
            noValidate
            className="flex flex-1 flex-col"
          >
            <DrawerBody className="flex flex-1 flex-col gap-4 overflow-y-auto">
              {formError && (
                <p
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-500"
                >
                  {formError}
                </p>
              )}

              <div>
                <label
                  htmlFor="card-nickname"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  ref={nicknameRef}
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={NICKNAME_MAX_LENGTH}
                  hasError={Boolean(fieldErrors.nickname)}
                  aria-invalid={Boolean(fieldErrors.nickname)}
                  aria-describedby={
                    fieldErrors.nickname
                      ? "card-nickname-error"
                      : "card-nickname-help"
                  }
                  className="mt-1"
                />
                <p
                  id="card-nickname-help"
                  className="mt-1 text-xs text-gray-500"
                >
                  What ops calls it. Up to {NICKNAME_MAX_LENGTH} characters.
                </p>
                {fieldErrors.nickname && (
                  <p
                    id="card-nickname-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-500"
                  >
                    {fieldErrors.nickname}
                  </p>
                )}
              </div>

              <div>
                <label
                  id="card-merchant-label"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={handleMerchantChange}>
                  <SelectTrigger
                    ref={merchantTriggerRef}
                    id="card-merchant-trigger"
                    aria-labelledby="card-merchant-label"
                    aria-describedby={
                      fieldErrors.merchantId ? "card-merchant-error" : undefined
                    }
                    hasError={Boolean(fieldErrors.merchantId)}
                    className="mt-1"
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.merchantId && (
                  <p
                    id="card-merchant-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-500"
                  >
                    {fieldErrors.merchantId}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="card-spend-limit"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Spend limit
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="card-spend-limit"
                    ref={spendLimitRef}
                    inputMode="decimal"
                    value={spendLimitInput}
                    onChange={(event) => setSpendLimitInput(event.target.value)}
                    placeholder="250.00"
                    hasError={Boolean(fieldErrors.spendLimit)}
                    aria-invalid={Boolean(fieldErrors.spendLimit)}
                    aria-describedby={
                      fieldErrors.spendLimit
                        ? "card-spend-limit-error"
                        : "card-spend-limit-help"
                    }
                  />
                  <span className="text-sm text-gray-500">
                    {currency || selectedMerchant?.currency || ""}
                  </span>
                </div>
                <p
                  id="card-spend-limit-help"
                  className="mt-1 text-xs text-gray-500"
                >
                  Up to {formatMoney(MAX_SPEND_LIMIT_MINOR_UNITS, currencyForDisplay)}{" "}
                  without extra approval.
                </p>
                {fieldErrors.spendLimit && (
                  <p
                    id="card-spend-limit-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-500"
                  >
                    {fieldErrors.spendLimit}
                  </p>
                )}
              </div>

              <div>
                <label
                  id="card-currency-label"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Currency
                </label>
                <Select
                  value={currency || undefined}
                  onValueChange={(value) => setCurrency(value as Currency)}
                >
                  <SelectTrigger
                    ref={currencyTriggerRef}
                    id="card-currency-trigger"
                    aria-labelledby="card-currency-label"
                    aria-describedby={
                      fieldErrors.currency
                        ? "card-currency-error"
                        : showCurrencyMismatch
                          ? "card-currency-note"
                          : undefined
                    }
                    hasError={Boolean(fieldErrors.currency)}
                    className="mt-1"
                  >
                    <SelectValue placeholder="Choose a currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fieldErrors.currency && (
                  <p
                    id="card-currency-error"
                    role="alert"
                    className="mt-1 text-sm text-red-600 dark:text-red-500"
                  >
                    {fieldErrors.currency}
                  </p>
                )}
                {!fieldErrors.currency && showCurrencyMismatch && selectedMerchant && (
                  <p
                    id="card-currency-note"
                    className="mt-1 text-sm text-amber-600 dark:text-amber-500"
                  >
                    {selectedMerchant.name} settles in {selectedMerchant.currency}.
                    This card will be issued in {currency}.
                  </p>
                )}
              </div>

              <div>
                <label
                  id="card-category-label"
                  className="text-sm font-medium text-gray-900 dark:text-gray-50"
                >
                  Category lock
                </label>
                <Select
                  value={categoryLock}
                  onValueChange={(value) =>
                    setCategoryLock(value as CardCategory | "none")
                  }
                >
                  <SelectTrigger
                    ref={categoryTriggerRef}
                    id="card-category-trigger"
                    aria-labelledby="card-category-label"
                    aria-describedby="card-category-help"
                    className="mt-1"
                  >
                    <SelectValue placeholder="No lock" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lock</SelectItem>
                    {CATEGORIES.map((category) => (
                      <SelectItem key={category.value} value={category.value}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p id="card-category-help" className="mt-1 text-xs text-gray-500">
                  What the card may be spent on. Not editable after issue.
                </p>
              </div>
            </DrawerBody>
            <DrawerFooter>
              <Button
                type="submit"
                isLoading={submitting}
                loadingText="Issuing…"
                disabled={submitting}
              >
                Issue card
              </Button>
            </DrawerFooter>
          </form>
        ) : (
          <>
            <DrawerBody className="flex flex-1 flex-col gap-4">
              <div role="status" aria-live="polite">
                {issued?.cardNumber ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-gray-900 dark:text-gray-50">
                      This is the only time this number will be shown. Copy it
                      now.
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-lg tracking-widest text-gray-900 dark:text-gray-50">
                        {issued.cardNumber}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        className="gap-1.5 py-1.5"
                        onClick={handleCopy}
                      >
                        {copied ? (
                          <>
                            <Check className="size-4 shrink-0" aria-hidden="true" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="size-4 shrink-0" aria-hidden="true" />
                            Copy
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-sm text-gray-500">
                      {issued.card.nickname} ·{" "}
                      {formatMoney(issued.card.spendLimit, issued.card.currency)}{" "}
                      limit
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-900 dark:text-gray-50">
                    This card was already issued. Its number was shown once and
                    cannot be shown again.
                  </p>
                )}
              </div>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose asChild>
                <Button variant="secondary" className="py-1.5">
                  Done
                </Button>
              </DrawerClose>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
