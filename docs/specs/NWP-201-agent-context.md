# NWP-201 shared context (not an agent — reference text pasted into each agent prompt)

## The four hard rules
1. Money is integer minor units, always paired with a currency. Format only at the edge.
2. Card numbers are generated server-side on the `4242` BIN with a valid Luhn check digit.
3. Reveal once: the full number appears in the creation response and nowhere else.
4. Status machine: `active <-> frozen`, either to `cancelled`, `cancelled` terminal. Guard on the server.

## Repo documentation that is WRONG — do not trust it
- `.claude/rules/components.md` claims `src/components/` has a `Dialog`. **It does not.** Only `Drawer.tsx`
  (a wrapper over `@radix-ui/react-dialog`). Importing `@/components/Dialog` fails the build.
- `CLAUDE.md` says seed data is JSON. It is TypeScript: `src/data/generate.ts`, `src/data/merchants.ts`.
- `src/data/queries.ts:16` claims all client input is allowlisted. Only `status`/`sort`/`direction`/`page` are.
- `src/data/queries.ts:80` claims it sorts by formatted amount. It sorts lexicographically. That is a live bug.
  **Never copy it.** Numeric fields are compared by subtraction.

## Environment facts
- Next 15.1.9 App Router, React 19, TypeScript, Tailwind. Tremor Raw components vendored into `src/components/`.
- **No zod or any validation library. No nanoid/uuid.** Validation is hand-rolled.
- `Currency` is a TYPE ONLY, erased at runtime.
- vitest: `environment: "node"`, `include: ["src/**/*.test.ts"]`. `.test.tsx` is NEVER collected and there is
  no jsdom, so component tests are impossible. Test pure `.ts` modules.
- `npm run lint` does NOT typecheck. Only `npm run build` does.
- Scripts: `dev`, `build`, `start`, `lint`, `test`.

## The module split (do not violate)
- `src/lib/cards.ts` — ISOMORPHIC. Luhn, BIN, mask, transition table, type guards. A client component imports
  from here, so it must never touch `node:crypto` or the store.
- `src/data/cards.ts` — SERVER ONLY. id allocator, validator, issueCard, setCardStatus, cardById, queryCards.
  May use `node:crypto`. A client component importing this fails the build.

## Existing helpers — use them, a second implementation is a defect
- `src/lib/money.ts`: `formatMoney(minorUnits, currency)`, `formatMoneyCompact`, `sumMinorUnits`,
  `parseAmountToMinorUnits(input: string): number | null`.
  NOTE: `parseAmountToMinorUnits` calls `input.trim()` with no type guard — guard the call site, do not edit money.ts.
  NOTE: `formatters.currency` in `src/lib/utils.ts` is Tremor leftover taking MAJOR units. Never use it for money.
- `src/lib/dates.ts`: `formatDate(iso)` for tables (UTC), `formatInZone(iso, tz)` for detail, `utcDayKey`, `daysUntil`.
  House pattern: `now`/`from` are injected parameters, never `new Date()` inside.
- `src/data/queries.ts`: `paginate<T>(rows, page, pageSize)` is GENERIC — reuse it unchanged. `PAGE_SIZE = 20`.
- `src/data/merchants.ts`: `merchants`, `merchantById(id) => Merchant | undefined`.
- `src/lib/utils.ts`: `cx()`, `focusRing`, `focusInput`, `hasErrorInput`.

## The error envelope (src/lib/api.ts)
Body is always `{ "error": { code, message, field? } }`.
`code` is one of `invalid_json` | `invalid_field` | `not_found` | `invalid_transition`.
400 = bad JSON or any validation failure. 404 = unknown card. 409 = illegal transition.
A same-status PATCH is a 200 no-op, short-circuited in the route BEFORE consulting `canTransition`.
