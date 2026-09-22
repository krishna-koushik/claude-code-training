import { describe, expect, it } from "vitest"
import {
  allowedTransitions,
  canTransition,
  generateCardNumber,
  isCardCategory,
  isCardStatus,
  isValidLuhn,
  lastFour,
  luhnCheckDigit,
  maskCardNumber,
  MAX_SPEND_LIMIT_MINOR_UNITS,
} from "./cards"
import type { CardStatus } from "@/data/types"

/**
 * Luhn generation and validation have different parities - the rightmost
 * PAYLOAD digit is doubled when generating a check digit, but the rightmost
 * digit of a COMPLETE number (the check digit itself) is never doubled when
 * validating. Getting this backwards is the single most common bug here, so
 * the cases below are chosen to catch specific wrong implementations, not
 * just to exercise the happy path.
 */

describe("luhnCheckDigit", () => {
  it("computes the known check digit for an all-same-parity payload", () => {
    // A wrong-parity implementation (doubling the wrong positions) returns 0
    // here instead of 2.
    expect(luhnCheckDigit("424242424242424")).toBe(2)
  })

  it("applies the outer % 10 so a sum ending in 0 yields 0, not 10", () => {
    expect(luhnCheckDigit("424200000000000")).toBe(0)
  })

  it("subtracts 9 from a doubled value over 9, rather than % 10", () => {
    // `sum += (2*d) % 10` would silently produce the same digit-sum family
    // for some inputs but diverges here: the correct check digit is 9.
    expect(luhnCheckDigit("424255555555555")).toBe(9)
  })
})

describe("isValidLuhn", () => {
  it("accepts a valid complete number", () => {
    expect(isValidLuhn("4242424242424242")).toBe(true)
  })

  it("rejects the same number with the check digit off by one", () => {
    expect(isValidLuhn("4242424242424243")).toBe(false)
  })

  it("rejects a transposition of two adjacent unequal digits", () => {
    expect(isValidLuhn("2442424242424242")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("returns a pinned literal for a fixed digit source", () => {
    expect(generateCardNumber(() => 7)).toBe("4242777777777775")
  })

  it("round-trips through isValidLuhn for 500 counter-based sources", () => {
    let counter = 0
    const nextDigit = () => {
      const digit = counter % 10
      counter++
      return digit
    }

    for (let i = 0; i < 500; i++) {
      const number = generateCardNumber(nextDigit)
      expect(number).toMatch(/^4242\d{12}$/)
      expect(number).toHaveLength(16)
      expect(isValidLuhn(number)).toBe(true)
    }
  })
})

describe("lastFour", () => {
  it("takes the last four digits of a complete number", () => {
    expect(lastFour("4242424242424242")).toBe("4242")
  })
})

describe("maskCardNumber", () => {
  it("renders the stored last four behind a bullet mask", () => {
    expect(maskCardNumber("1234")).toBe("•••• 1234")
  })
})

describe("canTransition / allowedTransitions", () => {
  const statuses: CardStatus[] = ["active", "frozen", "cancelled"]

  // The full 3x3 matrix, asserted explicitly so a change to the rules here
  // fails a specific case instead of a generic "some transition changed".
  const expected: Record<CardStatus, Record<CardStatus, boolean>> = {
    active: { active: false, frozen: true, cancelled: true },
    frozen: { active: true, frozen: false, cancelled: true },
    cancelled: { active: false, frozen: false, cancelled: false },
  }

  for (const current of statuses) {
    for (const next of statuses) {
      it(`${current} -> ${next} is ${expected[current][next]}`, () => {
        expect(canTransition(current, next)).toBe(expected[current][next])
      })
    }
  }

  it("allows no moves out of cancelled", () => {
    expect(allowedTransitions("cancelled")).toHaveLength(0)
  })

  it("lists the legal destinations from active and frozen", () => {
    expect(allowedTransitions("active")).toEqual(["frozen", "cancelled"])
    expect(allowedTransitions("frozen")).toEqual(["active", "cancelled"])
  })
})

describe("isCardStatus", () => {
  it("accepts the three real statuses", () => {
    expect(isCardStatus("active")).toBe(true)
    expect(isCardStatus("frozen")).toBe(true)
    expect(isCardStatus("cancelled")).toBe(true)
  })

  it("rejects an unknown status, empty string, non-strings, and wrong case", () => {
    expect(isCardStatus("deleted")).toBe(false)
    expect(isCardStatus("")).toBe(false)
    expect(isCardStatus(null)).toBe(false)
    expect(isCardStatus(123)).toBe(false)
    expect(isCardStatus("ACTIVE")).toBe(false)
  })
})

describe("isCardCategory", () => {
  it("accepts a real category and rejects an unknown one", () => {
    expect(isCardCategory("software")).toBe(true)
    expect(isCardCategory("groceries")).toBe(false)
    expect(isCardCategory(null)).toBe(false)
  })
})

describe("MAX_SPEND_LIMIT_MINOR_UNITS", () => {
  it("is fifty thousand dollars in minor units", () => {
    expect(MAX_SPEND_LIMIT_MINOR_UNITS).toBe(5_000_000)
  })
})
