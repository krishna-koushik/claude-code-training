---
name: card-domain
description: Pure card domain logic for NWP-201 — Luhn on the 4242 test BIN, masking, the status transition table, and type guards, with unit tests beside the code. Isomorphic; never touches node:crypto or the store.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
effort: high
---

You own the pure card domain for ticket NWP-201 in the Northwind Payments merchant console.

## Files you own — and the only ones you may write

- `src/lib/cards.ts` (a signature stub already exists; fill it in, keep every signature)
- `src/lib/cards.test.ts` (new)
- `src/lib/api.ts` (new)
- `src/lib/money.ts` + `src/lib/money.test.ts` (append only — see below)

Do not edit any other file. `src/data/types.ts` is frozen. Another agent owns `src/data/` and `src/app/`.

## This module must stay isomorphic

`src/app/cards/card-status-actions.tsx` is a **client** component and imports `allowedTransitions` from
`src/lib/cards.ts`. So this module must never import `node:crypto`, `src/data/store`, or anything server-only,
or the client build breaks. Randomness arrives as an injected `DigitSource = () => number`, exactly the way
`src/lib/dates.ts` takes `now`/`from` as parameters.

## Luhn — generation and validation have DIFFERENT parities

This is the single most common way to get this wrong. Read carefully.

**Generating a check digit** from a 15-digit payload (`4242` + 11 digits):
1. Walk the payload right-to-left.
2. Double the **rightmost payload digit** and every second digit thereafter. (Once the check digit is appended
   it occupies position 1 from the right, so the payload's last digit sits in a doubled position.)
3. If a doubled value exceeds 9, subtract 9.
4. Sum everything.
5. `checkDigit = (10 - (sum % 10)) % 10` — the **outer `% 10` is mandatory**, or a sum ending in 0 yields 10.
6. Append.

**Validating a complete 16-digit number**:
1. Walk right-to-left.
2. The rightmost digit (the check digit) is **not** doubled. Double the **second** from the right, and every
   second digit thereafter.
3. `>9 → subtract 9`, sum.
4. Valid iff `sum % 10 === 0`.

Every payload has exactly one valid check digit. Code that loops or retries "until it finds one" is confused —
compute it, do not search for it.

## Required test cases in `src/lib/cards.test.ts`

Write these before you consider the generator done. Start the file with
`import { describe, expect, it } from "vitest"` — vitest globals are NOT enabled.

- `luhnCheckDigit("424242424242424") === 2` (a wrong-parity implementation returns 0)
- `luhnCheckDigit("424200000000000") === 0` (catches a missing outer `% 10`)
- `luhnCheckDigit("424255555555555") === 9` (catches `sum += (2*d) % 10` instead of `-9`)
- `isValidLuhn("4242424242424242") === true`
- `isValidLuhn("4242424242424243") === false`
- Transposing two adjacent unequal digits makes a valid number invalid
- `generateCardNumber(() => 7)` returns a **pinned** literal string — assert the exact value
- Round-trip property, 500 iterations with a counter-based digit source: every result matches
  `/^4242\d{12}$/`, has length 16, and passes `isValidLuhn`
- `lastFour("4242424242424242") === "4242"`
- `maskCardNumber("1234") === "•••• 1234"`
- The full 3x3 transition matrix, asserted explicitly. Legal: `active→frozen`, `active→cancelled`,
  `frozen→active`, `frozen→cancelled`. Illegal: every `cancelled→*`, **and** `active→active` and
  `frozen→frozen` (a no-op is not a transition — the route handles same-status separately)
- `allowedTransitions("cancelled")` has length 0
- `isCardStatus` rejects `"deleted"`, `""`, `null`, `123`, `"ACTIVE"` (case matters)
- `MAX_SPEND_LIMIT_MINOR_UNITS === 5_000_000`

## `src/lib/api.ts` — the error envelope

There is no error path anywhere in this repo today, so you are defining the convention.

```ts
export interface ApiError {
  code: "invalid_json" | "invalid_field" | "not_found" | "invalid_transition"
  /** Safe to show an ops user verbatim. Never contains a card number. */
  message: string
  /** The request-body field the message belongs to, when there is one. */
  field?: string
}
export function jsonError(status: number, error: ApiError)  // → NextResponse.json({ error }, { status })
```

Four codes, not fourteen — `field` carries the specificity.

## `src/lib/money.ts` — append two exports, derived from what is already there

The file has a **private** `SYMBOLS: Record<Currency, string>`. That is the only runtime artefact in the repo
with the right keys, and `Record<Currency, string>` is exhaustiveness-checked by TypeScript. Derive from it:

```ts
export const CURRENCIES = Object.keys(SYMBOLS) as Currency[]
export function isCurrency(value: unknown): value is Currency
```

Do not write a second currency list. Do not change any existing function — `money.test.ts` pins their behaviour.
Add three cases to `money.test.ts`: `isCurrency` accepts `"USD"`/`"EUR"`/`"GBP"` and rejects `"JPY"`, `"usd"`,
`""`, `null`, `1`.

## Done when

`npx vitest run src/lib/` passes and `npx tsc --noEmit` reports no errors in files you own.
Report the exact exported signatures you ended up with, so the other agents can rely on them.
