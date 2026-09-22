/**
 * Card number generation and masking: the PAN's Luhn math, generation from a
 * digit source, and display masking. Isomorphic on purpose: the issue drawer
 * is a client component and imports pieces of this module, so it must never
 * reach for `node:crypto` or the store. Server-only card work lives in
 * `src/data/cards.ts`; the status state machine lives in
 * `src/data/card-status.ts`.
 */

/** Every generated number starts here. Nothing in this repo may resemble a real PAN. */
export const TEST_BIN = "4242"
export const CARD_NUMBER_LENGTH = 16

/** Integer minor units. $50,000.00. The ceiling ops may issue without approval. */
export const MAX_SPEND_LIMIT_MINOR_UNITS = 5_000_000

/** Trimmed length bounds for a card nickname. */
export const NICKNAME_MAX_LENGTH = 48

/**
 * A source of single digits 0-9. Injected, the way `src/lib/dates.ts` takes
 * `now` and `from` as parameters: the seed generator passes a deterministic
 * source so `generate()` stays reproducible, the route passes a CSPRNG.
 */
export type DigitSource = () => number

/**
 * The Luhn check digit for a number missing its last digit (the payload).
 *
 * Walk right-to-left. The rightmost PAYLOAD digit is doubled (it will sit in
 * the doubled position once the check digit is appended after it), then
 * every second digit thereafter. Values over 9 lose 9 (equivalent to summing
 * their own digits). The outer `% 10` below is mandatory: a sum that already
 * ends in 0 must yield check digit 0, not 10.
 */
export function luhnCheckDigit(partial: string): number {
  let sum = 0
  let double = true
  for (let i = partial.length - 1; i >= 0; i--) {
    let digit = Number(partial[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return (10 - (sum % 10)) % 10
}

/**
 * True when a complete number satisfies Luhn.
 *
 * Different parity from `luhnCheckDigit` on purpose: the rightmost digit
 * here IS the check digit, so it is never doubled. Doubling starts one
 * position in.
 */
export function isValidLuhn(cardNumber: string): boolean {
  let sum = 0
  let double = false
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = Number(cardNumber[i])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/**
 * A 16-digit test-BIN number: 4242 + 11 digits + a Luhn check digit.
 * Server only - a card number produced in the browser is a bug.
 */
export function generateCardNumber(nextDigit: DigitSource): string {
  const payloadLength = CARD_NUMBER_LENGTH - TEST_BIN.length - 1
  let payload = TEST_BIN
  for (let i = 0; i < payloadLength; i++) {
    payload += String(nextDigit())
  }
  return payload + String(luhnCheckDigit(payload))
}

/** Last four. Called once, at issue, then the full number is dropped. */
export function lastFour(cardNumber: string): string {
  return cardNumber.slice(-4)
}

/**
 * Display mask. Takes the card's own last four, never a full number - by the
 * time anything renders, the full number no longer exists.
 */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}
