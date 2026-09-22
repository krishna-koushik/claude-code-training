---
name: card-data-api
description: Server-side card data and API routes for NWP-201 — the store collection, seeded cards, the validator, issueCard/setCardStatus, and the POST/PATCH route handlers.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
effort: high
---

You own the server-side card data layer and API for ticket NWP-201.

## Files you own — and the only ones you may write

- `src/data/cards.ts` (new) — the entity module
- `src/data/cards.test.ts` (new)
- `src/data/store.ts` (modify — add the collection)
- `src/data/generate.ts` (modify — export `pad`, add `generateCards()`)
- `src/app/api/cards/route.ts` (new — POST)
- `src/app/api/cards/[id]/route.ts` (new — PATCH)

**Do not edit** `src/data/types.ts` (frozen), `src/data/queries.ts` (import from it, never change it),
`src/lib/**` (another agent owns it), or anything under `src/app/cards/` or `src/components/`.

## Read first

`src/data/types.ts` for `Card`, `CardStatus`, `CardCategory`, `CardEvent`, `CardFilters` — that is the frozen
contract. `src/lib/cards.ts` for the domain helpers you must use rather than reimplement.

## `src/data/cards.ts` — server only

This module may use `node:crypto`. It is never imported by a client component. Export:

```ts
export function cardById(id: string): Card | null
export function queryCards(filters: CardFilters)          // returns paginate()'s shape
export function validateIssueCard(body: unknown): ValidateResult
export function issueCard(input: IssueCardInput, now: Date): { card: Card; cardNumber: string } | { card: Card; replayed: true }
export function setCardStatus(id: string, next: CardStatus, now: Date): SetStatusResult

export type SetStatusResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" }
  | { ok: false; reason: "invalid_transition"; card: Card }
```

**Import `paginate` and `PAGE_SIZE` from `./queries` and reuse them unchanged.** Do not reimplement pagination.
Do NOT reuse `filterPayments`/`sortPayments` — they are `Payment`-typed on every line. Sort cards newest-first
with `b.createdAt.localeCompare(a.createdAt)`; ISO-8601 UTC strings sort lexicographically, which is why that is
correct here. If you ever sort a numeric field, subtract — never `String(x).localeCompare(...)`.

### The id allocator — derive from the store, never a module-level counter

A module counter resets to 1 on hot reload and collides with a live card. Read the highest existing suffix off
`store.cards` and `pad(max + 1, 4)` (width 4, matching `po_0001`). **Export the existing `pad`** from
`src/data/generate.ts:55` — a one-word diff — rather than declaring a second one.

### Validation — the house idiom is WRONG here

`parseFilters` in `queries.ts` uses allowlist + *silent fallback to a default*. That is right for a GET filter and
**wrong for a POST that must reject** — copied, it coerces `"JPY"` to `"USD"` and returns 201.

Reject, with `400` and `field` set, on every one of:
- missing `merchantId`; a well-formed but nonexistent id (`merchantById` returns undefined) — still `400`,
  not `404`, because the collection exists and it is the body field that is wrong
- `spendLimit` that is not an integer, `<= 0`, or `> 5_000_000`. Note **"above 5,000,000" means `>`** —
  `5_000_000` exactly is legal. Use `typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX`.
  `Number.isInteger` rejects `NaN`, `Infinity` and `250.5` in one call; `Number.isFinite` does not reject `250.5`.
  Never `Number(body.x)` — `Number(true) === 1` would create a one-cent card.
- a currency outside USD/EUR/GBP, including lowercase `"usd"` (use `isCurrency` from `src/lib/money.ts`)
- an unknown `categoryLock`
- a nickname that is empty or whitespace after trimming, or longer than 48 characters
- a body that is not valid JSON, or is `null`, an array, or a primitive

Wrap **only** the parse in try/catch and reject early:
```ts
let body: unknown
try { body = await request.json() } catch { return jsonError(400, { code: "invalid_json", message: "…" }) }
```
**Never spread the body** (`{...body, id}`) — that lets the client set `status`, `id`, `spent` or `numberRef`.
Read named fields only.

### Reveal-once — structural, not a filter

`issueCard` returns `{ card, cardNumber }` as **siblings**. `cardNumber` is a local const that is never assigned
onto `card`, never logged, never echoed in an error message. Because the `Card` type has no such field, every
payload is safe by construction — do not write a `toPublicCard()` mapper, it is just a place to make a mistake.

**A replay must not re-reveal.** If `input.requestKey` matches a card already in the store, return that card with
`replayed: true` and **no `cardNumber`**.

`numberRef` is **independently random** — `cnr_<16 hex>` from `node:crypto`. Never base64/hex of the number
(that is the number), never a hash of it (a fixed BIN plus a Luhn digit is ~10^11 candidates, brute-forceable).

Use `randomInt(0, 10)` from `node:crypto` as the `DigitSource`, **not** `randomBytes(1)[0] % 10`, which skews low.

`issueCard` and `setCardStatus` both take `now: Date` as a parameter — the `src/lib/dates.ts` pattern. The route
passes `new Date()`. That is what makes the timestamps testable.

Every status change appends a `CardEvent`. Issue appends one with `from: null`.

## `src/data/store.ts`

Add `cards: Card[]` to the `Store` interface **and** to `createStore()`. Add `store.cards ??= []` at module scope
as a guard, and note in your report that **the dev server must be restarted** — the `globalThis.__northwindStore`
pin means a running server holds a store with no `cards` key, so `createStore()` never re-runs and `store.cards`
is `undefined` at runtime while TypeScript says `Card[]`.

## `src/data/generate.ts`

Export `pad`. Add `generateCards()` producing 6-8 cards across different merchants, currencies and all three
statuses, with one card above 80% spend so the amber progress bar is demonstrable. **`generate()` must stay
deterministic** — pass a mulberry-backed `DigitSource`, never the CSPRNG. Do not modify existing seed data.

## The routes

`POST /api/cards` → `201` + `Location` with `{ card, cardNumber }`; `200` `{ card, replayed: true }` on a replay.

`PATCH /api/cards/[id]` → body `{ status }`, **`status` only**. Accepting `spendLimit` builds NWP-202 by accident.
- `200` `{ card }` on success
- `200` no-op when the card already has that status — short-circuit **before** calling `canTransition`
  (`canTransition` is deliberately strict and returns false for `X → X`)
- `400` bad JSON or a status that is not one of the three
- `404` unknown card
- `409` illegal transition, with the current status in the body

**Next 15 makes route-handler `params` a Promise**, and there is no dynamic API route in this repo to copy:
```ts
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
```
Do all `await`s **before** the find-check-mutate block, so two concurrent requests cannot interleave across an await.

## Tests — `src/data/cards.test.ts`

`environment: "node"`, `include: ["src/**/*.test.ts"]`, no globals — start with
`import { describe, expect, it } from "vitest"`.

Cover: each validator rejection above, one case each; acceptance of `5_000_000` exactly and of `1`;
`issueCard` returns a card where `expect("cardNumber" in result.card).toBe(false)`, `last4` matches the returned
number's tail, `status === "active"`, exactly one event with `from: null`; an injected clock writes that exact
`createdAt`; two consecutive issues get different ids; `setCardStatus` on a cancelled card returns
`invalid_transition` and leaves `status` and `events.length` unchanged.

**`NODE_ENV=test` triggers the globalThis store pin**, so tests share one store. Assert on returned objects and
on deltas (`const before = store.cards.length`), never absolute counts or `store.cards[0]`.

## Done when

`npx vitest run src/data/` passes, and you have curled each status code: a 201, a 400 per validation rule, a 404,
and a 409. Report the exact exported signatures.
