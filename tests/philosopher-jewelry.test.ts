import * as fs from "node:fs"
import * as path from "node:path"
import { expect, it } from "vitest"

it("prices philosopher outputs from the stone bid and applies them in Jungle jewelry workflows", async () => {
  const fakeReq = (result: unknown) => {
    const request: any = { result, error: null }
    setTimeout(() => request.onsuccess?.({ target: request }), 0)
    return request
  }
  const fakeStore = { get: () => fakeReq(undefined), put: () => fakeReq(undefined), delete: () => fakeReq(undefined) }
  const fakeTx: any = { objectStore: () => fakeStore, onerror: null, oncomplete: null, onabort: null }
  const fakeDb = { transaction: () => fakeTx, close: () => {} }
  ;(globalThis as any).indexedDB = { open: () => fakeReq(fakeDb) }

  const { pinia } = await import("@/pinia")
  const { setActivePinia } = await import("pinia")
  const { useGameStore, updateMarketData } = await import("@/pinia/stores/game")
  const { usePlayerStore, defaultActionConfig } = await import("@/pinia/stores/player")
  const { getPriceOf } = await import("@/common/apis/game")
  const { PriceStatus } = await import("@/pinia/stores/game")
  const { calcEnhanceProfit } = await import("@/common/apis/jungle")
  const {
    calculateExpectedJewelryMaterialPrices,
    CRUSHED_STONE,
    PHILOSOPHER_STONE,
    PROTECTION_MIRROR,
    STAR_FRAGMENT
  } = await import("@/calculator/philosopherJewelry")

  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/data.json"), "utf8"))
  const market = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/market.json"), "utf8"))
  setActivePinia(pinia)
  const game = useGameStore(pinia)
  game.gameData = data
  await new Promise(resolve => setTimeout(resolve, 50))
  game.marketData = await updateMarketData(null, market, data)
  game.clearAllCaches()
  await new Promise(resolve => setTimeout(resolve, 50))
  usePlayerStore(pinia).config = defaultActionConfig("Jewelry test", "#409eff") as any

  const prices = calculateExpectedJewelryMaterialPrices()
  expect(prices).not.toBeNull()
  expect(prices!.stoneBid).toBe(getPriceOf(PHILOSOPHER_STONE, 0, PriceStatus.BID).ask)
  expect(prices!.crushedYield).toBeGreaterThan(1)
  expect(prices!.starYield).toBeGreaterThan(1)
  expect(prices!.mirrorYield).toBeGreaterThan(1)
  expect([prices!.crushedStone, prices!.starFragment, prices!.protectionMirror].every(Number.isFinite)).toBe(true)

  const overrides = {
    [PHILOSOPHER_STONE]: prices!.stoneBid,
    [CRUSHED_STONE]: prices!.crushedStone,
    [STAR_FRAGMENT]: prices!.starFragment,
    [PROTECTION_MIRROR]: prices!.protectionMirror
  }
  const rows = await calcEnhanceProfit({
    itemHrids: ["/items/philosophers_ring"],
    ingredientPriceOverrides: overrides
  })
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.every(row => row.calculator.hrid === "/items/philosophers_ring")).toBe(true)
  expect(rows.every(row => Number.isFinite(row.result.profitPH))).toBe(true)
  expect(rows.some(row => row.calculatorList.some(cal => !Array.isArray(cal) && cal.ingredientListWithPrice.some(ing => ing.hrid === STAR_FRAGMENT && ing.price === prices!.starFragment)))).toBe(true)
}, 60000)
