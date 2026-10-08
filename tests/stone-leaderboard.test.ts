import { readFileSync } from "node:fs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TransmuteCalculator } from "@/calculator/alchemy"
import { computeStoneLeaderboard } from "@/calculator/alchemyChain"
import { stoneEquipmentStandardPrice } from "@/calculator/stonePricing"
import { SELL_TAX_FACTOR } from "@/common/constants/market"

const state = vi.hoisted(() => ({
  items: {} as Record<string, any>,
  asks: {} as Record<string, Record<number, number>>,
  craftCost: -1,
  manualPrice: undefined as number | undefined
}))
const BODY = "/items/anchorbound_plate_body"
const STAFF = "/items/infernal_battlestaff"

vi.mock("@/common/apis/game", () => ({
  getGameDataApi: () => ({ itemDetailMap: state.items }),
  getItemDetailOf: (hrid: string) => state.items[hrid],
  getPriceOf: (hrid: string, level = 0) => ({ ask: state.asks[hrid]?.[level] ?? -1, bid: 540000000 }),
  getCatalystAskOf: () => 20000,
  getAlchemyRareDropTable: () => [],
  getAlchemyEssenceDropTable: () => [],
  getTransmuteTimeCost: () => 6000000000,
  getTransmuteExp: () => 1
}))
vi.mock("@/common/apis/game/craft", () => ({
  getCraftCostOf: () => state.craftCost,
  getMaterialCostBreakdownOf: () => state.craftCost < 0 ? null : { total: state.craftCost }
}))
vi.mock("@/common/apis/player", () => ({
  getBuffOf: (_action: string, type: string) => type === "Success" ? 0.3 : 0,
  getAlchemySuccessRatio: () => 0,
  getPlayerLevelOf: () => 100,
  getTeaIngredientList: () => []
}))
vi.mock("@/common/apis/price", () => ({
  getManualPriceOf: (hrid: string) => hrid !== "/items/anchorbound_plate_body" || state.manualPrice === undefined
    ? null
    : { ask: { manual: true, manualPrice: state.manualPrice } }
}))
vi.mock("@/pinia/stores/game", () => ({ COIN_HRID: "/items/coin" }))
vi.mock("@/locales", () => ({ getTrans: (value: string) => value }))

const options = { catalystRank: 0, sellTaxFactor: 1, includeRare: false }

describe("stone source pricing", () => {
  beforeEach(() => {
    const data = JSON.parse(readFileSync("public/data/data.json", "utf8"))
    state.items = Object.fromEntries([BODY, STAFF].map(hrid => [hrid, data.itemDetailMap[hrid]]))
    state.asks = { [BODY]: { 0: 78600000 }, [STAFF]: { 0: 8730000 } }
    state.craftCost = -1
    state.manualPrice = undefined
  })

  it("converts per-stone margin to per-action profit and explains the different ranking", () => {
    const rows = computeStoneLeaderboard(options).rows
    expect(rows[0].hrid).toBe(STAFF)
    const profits: Record<string, number> = {}
    for (const row of rows) {
      const calc = new TransmuteCalculator({ hrid: row.hrid, catalystRank: 0, includeRare: false, sellTaxFactor: 1 }).run()
      expect((540000000 - row.costPerStone) * row.stonesPerAction).toBeCloseTo(calc.result.profitPP, 6)
      profits[row.hrid] = calc.result.profitPH
      const taxed = computeStoneLeaderboard({ ...options, sellTaxFactor: SELL_TAX_FACTOR }).rows.find(item => item.hrid === row.hrid)!
      // With no byproducts, selling tax changes the margin but not acquisition cost.
      expect(taxed.costPerStone).toBeCloseTo(row.costPerStone, 6)
      expect(540000000 - 540000000 * SELL_TAX_FACTOR).toBe(21600000)
    }
    expect(profits[BODY]).toBeGreaterThan(profits[STAFF])
  })

  it.each([true, false])("uses the cheapest enhanced-level price, with a +0 listing: %s", (hasBaseListing) => {
    state.asks[BODY] = { 0: hasBaseListing ? 100000000 : -1, 5: 70000000 }
    const row = computeStoneLeaderboard(options).rows.find(item => item.hrid === BODY)!
    expect(row.buyPrice).toBe(70000000)
    expect(row.costPerStone).toBeCloseTo((row.sourceCount * 70000000 + 900000) / row.stonesPerAction, 6)
    const standard = stoneEquipmentStandardPrice(row, 540000000)!
    expect(standard * row.sourceCount + 900000).toBeCloseTo(540000000 * row.stonesPerAction, 6)
  })

  it("keeps the displayed market buy price when the global ledger has another price", () => {
    state.manualPrice = 1
    const row = computeStoneLeaderboard(options).rows.find(item => item.hrid === BODY)!
    expect(row.buyPrice).toBe(78600000)
    expect(row.costPerStone).toBeCloseTo((row.sourceCount * row.buyPrice + 900000) / row.stonesPerAction, 6)
  })

  it("locks the single-step crafting fallback even when the ledger has another price", () => {
    state.asks[BODY] = {}
    state.craftCost = 60000000
    state.manualPrice = 1
    const row = computeStoneLeaderboard(options).rows.find(item => item.hrid === BODY)!
    expect(row.useCraft).toBe(true)
    expect(row.buyPrice).toBe(60000000)
    expect(row.costPerStone).toBeCloseTo((row.sourceCount * row.buyPrice + 900000) / row.stonesPerAction, 6)
  })
})
