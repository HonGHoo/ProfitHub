import { beforeEach, describe, expect, it, vi } from "vitest"
import { getMaterialCostOf } from "@/common/apis/game/craft"

const state = vi.hoisted(() => ({
  artisan: 0.1,
  buyStatus: "ask",
  sellStatus: "bid",
  timestamp: 1
}))

vi.mock("@/common/apis/game", () => ({
  getActionDetailOf: (hrid: string) => hrid === "/actions/crafting/test_item"
    ? {
        upgradeItemHrid: "/items/base_item",
        inputItems: [{ itemHrid: "/items/material", count: 10 }]
      }
    : undefined,
  getPriceOf: (hrid: string) => ({
    ask: hrid === "/items/base_item" ? 100 : hrid === "/items/material" ? 20 : -1
  })
}))

vi.mock("@/common/apis/player", () => ({
  getBuffOf: (_action: string, type: string) => type === "Artisan" ? state.artisan : 0
}))

vi.mock("@/common/config", () => ({
  SHOP_FIXED_PRICES: {}
}))

vi.mock("@/pinia/stores/game", () => ({
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
  })

  it("recalculates when the preset Artisan buff changes", () => {
    expect(getMaterialCostOf("/items/test_item")).toBe(280)
    state.artisan = 0.2
    expect(getMaterialCostOf("/items/test_item")).toBe(260)
  })
})
