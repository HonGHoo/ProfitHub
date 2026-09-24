import type { PriceStatus } from "@/pinia/stores/game"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMaterialCostBreakdownOf, getMaterialCostOf, isMaterialPriceSelectionAvailable } from "@/common/apis/game/craft"

const state = vi.hoisted(() => ({
  artisan: 0.1,
  buyStatus: "ASK",
  sellStatus: "BID",
  timestamp: 1
}))

vi.mock("@/common/apis/game", () => ({
  getActionDetailOf: (hrid: string) => hrid === "/actions/crafting/test_item"
    ? {
        upgradeItemHrid: "/items/base_item",
        inputItems: [{ itemHrid: "/items/material", count: 10 }]
      }
    : hrid === "/actions/crafting/material"
      ? { inputItems: [{ itemHrid: "/items/raw", count: 2 }] }
      : undefined,
  getPriceOf: (hrid: string, _level: number, buyStatus: string = state.buyStatus) => ({
    ask: hrid === "/items/base_item" ? 100 : hrid === "/items/raw" ? (buyStatus === "BID" ? 4 : 6) : hrid === "/items/material" ? (buyStatus === "BID" ? 15 : 20) : -1
  })
}))

vi.mock("@/common/apis/player", () => ({
  getBuffOf: (_action: string, type: string) => type === "Artisan" ? state.artisan : 0
}))

vi.mock("@/common/config", () => ({
  SHOP_FIXED_PRICES: {}
}))

vi.mock("@/pinia/stores/game", () => ({
  PriceStatus: { ASK: "ASK", BID: "BID", ASK_LOW: "ASK_LOW", BID_HIGH: "BID_HIGH" },
  useGameStoreOutside: () => ({
    buyStatus: state.buyStatus,
    sellStatus: state.sellStatus,
    marketData: { timestamp: state.timestamp }
  })
}))

describe("single-step manufacture cost", () => {
  beforeEach(() => {
    state.artisan = 0.1
    state.timestamp++
  })

  it("matches enhancer single-step rules and applies Artisan only to input materials", () => {
    expect(getMaterialCostOf("/items/test_item")).toBe(280)
    expect(getMaterialCostBreakdownOf("/items/test_item")).toEqual({
      action: "crafting",
      artisanBuff: 0.1,
      items: [
        {
          hrid: "/items/base_item",
          baseCount: 1,
          count: 1,
          unitPrice: 100,
          subtotal: 100,
          artisanApplied: false,
          priceSource: "market",
          priceStatus: "ASK"
        },
        {
          hrid: "/items/material",
          baseCount: 10,
          count: 9,
          unitPrice: 20,
          subtotal: 180,
          artisanApplied: true,
          priceSource: "market",
          priceStatus: "ASK"
        }
      ],
      total: 280
    })
  })

  it("recalculates when the preset Artisan buff changes", () => {
    expect(getMaterialCostOf("/items/test_item")).toBe(280)
    state.artisan = 0.2
    expect(getMaterialCostOf("/items/test_item")).toBe(260)
  })

  it("supports a per-material market side override", () => {
    const overrides = { "/items/material": "BID" as PriceStatus }
    expect(getMaterialCostOf("/items/test_item", overrides)).toBe(235)
    expect(getMaterialCostBreakdownOf("/items/test_item", overrides)?.items[1]).toMatchObject({
      unitPrice: 15,
      subtotal: 135,
      priceStatus: "BID"
    })
  })

  it("prices a secondary item from either side of its own recipe", () => {
    expect(getMaterialCostOf("/items/test_item", { "/items/material": "CRAFT_ASK" })).toBe(197.2)
    expect(getMaterialCostOf("/items/test_item", { "/items/material": "CRAFT_BID" })).toBe(164.8)
    expect(getMaterialCostBreakdownOf("/items/test_item", { "/items/material": "CRAFT_BID" })?.items[1]).toMatchObject({
      unitPrice: 7.2,
      priceSource: "craft",
      priceStatus: "CRAFT_BID"
    })
  })

  it("rejects self-craft for a material without a recipe before it hides the parent breakdown", () => {
    expect(isMaterialPriceSelectionAvailable("/items/material", "CRAFT_ASK")).toBe(true)
    expect(isMaterialPriceSelectionAvailable("/items/material", "CRAFT_BID")).toBe(true)
    expect(isMaterialPriceSelectionAvailable("/items/raw", "CRAFT_ASK")).toBe(false)
    expect(isMaterialPriceSelectionAvailable("/items/raw", "CRAFT_BID")).toBe(false)
  })
})
