import { describe, expect, it } from "vitest"
import { stoneEquipmentStandardPrice } from "@/calculator/stonePricing"

describe("equipment standard price", () => {
  it("breaks even after expected stone proceeds, byproducts and extra costs", () => {
    const buyPrice = 100
    const sourceCount = 2
    const stonesPerAction = 0.5
    const extraCost = 30
    const byproducts = 10
    const proceeds = 480
    const costPerStone = (buyPrice * sourceCount + extraCost - byproducts) / stonesPerAction
    const standard = stoneEquipmentStandardPrice({ buyPrice, sourceCount, stonesPerAction, costPerStone }, proceeds)!
    expect(standard).toBe(110)
    expect((standard * sourceCount + extraCost - byproducts) / stonesPerAction).toBe(proceeds)
  })

  it("keeps negative reference prices and returns null for unpriced rows", () => {
    const row = { buyPrice: 10, sourceCount: 1, stonesPerAction: 1, costPerStone: 30 }
    expect(stoneEquipmentStandardPrice(row, 0)).toBe(-20)
    expect(stoneEquipmentStandardPrice(row, -1)).toBeNull()
    expect(stoneEquipmentStandardPrice({ ...row, stonesPerAction: 0 }, 100)).toBeNull()
  })
})
