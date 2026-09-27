import * as fs from "node:fs"
import * as path from "node:path"
import { expect, it } from "vitest"

it("crafts every lower jewelry component before valuing philosopher jewelry enhancement", async () => {
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
  const {
    calculateExpectedJewelryMaterialPrices,
    calculatePhilosopherJewelryWages,
    PHILOSOPHER_JEWELRY,
    PHILOSOPHER_STONE,
    STAR_FRAGMENT
  } = await import("@/calculator/philosopherJewelry")
  const { getActionDetailOf } = await import("@/common/apis/game")

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
  expect(prices!.sunstoneYield).toBeGreaterThan(1)
  expect([prices!.crushedStone, prices!.starFragment, prices!.protectionMirror].every(Number.isFinite)).toBe(true)
  expect(prices!.starFragment * prices!.starYield
    + prices!.sunstone * prices!.sunstoneYield
    + prices!.protectionMirror * prices!.mirrorYield).toBeCloseTo(prices!.transmuteCost, 2)

  expect(prices!.starFragment).not.toBe(getPriceOf(STAR_FRAGMENT).ask)
  for (const hrid of PHILOSOPHER_JEWELRY) {
    const rows = calculatePhilosopherJewelryWages(hrid, prices!)
    const required = getActionDetailOf(`/actions/crafting/${hrid.split("/").pop()}`)
      .inputItems
      .map(item => item.itemHrid)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.hrid === hrid)).toBe(true)
    expect(rows.every(row => Number.isFinite(row.profitPH))).toBe(true)
    expect(rows.every(row => Math.abs(row.incomePerItem - row.costPerItem - row.profitPH * (row.craftHours + row.enhanceHours)) < 1)).toBe(true)
    expect(rows.every(row => row.lowJewelry.map(item => item.hrid).sort().join() === [...required].sort().join())).toBe(true)
    expect(rows.every(row => row.lowJewelry.every(item => item.requiredCount > 0 && item.hours > 0))).toBe(true)
    expect(rows[0].lowJewelry.some(item => item.unitCost !== getPriceOf(item.hrid).ask)).toBe(true)
    expect(rows.every(row => row.craftHours > rows[0].lowJewelry.reduce((sum, item) => sum + item.hours, 0))).toBe(true)
  }
}, 60000)
