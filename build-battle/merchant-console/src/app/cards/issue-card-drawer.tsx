"use client"

import { Button } from "@/components/Button"
import {
  Drawer, DrawerBody, DrawerClose, DrawerContent,
  DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger,
} from "@/components/Drawer"
import { Input } from "@/components/Input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/Select"
import { CardCategory, Card, Currency } from "@/data/types"
import { MAX_SPEND_LIMIT_MINOR_UNITS, NICKNAME_MAX_LENGTH } from "@/data/card-number"
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
  const [categoryLock, setCategoryLock] = useState<CardCategory | "none">("none")
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // One focus target per field, keyed by name - replaces five separate refs.
  const fieldRefs = useRef<Record<string, HTMLElement | null>>({})
  const registerField = (field: string) => (el: HTMLElement | null) => {
    fieldRefs.current[field] = el
  }
  const focusField = (field: string) => fieldRefs.current[field]?.focus()

  const selectedMerchant = merchants.find((m) => m.id === merchantId)
  const currencyForDisplay = (currency || selectedMerchant?.currency || "USD") as Currency
  const showCurrencyMismatch =
    Boolean(selectedMerchant) && Boolean(currency) && currency !== selectedMerchant?.currency

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
    if (!trimmedNickname) errors.nickname = "Enter a nickname."
    else if (trimmedNickname.length > NICKNAME_MAX_LENGTH)
      errors.nickname = `Nicknames are at most ${NICKNAME_MAX_LENGTH} characters.`

    if (!merchantId) errors.merchantId = "Choose a merchant."

    const minorUnits = parseAmountToMinorUnits(spendLimitInput)
    if (minorUnits === null) errors.spendLimit = "Enter an amount like 250 or 250.00."
    else if (minorUnits <= 0) errors.spendLimit = "Enter an amount greater than 0."
    else if (minorUnits > MAX_SPEND_LIMIT_MINOR_UNITS)
      errors.spendLimit = `Spend limit cannot exceed ${formatMoney(MAX_SPEND_LIMIT_MINOR_UNITS, currencyForDisplay)}.`

    if (!currency) errors.currency = "Choose a currency."

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      const firstField = ["nickname", "merchantId", "spendLimit", "currency"].find((f) => errors[f])
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
      setFormError("Could not reach the server. Check your connection and try again.")
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
          <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
            <DrawerBody className="flex flex-1 flex-col gap-4 overflow-y-auto">
              {formError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-500">
                  {formError}
                </p>
              )}

              <Field
                label="Nickname" htmlFor="card-nickname" error={fieldErrors.nickname} errorId="card-nickname-error"
                help={`What ops calls it. Up to ${NICKNAME_MAX_LENGTH} characters.`} helpId="card-nickname-help">
                <Input
                  id="card-nickname" ref={registerField("nickname")} value={nickname} className="mt-1"
                  onChange={(event) => setNickname(event.target.value)} maxLength={NICKNAME_MAX_LENGTH}
                  hasError={Boolean(fieldErrors.nickname)} aria-invalid={Boolean(fieldErrors.nickname)}
                  aria-describedby={fieldErrors.nickname ? "card-nickname-error" : "card-nickname-help"} />
              </Field>

              <Field
                label="Spend limit" htmlFor="card-spend-limit" error={fieldErrors.spendLimit}
                errorId="card-spend-limit-error" helpId="card-spend-limit-help"
                help={`Up to ${formatMoney(MAX_SPEND_LIMIT_MINOR_UNITS, currencyForDisplay)} without extra approval.`}>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    id="card-spend-limit" ref={registerField("spendLimit")} inputMode="decimal"
                    value={spendLimitInput} onChange={(event) => setSpendLimitInput(event.target.value)}
                    placeholder="250.00" hasError={Boolean(fieldErrors.spendLimit)}
                    aria-invalid={Boolean(fieldErrors.spendLimit)}
                    aria-describedby={fieldErrors.spendLimit ? "card-spend-limit-error" : "card-spend-limit-help"} />
                  <span className="text-sm text-gray-500">{currency || selectedMerchant?.currency || ""}</span>
                </div>
              </Field>

              <SelectField
                label="Merchant" labelId="card-merchant-label" triggerId="card-merchant-trigger"
                value={merchantId} onValueChange={handleMerchantChange} placeholder="Choose a merchant"
                options={merchants.map((m) => ({ value: m.id, label: m.name }))}
                fieldRef={registerField("merchantId")} error={fieldErrors.merchantId} errorId="card-merchant-error"
                describedBy={fieldErrors.merchantId ? "card-merchant-error" : undefined} />

              <SelectField
                label="Currency" labelId="card-currency-label" triggerId="card-currency-trigger"
                value={currency || undefined} onValueChange={(value) => setCurrency(value as Currency)}
                placeholder="Choose a currency" options={CURRENCIES.map((code) => ({ value: code, label: code }))}
                fieldRef={registerField("currency")} error={fieldErrors.currency} errorId="card-currency-error"
                noteId="card-currency-note" note={showCurrencyMismatch && selectedMerchant ? `${selectedMerchant.name} settles in ${selectedMerchant.currency}. This card cannot be issued in ${currency}.` : undefined}
                describedBy={fieldErrors.currency ? "card-currency-error" : showCurrencyMismatch ? "card-currency-note" : undefined} />

              <SelectField
                label="Category lock" labelId="card-category-label" triggerId="card-category-trigger"
                value={categoryLock} onValueChange={(value) => setCategoryLock(value as CardCategory | "none")}
                placeholder="No lock" options={[{ value: "none", label: "No lock" }, ...CATEGORIES]}
                fieldRef={registerField("categoryLock")} describedBy="card-category-help"
                help="What the card may be spent on. Not editable after issue." helpId="card-category-help" />
            </DrawerBody>
            <DrawerFooter>
              <Button type="submit" isLoading={submitting} loadingText="Issuing…" disabled={submitting}>
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
                      This is the only time this number will be shown. Copy it now.
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-lg tracking-widest text-gray-900 dark:text-gray-50">
                        {issued.cardNumber}
                      </p>
                      <Button type="button" variant="secondary" className="gap-1.5 py-1.5" onClick={handleCopy}>
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
                      {issued.card.nickname} · {formatMoney(issued.card.spendLimit, issued.card.currency)} limit
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-900 dark:text-gray-50">
                    This card was already issued. Its number was shown once and cannot be shown again.
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

/**
 * Shared label/help/error/note scaffold for a form field.
 *
 * `htmlFor` pairs a native control's `<label>` the usual way; `labelId`
 * instead puts the id on the label itself, for a Radix `Select` trigger to
 * point its own `aria-labelledby` at. At most one of `error` (rendered as a
 * `role="alert"` node) or `note` is shown below the control - error always
 * wins, matching the exact per-field behaviour this replaces.
 */
function Field({
  label, htmlFor, labelId, help, helpId, error, errorId, note, noteId, children,
}: {
  label: string; htmlFor?: string; labelId?: string
  help?: React.ReactNode; helpId?: string; error?: string; errorId?: string
  note?: React.ReactNode; noteId?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} id={labelId} className="text-sm font-medium text-gray-900 dark:text-gray-50">
        {label}
      </label>
      {children}
      {help && <p id={helpId} className="mt-1 text-xs text-gray-500">{help}</p>}
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600 dark:text-red-500">
          {error}
        </p>
      ) : (
        note && (
          <p id={noteId} className="mt-1 text-sm text-amber-600 dark:text-amber-500">
            {note}
          </p>
        )
      )}
    </div>
  )
}

/**
 * A `Field` whose control is a Radix `Select`. Three of the five form fields
 * (merchant, currency, category lock) are select-driven and otherwise repeat
 * the identical trigger/content wiring - this is that wiring, parameterised.
 */
function SelectField({
  label, labelId, triggerId, help, helpId, error, errorId, note, noteId,
  value, onValueChange, placeholder, options, fieldRef, describedBy,
}: {
  label: string; labelId: string; triggerId: string
  help?: string; helpId?: string; error?: string; errorId?: string
  note?: React.ReactNode; noteId?: string; describedBy: string | undefined
  value: string | undefined; onValueChange: (value: string) => void
  placeholder: string; options: { value: string; label: string }[]
  fieldRef: (el: HTMLElement | null) => void
}) {
  return (
    <Field label={label} labelId={labelId} help={help} helpId={helpId} error={error} errorId={errorId} note={note} noteId={noteId}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger
          ref={fieldRef} id={triggerId} aria-labelledby={labelId} className="mt-1"
          aria-describedby={describedBy} aria-invalid={error ? true : undefined}
          hasError={Boolean(error)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
