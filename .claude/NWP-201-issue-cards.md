# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Krishna Koushik
**Status:** done

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand — hours of turnaround, 12-20 times a week, and a wrong spend limit slipped through last month because the request lived in a Slack thread. Put issuing in the console: a form, a list, a detail view, with limits enforced server-side from the moment a card exists.

## Current state

Before this ticket, nothing card-related existed in the codebase:

- No `Card` type, no card store, no `/cards` route. `src/data/types.ts` had `Merchant`, `Payment`, `Refund`, `Dispute`, `Payout` only.
- No mutating route handler anywhere in `src/app/api/`. `src/app/api/payments/route.ts:4` and `src/app/api/payments/export/route.ts:11` export `GET` only — this ticket writes the repo's first `POST` and `PATCH`.
- No error envelope. There was no precedent to follow, so this ticket invents one (`src/lib/api.ts`) rather than matching an existing shape.
- No zod or any validation library in the repo; `src/data/queries.ts:18` (`parseFilters`) is the only prior example of hand-rolled input handling, and it allowlists-and-falls-back rather than rejecting.
- `Currency` (`src/data/types.ts:1`) is a type only, erased at runtime — nothing in the codebase could check a currency string against it before `src/lib/money.ts:63` (`isCurrency`) existed.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units... No floats, no strings with currency symbols." | `CLAUDE.md` (merchant-console) | A `$250.00` limit stored as `250.00` drifts under arithmetic and fails the ticket's own validation range |
| "Test BIN only. Every generated number starts `4242` and carries a valid Luhn check digit." | `.claude/rules/cards.md` | A number that isn't test-BIN-shaped could be mistaken for a real PAN |
| "Reveal once. The full number appears in the creation response and nowhere else." | `.claude/rules/cards.md` | A re-readable number turns a display bug into a card-data leak |
| "Status is a state machine. `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal." | `.claude/rules/cards.md` | A card frozen for fraud could be reactivated, or a cancelled card could take spend again |
| "Never store, compare, or accumulate an amount as a float." | `.claude/rules/money.md` | `spendLimit` comparisons (the 5,000,000 ceiling, spend-vs-limit) become approximate |
| "Never return a full card number from a list or detail route. The full number exists in exactly one response, the creation one." | `.claude/rules/api-routes.md` | The list/detail payloads would need scrubbing logic that could be wrong |
| "Validate everything from the client against an allowlist before it reaches the store... Client-side checks are a convenience, never the enforcement." | `.claude/rules/api-routes.md` | A hand-edited request bypasses the drawer's own checks and mints an illegal card |

## Approach

Split the domain in two, mirroring `src/lib/dates.ts`'s existing pattern of injecting non-deterministic inputs rather than reaching for them. `src/lib/cards.ts` holds everything isomorphic — Luhn generation and validation, the `4242` BIN, masking, the status transition table, and the `CardStatus`/`CardCategory` type guards — because `card-status-actions.tsx` is a client component that imports `allowedTransitions` to decide which buttons to render, so this file can never import `node:crypto` or touch the store. `src/data/cards.ts` holds everything server-only — the id allocator, `validateIssueCard`, `issueCard`, `setCardStatus`, `queryCards` — and is the only place `node:crypto` is used (`randomInt` for digits, `randomBytes` for `numberRef`). Two new route handlers, `POST /api/cards` and `PATCH /api/cards/[id]`, are the first mutating routes in the app and so define the error envelope (`src/lib/api.ts`) the rest of the API layer has none of yet.

**Considered and rejected:** reusing `filterPayments`/`sortPayments` (`src/data/queries.ts:45,72`) for card queries — rejected because both are `Payment`-typed on every line (`store.payments`, `payment.status`, `payment.merchantId`), and widening them to a shared shape is a bigger, riskier diff than writing card-specific filtering. Only the already-generic `paginate<T>` (`src/data/queries.ts:87`) is reused, unchanged, in `queryCards` (`src/data/cards.ts:57`). Also considered and rejected: adding a `src/components/Dialog.tsx`. `.claude/rules/components.md:9` claims one already exists ("Button, Input, Select, Dialog, Badge"); it does not — only `Drawer.tsx` does, wrapping `@radix-ui/react-dialog` — and `Drawer` already gives the issue flow an accessible modal on the same primitive, so a second dialog component would be a duplicate, not a fix.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | Add `Card`, `CardStatus`, `CardCategory`, `CardEvent`, `CardFilters` | The domain has no shape yet |
| `src/lib/cards.ts` | Add (new file) | Isomorphic Luhn, BIN, mask, transition table, type guards |
| `src/data/cards.ts` | Add (new file) | Server-only store access, validation, mutations |
| `src/lib/api.ts` | Add (new file) | The `{ error }` envelope every card route returns |
| `src/app/api/cards/route.ts` | Add (new file) | `POST` — issue a card |
| `src/app/api/cards/[id]/route.ts` | Add (new file) | `PATCH` — change status |
| `src/app/cards/page.tsx` | Add (new file) | Card list, filters, pagination |
| `src/app/cards/[id]/page.tsx` | Add (new file) | Card detail, spend progress, timeline |
| `src/app/cards/issue-card-drawer.tsx` | Add (new file) | Issue form + one-time reveal screen |
| `src/app/cards/card-status-actions.tsx` | Add (new file) | Freeze/unfreeze/cancel controls |
| `src/app/cards/filter-bar.tsx` | Add (new file) | Status/merchant filter controls |
| `src/app/cards/error.tsx`, `[id]/not-found.tsx` | Add (new files) | Written error/not-found states, not defaults |

## Plan

1. **Domain module (`src/lib/cards.ts`)** — done when: `luhnCheckDigit`, `isValidLuhn`, `generateCardNumber`, `maskCardNumber`, `canTransition`, `allowedTransitions`, and the two type guards exist and are covered by unit tests.
2. **Server data module (`src/data/cards.ts`)** — done when: `validateIssueCard` rejects every case in the ticket's validation list, `issueCard` and `setCardStatus` mutate the store correctly, and both are covered by unit tests.
3. **Route handlers** — done when: `POST /api/cards` returns 201 with `{ card, cardNumber }` and `PATCH /api/cards/[id]` returns 200/400/404/409 as specified, verified with `curl`.
4. **UI** — done when: `/cards` lists, filters, and paginates; `/cards/[id]` shows the full record and spend; the issue drawer shows the number exactly once; freeze/unfreeze/cancel work without a full reload.
5. **Verify** — done when: `npm test` and `npm run build` are both clean.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card (nickname, merchant, limit, currency) | `issue-card-drawer.tsx` form → `POST /api/cards`; curl: `201` with card + `cardNumber` for a valid body |
| Card list at `/cards` (nickname, merchant, masked number, limit, status, created) | `src/app/cards/page.tsx:74-148` renders all six columns per row; `npm run build` shows `/cards` as `ƒ` (dynamic, server-rendered on demand) |
| Card detail (full record + spend vs. limit) | `src/app/cards/[id]/page.tsx`; `SpendProgress` (line 131) renders the bar and amber threshold |
| Generated numbers on `4242` BIN with valid Luhn | `src/lib/cards.test.ts` (25 tests, includes a round-trip property test and the three classic off-by-one vectors); `npm test` — all pass |
| Reveal once, mask forever | Structural: `Card` (`src/data/types.ts:105`) has no number field, so nothing to leak from list/detail; `issue-card-drawer.tsx:474-529` is the only screen that ever renders `cardNumber`, and a replayed issue omits it (`src/data/cards.ts:196-202`) |
| Server-side validation (missing merchant, ≤0 limit, >5,000,000 limit, bad currency) | `src/data/cards.test.ts` (28 tests) exercise `validateIssueCard`; curl: `400 invalid_field` for a bad currency, a zero limit, and a missing `merchantId` |
| Status transitions guarded server-side | `src/lib/cards.test.ts` covers `canTransition`/`allowedTransitions`; curl: cancelling a card then attempting `cancelled → frozen` returns `409 invalid_transition`; a same-status `PATCH` (`active → active`) returns `200` as a no-op |
| Unknown card | curl: `PATCH /api/cards/card_9999` returns `404 not_found` |
| Full suite | `npm test` — 83 tests pass (25 `src/lib/cards.test.ts`, 28 `src/data/cards.test.ts`, plus 30 pre-existing across `dates`/`csv`/`money`); `npm run build` compiles clean with every route including `/cards` and `/cards/[id]` listed dynamic (`ƒ`) |

## Risks

- **`spent` has no honest data source.** `Payment` (`src/data/types.ts:24`) has no `cardId`, and there is no card-transaction entity, so criterion 3's "spend against the limit" cannot be derived from real activity. Attributing merchant payments to a card would also be semantically inverted — those are payments the merchant *received*, not funds spent from an issued card. `spent` therefore lives directly on `Card` (`src/data/types.ts:121`, seeded/updated as a bare integer) rather than being computed. This is a modelling gap, not a display bug; it should close when card-transaction data exists (tracked as NWP-202/NWP-203 territory).
- **Two pieces of `.claude/rules/` and prior code are wrong** and were not trusted: `components.md:9`'s claim of an existing `Dialog` component, and `queries.ts:80`'s comment claiming `sortPayments` sorts by formatted amount (it does a lexicographic string compare of the raw number — a live bug, not copied here).

## Out of scope

- Persistence beyond the dev-server lifetime (NWP-203) — no database, ORM, or migration was added.
- Editing a card's limit after issue (NWP-202).
- Card-transaction modelling that would let `spent` be derived rather than stored (NWP-202/NWP-203).
- Authentication, roles, permissions, and real card-network calls — per the ticket's own out-of-scope list.

## Open questions

- When card-transaction data lands, should `spent` migrate to a computed value, and does that change the `Card` type's shape or just its source?
- Should a currency mismatch between a merchant's settlement currency and the chosen card currency (surfaced today only as a client-side warning in `issue-card-drawer.tsx:416-424`) be a hard server-side rejection instead?
