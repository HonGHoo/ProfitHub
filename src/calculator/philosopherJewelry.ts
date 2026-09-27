import { getActionDetailOf, getPriceOf } from "@/common/apis/game"
import { PriceStatus } from "@/pinia/stores/game"
import { TransmuteCalculator } from "./alchemy"
import { EnhanceCalculator } from "./enhance"
import { ManufactureCalculator } from "./manufacture"

export const PHILOSOPHER_STONE = "/items/philosophers_stone"
export const CRUSHED_STONE = "/items/crushed_philosophers_stone"
export const STAR_FRAGMENT = "/items/star_fragment"
export const SUNSTONE = "/items/sunstone"
export const PROTECTION_MIRROR = "/items/mirror_of_protection"
export const PHILOSOPHER_JEWELRY = [
  "/items/philosophers_ring",
  "/items/philosophers_earrings",
  "/items/philosophers_necklace"
] as const

export interface ExpectedJewelryMaterialPrices {
  stoneBid: number
  crushedStone: number
  starFragment: number
  sunstone: number
  protectionMirror: number
  transmuteCost: number
  crushedYield: number
  starYield: number
  sunstoneYield: number
  mirrorYield: number
}

export interface CraftedLowJewelry {
  hrid: string
  /** 制作一件贤者首饰的实际期望消耗，含工匠节省。 */
  requiredCount: number
  unitCost: number
  totalCost: number
  hours: number
}

export interface PhilosopherJewelryWageRow {
  hrid: string
  enhanceLevel: number
  protectLevel: number
  actions: number
  profitPH: number
  costPH: number
  incomePH: number
  costPerItem: number
  incomePerItem: number
  craftedCost: number
  craftHours: number
  enhanceHours: number
  lowJewelry: CraftedLowJewelry[]
}

function expectedOutputPerAction(calc: ManufactureCalculator, hrid: string): number {
  return calc.productList
    .filter(item => item.hrid === hrid)
    .reduce((sum, item) => sum + item.count * (item.rate ?? 1) * calc.successRate, 0)
}

/**
 * 低级首饰全部按当前制作配方自制，星碎按贤者石转化期望价计入；
 * 再制作贤者首饰并从 +0 强化。强化收益沿用打野页的 EnhanceCalculator，
 * 在其工时上补齐所有低级首饰及贤者首饰的制作时间。
 */
export function calculatePhilosopherJewelryWages(
  hrid: string,
  prices: ExpectedJewelryMaterialPrices
): PhilosopherJewelryWageRow[] {
  if (!PHILOSOPHER_JEWELRY.includes(hrid as typeof PHILOSOPHER_JEWELRY[number])) return []
  const action = getActionDetailOf(`/actions/crafting/${hrid.split("/").pop()}`)
  if (!action) return []
  const materialOverrides: Record<string, number> = {
    [PHILOSOPHER_STONE]: prices.stoneBid,
    [CRUSHED_STONE]: prices.crushedStone,
    [STAR_FRAGMENT]: prices.starFragment,
    [PROTECTION_MIRROR]: prices.protectionMirror
  }
  const lowUnitHours = new Map<string, number>()
  for (const input of action.inputItems) {
    const lowHrid = input.itemHrid
    const low = new ManufactureCalculator({
      hrid: lowHrid,
      project: "制作低级首饰",
      action: "crafting",
      includeRare: false,
      ingredientPriceOverrides: materialOverrides
    })
    if (!low.available || !low.valid) return []
    const output = expectedOutputPerAction(low, lowHrid)
    if (output <= 0) return []
    materialOverrides[lowHrid] = low.cost / output
    lowUnitHours.set(lowHrid, 1 / (low.actionsPH * output))
  }

  const craft = new ManufactureCalculator({
    hrid,
    project: "制作贤者首饰",
    action: "crafting",
    includeRare: false,
    ingredientPriceOverrides: materialOverrides
  })
  if (!craft.available || !craft.valid) return []
  const output = expectedOutputPerAction(craft, hrid)
  if (output <= 0) return []
  const lowJewelry = craft.ingredientListWithPrice
    .filter(item => lowUnitHours.has(item.hrid))
    .map((item) => {
      const requiredCount = item.count / output
      return {
        hrid: item.hrid,
        requiredCount,
        unitCost: item.price,
        totalCost: item.price * requiredCount,
        hours: requiredCount * lowUnitHours.get(item.hrid)!
      }
    })
  // 每一件贤者首饰都需要制作全部低级首饰；总制作时间含两层制作。
  const craftHours = 1 / (craft.actionsPH * output)
    + lowJewelry.reduce((sum, item) => sum + item.hours, 0)
  const craftedCost = craft.cost / output
  const enhanceOverrides = { ...materialOverrides, [hrid]: craftedCost }
  const rows: PhilosopherJewelryWageRow[] = []

  for (let enhanceLevel = 1; enhanceLevel <= 20; enhanceLevel++) {
    let best: PhilosopherJewelryWageRow | null = null
    for (let protectLevel = enhanceLevel > 2 ? 2 : enhanceLevel; protectLevel <= enhanceLevel; protectLevel++) {
      const enhance = new EnhanceCalculator({
        hrid,
        enhanceLevel,
        protectLevel,
        ingredientPriceOverrides: enhanceOverrides
      })
      if (!enhance.available || !enhance.valid || enhance.productListWithPrice[0].price < 0) continue
      enhance.run()
      if (!Number.isFinite(enhance.result.profitPH)
        || !Number.isFinite(enhance.result.costPH)
        || !Number.isFinite(enhance.result.incomePH)) {
        continue
      }
      const { actions } = enhance.enhancelate()
      const enhanceHours = actions / enhance.actionsPH
      const totalHours = craftHours + enhanceHours
      if (!Number.isFinite(totalHours) || totalHours <= 0) continue
      const row: PhilosopherJewelryWageRow = {
        hrid,
        enhanceLevel,
        protectLevel,
        actions,
        profitPH: enhance.result.profitPH * enhanceHours / totalHours,
        costPH: enhance.result.costPH * enhanceHours / totalHours,
        incomePH: enhance.result.incomePH * enhanceHours / totalHours,
        costPerItem: enhance.result.costPH * enhanceHours,
        incomePerItem: enhance.result.incomePH * enhanceHours,
        craftedCost,
        craftHours,
        enhanceHours,
        lowJewelry
      }
      if (!best || row.profitPH > best.profitPH) best = row
    }
    if (best) rows.push(best)
  }
  return rows
}

/** 按转化的联合产出市值分摊一次投入，避免星碎与保护镜重复承担整颗贤者石成本。 */
export function calculateExpectedJewelryMaterialPrices(): ExpectedJewelryMaterialPrices | null {
  // 右收价作为买入成本，不随全局买价档位改变。
  const stoneBid = getPriceOf(PHILOSOPHER_STONE, 0, PriceStatus.BID).ask
  if (stoneBid < 0) return null
  const ingredientPriceOverrides = { [PHILOSOPHER_STONE]: stoneBid }

  const craft = new ManufactureCalculator({
    hrid: CRUSHED_STONE,
    project: "制作贤者碎",
    action: "crafting",
    ingredientPriceOverrides
  })
  const transmute = new TransmuteCalculator({
    hrid: PHILOSOPHER_STONE,
    ingredientPriceOverrides,
    includeRare: false
  })
  if (!craft.available || !transmute.available || !craft.valid || !transmute.valid) return null

  const crushedYield = expectedOutputPerAction(craft, CRUSHED_STONE)
  const yieldOf = (hrid: string) => transmute.productList
    .filter(item => item.hrid === hrid)
    .reduce((sum, item) => sum + item.count * (item.rate ?? 1) * transmute.successRate, 0)
  const starYield = yieldOf(STAR_FRAGMENT)
  const sunstoneYield = yieldOf(SUNSTONE)
  const mirrorYield = yieldOf(PROTECTION_MIRROR)
  if (crushedYield <= 0 || starYield <= 0 || sunstoneYield <= 0 || mirrorYield <= 0) return null

  const bidOf = (hrid: string) => transmute.productListWithPrice.find(item => item.hrid === hrid)?.price ?? -1
  const starBid = bidOf(STAR_FRAGMENT)
  const sunstoneBid = bidOf(SUNSTONE)
  const mirrorBid = bidOf(PROTECTION_MIRROR)
  if (starBid <= 0 || sunstoneBid <= 0 || mirrorBid <= 0) return null
  const expectedMarketValue = starYield * starBid + sunstoneYield * sunstoneBid + mirrorYield * mirrorBid
  if (!Number.isFinite(expectedMarketValue) || expectedMarketValue <= 0) return null
  const allocationFactor = transmute.cost / expectedMarketValue

  return {
    stoneBid,
    crushedStone: craft.cost / crushedYield,
    starFragment: starBid * allocationFactor,
    sunstone: sunstoneBid * allocationFactor,
    protectionMirror: mirrorBid * allocationFactor,
    transmuteCost: transmute.cost,
    crushedYield,
    starYield,
    sunstoneYield,
    mirrorYield
  }
}
