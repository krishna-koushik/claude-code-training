import { describe, expect, it } from "vitest"
import {
  allowedTransitions,
  canTransition,
  isCardCategory,
  isCardStatus,
} from "./card-status"
import type { CardStatus } from "./types"

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
