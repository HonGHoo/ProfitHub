import { describe, expect, it } from "vitest"
import { ALL_OPPORTUNITY_FAMILIES, buildRouteSignature, isPureLowTierTrain, resolveFamilies } from "@/common/apis/opportunity/rules"

describe("opportunity scan rules", () => {
  it("uses every family only when families is omitted", () => {
    expect(resolveFamilies(undefined)).toEqual(ALL_OPPORTUNITY_FAMILIES)
    expect(resolveFamilies([])).toEqual([])
  })

  it("excludes only configured multi-step material-only production paths", () => {
    const lowTierItems = new Set(["/items/copper_bar", "/items/iron_bar"])
    expect(isPureLowTierTrain("单步/制作", ["/items/copper_bar", "/items/iron_bar"], lowTierItems)).toBe(true)
    expect(isPureLowTierTrain("单步/制作", ["/items/copper_bar"], lowTierItems)).toBe(false)
    expect(isPureLowTierTrain("单步/制作", ["/items/copper_bar", "/items/sword"], lowTierItems)).toBe(false)
    expect(isPureLowTierTrain("制作炼金", ["/items/copper_bar", "/items/iron_bar"], lowTierItems)).toBe(false)
  })

  it("keeps different enhancement strategies as distinct routes", () => {
    const base = { hrid: "/items/sword", project: "强化", action: "enhancing", originLevel: 3, enhanceLevel: 10 }
    expect(buildRouteSignature([{ ...base, protectLevel: 5, escapeLevel: 0 }]))
      .not
      .toBe(buildRouteSignature([{ ...base, protectLevel: 6, escapeLevel: 0 }]))
  })
})
