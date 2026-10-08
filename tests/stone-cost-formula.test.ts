import type { StoneSourceRow } from "@/calculator/alchemyChain"
import * as fs from "node:fs"
import * as path from "node:path"
import { mount } from "@vue/test-utils"
import { beforeAll, expect, it } from "vitest"

let compute: typeof import("@/calculator/alchemyChain").computeStoneLeaderboard
let Formula: typeof import("@/pages/stone/StoneCostFormula.vue").default
let i18n: typeof import("@/locales").default

beforeAll(async () => {
  const fakeReq = (result: unknown) => {
    const request: any = { result, error: null }
    setTimeout(() => request.onsuccess?.({ target: request }), 0)
    return request
  }
  const store = { get: () => fakeReq(undefined), put: () => fakeReq(undefined), delete: () => fakeReq(undefined) }
  const db = { transaction: () => ({ objectStore: () => store }), close: () => {} }
  ;(globalThis as any).indexedDB = { open: () => fakeReq(db) }

  const { pinia } = await import("@/pinia")
  const { setActivePinia } = await import("pinia")
  const { useGameStore, updateMarketData } = await import("@/pinia/stores/game")
  const { usePlayerStore, defaultActionConfig } = await import("@/pinia/stores/player")
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/data.json"), "utf8"))
  const market = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/data/market.json"), "utf8"))
  setActivePinia(pinia)
  const game = useGameStore(pinia)
  game.gameData = data
  await new Promise(resolve => setTimeout(resolve, 50))
  game.marketData = await updateMarketData(null, market, data)
  game.clearAllCaches()
  await new Promise(resolve => setTimeout(resolve, 50))
  usePlayerStore(pinia).config = defaultActionConfig("Formula test", "#409eff") as any
  compute = (await import("@/calculator/alchemyChain")).computeStoneLeaderboard
  Formula = (await import("@/pages/stone/StoneCostFormula.vue")).default
  i18n = (await import("@/locales")).default
}, 30000)

function verifyBreakdown(row: StoneSourceRow) {
  const detail = row.actionBreakdown!
  expect(detail).toBeDefined()
  expect(detail.inputs.reduce((sum, item) => sum + item.subtotal, 0)).toBeCloseTo(detail.totalCost, 4)
  expect(detail.byproducts.reduce((sum, item) => sum + item.subtotal, 0)).toBeCloseTo(row.byproductIncome, 4)
  expect(detail.stoneCount * detail.stoneDropRate * detail.successRate).toBeCloseTo(row.stonesPerAction, 10)
  expect((detail.totalCost - row.byproductIncome) / row.stonesPerAction).toBeCloseTo(row.costPerStone, 4)
}

it("reconciles every displayed input and after-tax byproduct with both leaderboard methods", () => {
  for (const sellTaxFactor of [0.96, 1]) {
    for (const includeRare of [true, false]) {
      const rows = compute({ catalystRank: -1, sellTaxFactor, includeRare, craftMode: true }).rows.filter(row => row.stonesPerAction > 0)
      expect(rows.some(row => row.method === "transmute")).toBe(true)
      expect(rows.some(row => row.method === "decompose")).toBe(true)
      rows.forEach(verifyBreakdown)
    }
  }
})

it("renders full costs and updates the per-stone equation after a custom equipment price", async () => {
  const options = { catalystRank: 1, sellTaxFactor: 0.96, includeRare: true, craftMode: true }
  const row = compute(options).rows.find(row => row.stonesPerAction > 0 && row.craftBreakdown && row.useCraft)!
  expect(row).toBeDefined()
  const wrapper = mount(Formula, { props: { row }, global: { plugins: [i18n] } })
  expect(wrapper.text()).toContain("制作材料成本")
  expect(wrapper.text()).toContain("单次总投入")
  expect(wrapper.text()).toContain("期望贤者数量")
  expect(wrapper.text()).toContain("副产物抵扣合计")
  expect(wrapper.text()).toContain("贤者成本（单颗净成本）")
  const originalResult = wrapper.find(".formula-result").text()
  const updated = compute({ ...options, sourcePriceOverrides: { [row.hrid]: 123456789 } }).rows.find(item => item.hrid === row.hrid)!
  verifyBreakdown(updated)
  expect(updated.customBuyPrice).toBe(true)
  expect(updated.actionBreakdown!.inputs.find(item => item.hrid === row.hrid)?.unitPrice).toBe(123456789)
  await wrapper.setProps({ row: updated })
  expect(wrapper.text()).toContain("自定义价格")
  expect(wrapper.text()).toContain("123,456,789")
  expect(wrapper.find(".formula-result").text()).not.toBe(originalResult)
  await wrapper.setProps({ row: { ...updated, stonesPerAction: 0, actionBreakdown: undefined } })
  expect(wrapper.text()).toContain("缺少价格或有效产出")
  expect(wrapper.find(".formula-result").exists()).toBe(false)
  wrapper.unmount()
})
