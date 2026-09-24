import { getActionDetailOf, getPriceOf } from "@/common/apis/game"
import { getBuffOf } from "@/common/apis/player"
import { SHOP_FIXED_PRICES } from "@/common/config"
import { PriceStatus, useGameStoreOutside } from "@/pinia/stores/game"

/** 制造系动作（锻造/制造/裁缝），与强化页 calcBestManufacturePlan 同口径 */
const MANUFACTURE_ACTIONS = ["cheesesmithing", "crafting", "tailoring"] as const
export type ManufactureAction = typeof MANUFACTURE_ACTIONS[number]
export type MaterialPriceSource = "market" | "shop" | "craft"
export type MaterialPriceSelection = PriceStatus | "CRAFT_ASK" | "CRAFT_BID"

/** 只展示能算出有效价格的次级材料选项，避免整条来源成本变为空。 */
export function isMaterialPriceSelectionAvailable(hrid: string, selection: MaterialPriceSelection): boolean {
  if (selection === "CRAFT_ASK") return getMaterialCostOf(hrid, {}, PriceStatus.ASK) >= 0
  if (selection === "CRAFT_BID") return getMaterialCostOf(hrid, {}, PriceStatus.BID) >= 0
  return true
}

export interface FinalStepMaterialCostItem {
  hrid: string
  /** 配方标称数量（工匠节省前） */
  baseCount: number
  /** 实际计价数量（工匠节省后） */
  count: number
  unitPrice: number
  subtotal: number
  artisanApplied: boolean
  priceSource: MaterialPriceSource
  priceStatus: MaterialPriceSelection
}

export interface FinalStepMaterialCostBreakdown {
  action: ManufactureAction
  artisanBuff: number
  items: FinalStepMaterialCostItem[]
  total: number
}

const craftCostCache = new Map<string, number>()

/**
 * 递归估算：有卖单直接用卖单价；无卖单按配方原料逐级自制
 * （无卖单的中间品继续往下递归），深度耗尽仍无法定价返回 -1。
 * 估算口径：忽略茶水补正与工匠折减。
 */
function craftCostRecursive(hrid: string, depth: number): number {
  const ask = getPriceOf(hrid, 0).ask
  if (ask >= 0) return ask
  if (depth <= 0) return -1
  const key = hrid.substring(hrid.lastIndexOf("/") + 1)
  let best = -1
  for (const action of MANUFACTURE_ACTIONS) {
    const ad = getActionDetailOf(`/actions/${action}/${key}`)
    if (!ad) continue
    let cost = 0
    let ok = true
    if (ad.upgradeItemHrid) {
      const p = craftCostRecursive(ad.upgradeItemHrid, depth - 1)
      if (p < 0) {
        ok = false
        break
      }
      cost += p
    }
    for (const input of ad.inputItems) {
      const p = craftCostRecursive(input.itemHrid, depth - 1)
      if (p < 0) {
        ok = false
        break
      }
      cost += p * input.count
    }
    if (ok && (best < 0 || cost < best)) best = cost
  }
  return best
}

/**
 * 无卖单物品的制造成本（有卖单时返回卖单价本身）。
 * 买价侧专用：买不到就自己造，按配方估算。
 * 返回 -1 = 既无卖单也算不出自制成本。
 * 结果按市场数据时间戳缓存，市场刷新自动失效。
 */
export function getCraftCostOf(hrid: string): number {
  const gameStore = useGameStoreOutside()
  const ts = gameStore.marketData?.timestamp ?? 0
  const cacheKey = `${ts}|${gameStore.buyStatus}|${gameStore.sellStatus}|${hrid}`
  const cached = craftCostCache.get(cacheKey)
  if (cached !== undefined) return cached
  const value = craftCostRecursive(hrid, 3)
  craftCostCache.set(cacheKey, value)
  return value
}

/**
 * 与强化页「单步配方」相同口径的单次制造成本：只计算最终配方，
 * 输入材料应用当前预设的工匠节省；材料缺价时依次回退商店固定价、制造成本。
 * 多配方取最便宜，无制造配方返回 -1。
 */
function resolveMaterialPrice(hrid: string, priceStatus: MaterialPriceSelection): { price: number, source: MaterialPriceSource } {
  const gameStore = useGameStoreOutside()
  if (priceStatus === "CRAFT_ASK" || priceStatus === "CRAFT_BID") {
    const side = priceStatus === "CRAFT_ASK" ? PriceStatus.ASK : PriceStatus.BID
    return { price: getMaterialCostOf(hrid, {}, side), source: "craft" }
  }
  const marketAsk = getPriceOf(hrid, 0, priceStatus, gameStore.sellStatus).ask
  if (marketAsk >= 0) return { price: marketAsk, source: "market" }
  const shopPrice = SHOP_FIXED_PRICES[hrid]
  if (typeof shopPrice === "number") return { price: shopPrice, source: "shop" }
  return { price: getCraftCostOf(hrid), source: "craft" }
}

function finalStepMaterialCost(hrid: string, priceStatusOverrides: Record<string, MaterialPriceSelection>, defaultPriceStatus: PriceStatus): FinalStepMaterialCostBreakdown | null {
  const key = hrid.substring(hrid.lastIndexOf("/") + 1)
  let best: FinalStepMaterialCostBreakdown | null = null
  for (const action of MANUFACTURE_ACTIONS) {
    const ad = getActionDetailOf(`/actions/${action}/${key}`)
    if (!ad) continue
    const items: FinalStepMaterialCostItem[] = []
    let ok = true
    if (ad.upgradeItemHrid) {
      const priceStatus = priceStatusOverrides[ad.upgradeItemHrid] ?? defaultPriceStatus
      const resolved = resolveMaterialPrice(ad.upgradeItemHrid, priceStatus)
      if (resolved.price < 0) {
        ok = false
      } else {
        items.push({
          hrid: ad.upgradeItemHrid,
          baseCount: 1,
          count: 1,
          unitPrice: resolved.price,
          subtotal: resolved.price,
          artisanApplied: false,
          priceSource: resolved.source,
          priceStatus
        })
      }
    }
    const artisanBuff = getBuffOf(action, "Artisan")
    if (ok) {
      for (const input of ad.inputItems) {
        const priceStatus = priceStatusOverrides[input.itemHrid] ?? defaultPriceStatus
        const resolved = resolveMaterialPrice(input.itemHrid, priceStatus)
        if (resolved.price < 0) {
          ok = false
          break
        }
        const count = input.count * (1 - artisanBuff)
        items.push({
          hrid: input.itemHrid,
          baseCount: input.count,
          count,
          unitPrice: resolved.price,
          subtotal: resolved.price * count,
          artisanApplied: true,
          priceSource: resolved.source,
          priceStatus
        })
      }
    }
    if (!ok) continue
    const total = items.reduce((sum, item) => sum + item.subtotal, 0)
    if (!best || total < best.total) best = { action, artisanBuff, items, total }
  }
  return best
}

const materialCostCache = new Map<string, FinalStepMaterialCostBreakdown | null>()

export function getMaterialCostBreakdownOf(hrid: string, priceStatusOverrides: Record<string, MaterialPriceSelection> = {}, defaultPriceStatus?: PriceStatus): FinalStepMaterialCostBreakdown | null {
  const gameStore = useGameStoreOutside()
  const effectivePriceStatus = defaultPriceStatus ?? gameStore.buyStatus
  const ts = gameStore.marketData?.timestamp ?? 0
  const artisanKey = MANUFACTURE_ACTIONS.map(action => getBuffOf(action, "Artisan")).join("|")
  const overrideKey = Object.entries(priceStatusOverrides).sort(([a], [b]) => a.localeCompare(b)).map(([itemHrid, status]) => `${itemHrid}:${status}`).join(",")
  const cacheKey = `${ts}|${gameStore.buyStatus}|${gameStore.sellStatus}|${effectivePriceStatus}|${artisanKey}|${hrid}|${overrideKey}`
  const cached = materialCostCache.get(cacheKey)
  if (cached !== undefined) return cached
  const value = finalStepMaterialCost(hrid, priceStatusOverrides, effectivePriceStatus)
  materialCostCache.set(cacheKey, value)
  return value
}

export function getMaterialCostOf(hrid: string, priceStatusOverrides: Record<string, MaterialPriceSelection> = {}, defaultPriceStatus?: PriceStatus): number {
  return getMaterialCostBreakdownOf(hrid, priceStatusOverrides, defaultPriceStatus)?.total ?? -1
}
