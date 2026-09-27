import { getPriceOf } from "@/common/apis/game"
import { PriceStatus } from "@/pinia/stores/game"
import { TransmuteCalculator } from "./alchemy"
import { ManufactureCalculator } from "./manufacture"

export const PHILOSOPHER_STONE = "/items/philosophers_stone"
export const CRUSHED_STONE = "/items/crushed_philosophers_stone"
export const STAR_FRAGMENT = "/items/star_fragment"
export const PROTECTION_MIRROR = "/items/mirror_of_protection"

export interface ExpectedJewelryMaterialPrices {
  stoneBid: number
  crushedStone: number
  starFragment: number
  protectionMirror: number
  crushedYield: number
  starYield: number
  mirrorYield: number
}

/** 每种产物单独按完整投入 ÷ 期望产量估价，与市场单价替换口径一致。 */
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
    ingredientPriceOverrides
  })
  if (!craft.available || !transmute.available || !craft.valid || !transmute.valid) return null

  const crushedYield = craft.productList
    .filter(item => item.hrid === CRUSHED_STONE)
    .reduce((sum, item) => sum + item.count * (item.rate ?? 1) * craft.successRate, 0)
  const starYield = transmute.productList
    .filter(item => item.hrid === STAR_FRAGMENT)
    .reduce((sum, item) => sum + item.count * (item.rate ?? 1) * transmute.successRate, 0)
  const mirrorYield = transmute.productList
    .filter(item => item.hrid === PROTECTION_MIRROR)
    .reduce((sum, item) => sum + item.count * (item.rate ?? 1) * transmute.successRate, 0)
  if (crushedYield <= 0 || starYield <= 0 || mirrorYield <= 0) return null

  return {
    stoneBid,
    crushedStone: craft.cost / crushedYield,
    starFragment: transmute.cost / starYield,
    protectionMirror: transmute.cost / mirrorYield,
    crushedYield,
    starYield,
    mirrorYield
  }
}
