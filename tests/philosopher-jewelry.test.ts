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
  const { clearEnhancelateCache, getPriceOf } = await import("@/common/apis/game")
  const { getBuffOf, runWithPlayerContext } = await import("@/common/apis/player")
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
  expect(prices!.stoneAsk).toBe(game.marketData!.marketData[PHILOSOPHER_STONE][0].ask)
  expect(prices!.stoneAsk).not.toBe(game.marketData!.marketData[PHILOSOPHER_STONE][0].bid)
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
    expect(rows.every(row => Math.abs(row.incomePerItem - row.costPerItem - row.profitPH * (row.craftHours + row.enhanceHours)) < Math.max(1, row.costPerItem * 1e-12))).toBe(true)
    expect(rows.every(row => row.lowJewelry.map(item => item.hrid).sort().join() === [...required].sort().join())).toBe(true)
    expect(rows.every(row => row.lowJewelry.every(item => item.requiredCount > 0 && item.hours > 0))).toBe(true)
    expect(rows[0].lowJewelry.some(item => item.unitCost !== getPriceOf(item.hrid).ask)).toBe(true)
    expect(rows.every(row => row.craftHours > rows[0].lowJewelry.reduce((sum, item) => sum + item.hours, 0))).toBe(true)
  }

  const weakConfig = defaultActionConfig("weak enhancer", "#409eff")
  weakConfig.actionConfigMap.get("enhancing")!.tool = {
    type: "enhancing_tool",
    hrid: "/items/cheese_enhancer",
    enhanceLevel: 0
  }
  const strongConfig = defaultActionConfig("strong enhancer", "#409eff")
  strongConfig.actionConfigMap.get("enhancing")!.tool = {
    type: "enhancing_tool",
    hrid: "/items/celestial_enhancer",
    enhanceLevel: 20
  }
  const weakSuccess = runWithPlayerContext(weakConfig, () => getBuffOf("enhancing", "Success"))
  const strongSuccess = runWithPlayerContext(strongConfig, () => getBuffOf("enhancing", "Success"))
  expect(strongSuccess).toBeGreaterThan(weakSuccess)
  clearEnhancelateCache()
  const weakRow = runWithPlayerContext(weakConfig, () => calculatePhilosopherJewelryWages(PHILOSOPHER_JEWELRY[0], prices!).find(row => row.enhanceLevel === 10))
  clearEnhancelateCache()
  const strongRow = runWithPlayerContext(strongConfig, () => calculatePhilosopherJewelryWages(PHILOSOPHER_JEWELRY[0], prices!).find(row => row.enhanceLevel === 10))
  expect(weakRow).toBeDefined()
  expect(strongRow).toBeDefined()
  expect(strongRow!.actions).toBeLessThan(weakRow!.actions)
  expect(strongRow!.craftedCost).toBeCloseTo(weakRow!.craftedCost)

  const noStoneBid = structuredClone(market)
  noStoneBid.marketData[PHILOSOPHER_STONE][0].b = -1
  game.marketData = await updateMarketData(null, noStoneBid, data)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(calculateExpectedJewelryMaterialPrices()?.stoneAsk).toBe(game.marketData.marketData[PHILOSOPHER_STONE][0].ask)

  const noStoneAsk = structuredClone(market)
  noStoneAsk.marketData[PHILOSOPHER_STONE][0].a = -1
  game.marketData = await updateMarketData(game.marketData, noStoneAsk, data)
  await new Promise(resolve => setTimeout(resolve, 50))
  expect(game.marketData.marketData[PHILOSOPHER_STONE][0].ask).toBe(-1)
  expect(game.marketData.marketData[PHILOSOPHER_STONE][0].bid).toBeGreaterThan(0)
  expect(calculateExpectedJewelryMaterialPrices()).toBeNull()
}, 60000)
