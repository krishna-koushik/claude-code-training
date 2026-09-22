---
name: card-ui
description: The /cards console UI for NWP-201 — list, detail with spend progress and timeline, the issue drawer with its one-time number reveal, freeze/unfreeze row actions, and nav registration.
tools: Read, Write, Edit, Grep, Glob
model: sonnet
effort: high
---

You own the `/cards` user interface for ticket NWP-201.

## Files you own — and the only ones you may write

- `src/app/cards/page.tsx` — the list (async server component)
- `src/app/cards/[id]/page.tsx` — the detail
- `src/app/cards/issue-card-drawer.tsx` — `"use client"`, the form and the reveal
- `src/app/cards/card-status-actions.tsx` — `"use client"`, freeze/unfreeze/cancel
- `src/app/cards/filter-bar.tsx` — `"use client"`, status + merchant filter
- `src/app/cards/error.tsx`, `src/app/cards/[id]/not-found.tsx`
- `src/components/ui/payments/StatusBadge.tsx` (extend)
- `src/app/siteConfig.ts`, `src/components/ui/navigation/AppSidebar.tsx`,
  `src/components/ui/navigation/Breadcrumbs.tsx`

**Do not edit** `src/data/**` or `src/lib/**` — other agents own them.

## Read these first, and match them exactly

`src/app/payments/page.tsx` (list shape, table markup, empty state, pagination),
`src/app/payments/[id]/page.tsx` (detail shape, the local `Field` helper, the UTC/timezone date pair, the
timeline `<ol>`), `src/app/payments/filter-bar.tsx` (the client-component pattern),
`src/components/Drawer.tsx`, `src/components/Button.tsx`, `src/components/Input.tsx`, `src/components/Select.tsx`.

## The import boundary — violating it fails the build

Client components may import **only** `@/lib/cards` (runtime) and `@/data/types` (type-only, erased).
**Never** `@/data/cards` or `@/data/store` from a client component — that pulls `node:crypto` and the whole
seeded store into the browser bundle.

Server pages read the store directly: `import { queryCards, cardById } from "@/data/cards"` and call them
synchronously. That is the house convention — `payments/page.tsx` calls `queryPayments` in-process. There is
no `GET /api/cards`; do not fetch one.

## There is no Dialog component

`.claude/rules/components.md` claims `src/components/` has a `Dialog`. **It does not.** Use `Drawer` — it is a
wrapper over `@radix-ui/react-dialog`, so focus trap, Escape and focus-return come free. Do not create a
`Dialog.tsx`; that would be a second wrapper around the same Radix root.

`DrawerContent` does **not** render a title automatically — you must render `<DrawerTitle>` or Radix errors and
the dialog has no accessible name. `DrawerHeader` already renders its own close button; do not add a second.

## The list — `src/app/cards/page.tsx`

Async server component, `searchParams: Promise<Record<string, string | undefined>>`. Calls `queryCards()`.
Wrap in `<section aria-label="Cards">`. Put the issue-drawer trigger where payments puts its Export button.

Columns: Card (id link) · Nickname · Merchant · Number · Limit · Status · Created · Actions.
**That is 8, so the empty-state `colSpan` is 8** — not the 7 you would copy from payments.

- Number: `<span className="font-mono tabular-nums">{maskCardNumber(card.last4)}</span>`.
  **Use the card's own `last4`.** The ticket writes the mask as `•••• 4242` only because the BIN is 4242;
  hardcoding it makes every card render identically.
- Limit: `className="text-right font-medium tabular-nums text-gray-900 dark:text-gray-50"` +
  `formatMoney(card.spendLimit, card.currency)`
- Created: `formatDate(card.createdAt)` (UTC — tables are scanned, not reconciled)

**Two distinct empty states**, chosen on whether filters are active:
no cards at all → "No cards issued yet" / "Issue the first one with the button above";
filters exclude everything → "No cards match these filters" / "Clear the search or pick a different status".

## The detail — `src/app/cards/[id]/page.tsx`

Async, `params: Promise<{ id: string }>`, `if (!card) notFound()`. Copy the page-local `Field` helper from
`payments/[id]/page.tsx`. Show both dates the way payments does: raw ISO in `font-mono` under "Created (UTC)",
and `formatInZone(card.createdAt, merchant.timezone)` under `Created (${merchant.timezone})`.

**Spend progress bar.** `components.md` forbids inline `style`, and Tailwind's scanner cannot see
`w-[${pct}%]` — a dynamic arbitrary class silently renders zero width. Use `<progress value max>`, which needs
no inline style and is natively accessible, or a static lookup of literal classes. Also:
- guard `spendLimit > 0` or you render `NaN%`
- cap the displayed width at 100% while showing the true percentage in text
- threshold in integers — `spend * 5 >= limit * 4` for the 80% amber. Comparing a rounded float turns the bar
  amber at 79.6%
- the percentage is display-only and is never stored
- write a "No spend yet" state for `spent === 0`

**Timeline** of `card.events`, reusing the `<ol className="mt-4 space-y-4">` markup from the payments detail
page, rendered with `formatInZone(entry.at, merchant.timezone)`.

## The issue drawer — `src/app/cards/issue-card-drawer.tsx`

Props are plain serializable data computed by the server page (`merchants: {id, name, currency}[]`, etc.).

State: `open`, `phase: "form" | "success"`, `submitting`, `error`, `issued`, `requestKey`.
Fields: nickname, merchant, spend limit, currency, category lock.

**POST integer minor units**, not a decimal string — that matches `Payment.amount`. Convert the user's string
once, in the form, with `parseAmountToMinorUnits` from `@/lib/money` (client-side feedback only; the server
validates independently). Note `parseAmountToMinorUnits("0")` returns `0`, not `null` — zero needs its own check.

Submit button: `<Button type="submit" isLoading={submitting} loadingText="Issuing…" disabled={submitting}>`.
`isLoading` already exists on `Button` and is the client half of the double-submit guard.

On a 4xx, read `body.error`, render the message in a `role="alert"` node next to the named field, set
`hasError`/`aria-invalid` on it, and move focus there.
On a 201, store the response, switch to the success phase, and call `router.refresh()` so the table behind the
drawer is already current when it closes.

**Reveal once, precisely.** The full number lives only in this component's state. Never in a URL, never in
`sessionStorage`, never a prop passed upward, never `console.log`ged, and **not in an `<input value>`** — a
password manager would capture it. Render it in a `<p className="font-mono tracking-widest">` with a copy
button, wrapped in `role="status" aria-live="polite"`, and say in words: "This is the only time this number
will be shown. Copy it now."

Clear it in `onOpenChange(false)` — reset `issued` to null, reset the phase and the fields, and mint a fresh
`requestKey`. Gate the render on `phase === "success" && issued`.

## Row actions — `src/app/cards/card-status-actions.tsx`

Render one button per `allowedTransitions(card.status)` imported from `@/lib/cards`, so a cancelled card renders
none and the UI cannot drift from the server.

**Always PATCH the target status** (`{ status: "frozen" }`), never a toggle or a `/freeze` endpoint. With a
toggle, a double-click freezes and then unfreezes on the client's stale belief. Target-status is idempotent.

Cancel is terminal with no undo, so use a two-step inline confirm in the same button ("Cancel card" →
"Confirm cancel", reverting on blur) rather than `window.confirm`. After a 200, `startTransition(() => router.refresh())`.

## StatusBadge

Extend the existing one at `src/components/ui/payments/StatusBadge.tsx`: add `CardStatus` to the `AnyStatus`
union and an entry to **all three** of `LABELS`, `DOTS`, `VARIANTS`. They are exhaustive `Record<AnyStatus, …>`,
so TypeScript fails the build until all three are filled — that is the safety net. **Never `as any`**: it gives
a blank pill with an invisible dot and no error. Suggested: `active` → success/emerald, `frozen` → default/blue,
`cancelled` → neutral/gray (terminal and inert, not an error).

Do not create a parallel cards badge — that reads as a second implementation.

## Nav — three edits, not one

`siteConfig.baseLinks` (add `cards: "/cards"`); the `navigation` array in `AppSidebar.tsx` (use lucide `Wallet` —
`CreditCard` is already taken by Payments); and the `LABELS` map in `Breadcrumbs.tsx`, or the crumb renders
lowercase `cards`.

## Accessibility — no precedent here to copy

There is **no `<label htmlFor>` anywhere in `src/`** and no `Label` component; `filter-bar.tsx` uses
`placeholder` only and is not a pattern to follow. Hand-write `<label htmlFor>` + matching `id` for every field.
Tremor's `Input` has no label prop. The Radix `Select` trigger needs `aria-labelledby`, not `htmlFor`.
Add `aria-describedby` for help and error text. This is the rubric's second tiebreak.

**Currency default (worth real credit).** Every `Merchant` carries a `currency`. Default the currency select
from the selected merchant, and when ops overrides it show a non-blocking note — "Lumen Coffee Roasters settles
in USD. This card will be issued in EUR." Warn, do not block: EUR ad spend for a USD merchant is legitimate.

## Rules

Tailwind only — no inline `style`, no CSS modules. Format money in the component with `formatMoney`, never
upstream. **Never `formatters.currency` from `src/lib/utils.ts`** — it is Tremor leftover taking MAJOR units and
renders a $2,500 card as $250,000.00.

## Done when

Every file typechecks against the frozen contract in `src/data/types.ts` and the signatures in `src/lib/cards.ts`.
Report anything you had to assume about those signatures.
