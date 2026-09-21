import type { OpportunityFamily, OpportunityOptions, OpportunityProgress, OpportunityResult, OpportunityRow } from "./types"
import type Calculator from "@/calculator"
import type { SuperAlchemyRow } from "@/calculator/superAlchemy"
import { computeSuperAlchemy } from "@/calculator/superAlchemy"
import { getPriceOf } from "@/common/apis/game"
import { calcEnhanceProfit as calcManufactureEnhanceProfit } from "@/common/apis/jungle"
import { calcEnhanceProfit as calcInheritEnhanceProfit } from "@/common/apis/jungle/junglerit"
import { calcSuperEnhanceProfit } from "@/common/apis/jungle/junglest"
import { getLeaderboardDataApi } from "@/common/apis/leaderboard"
import { getLeaderboardDataApi as getManualchemyDataApi } from "@/common/apis/manualchemy"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { usePlayerStoreOutside } from "@/pinia/stores/player"

export * from "./types"

const ALL_FAMILIES: OpportunityFamily[] = ["单步/制作", "制作炼金", "多步炼金", "直接强化", "制作强化", "继承强化"]

function workflowStepCount(cal: Calculator) {
  const list = (cal as any).calculatorList
  return Array.isArray(list) ? list.flat().length : 1
}

function calculatorRow(cal: Calculator, family: OpportunityFamily): OpportunityRow | null {
  const result = cal.result
  if (!result || !Number.isFinite(result.profitPH)) return null
  const level = cal.enhanceLevel || 0
  const volume1h = getPriceOf(cal.hrid, level).vol
  return {
    id: `${family}:${cal.id}`,
    family,
    name: result.name || cal.key,
    hrid: cal.hrid,
    project: result.project || cal.project,
    stepCount: workflowStepCount(cal),
    profitPH: result.profitPH,
    profitRate: result.profitRate || 0,
    costPH: result.costPH || 0,
    incomePH: result.incomePH || 0,
    volume1h: typeof volume1h === "number" ? volume1h : -1,
    status: cal.valid ? "priced" : "unpriced",
    calculator: cal
  }
}

function superAlchemyRow(row: SuperAlchemyRow): OpportunityRow {
  const timePerUnit = row.eval.timePerUnit
  const costPH = timePerUnit > 0 ? ((row.ask + row.eval.costAllPerUnit) / timePerUnit) * 3600 : 0
  const incomePH = timePerUnit > 0 ? (row.eval.unitNet / timePerUnit) * 3600 : 0
  return {
    id: `多步炼金:${row.item.hrid}:${row.eval.action}:${row.eval.catalystRank}:${row.eval.mainHrids.join(">")}`,
    family: "多步炼金",
    name: row.eval.name,
    hrid: row.item.hrid,
    project: row.eval.mainPath.length > 1 ? `${row.eval.mainPath.length}步炼金` : "炼金",
    stepCount: Math.max(1, row.eval.mainPath.length),
    profitPH: row.profitPH,
    profitRate: row.profitRate,
    costPH,
    incomePH,
    volume1h: row.volume1h,
    status: row.eval.priceInvalid ? "unpriced" : "priced",
    superAlchemy: row
  }
}

function addRows(target: OpportunityRow[], calculators: Calculator[], family: OpportunityFamily) {
  for (const cal of calculators) {
    const row = calculatorRow(cal, family)
    if (row) target.push(row)
  }
}

/**
 * 从每个原有计算器拿完整候选集，再以统一人物、行情、税率和稀有开关归一。
 * 每个阶段之间让出一次事件循环，页面能够显示真实的扫描进度。
 */
export async function getOpportunityDataApi(options: OpportunityOptions, onProgress?: (progress: OpportunityProgress) => void): Promise<OpportunityResult> {
  const game = useGameStoreOutside()
  const player = usePlayerStoreOutside()
  if (!game.marketData || !game.gameData) {
    return { rows: [], marketTimestamp: 0, playerVersion: player.configVersion, scannedFamilies: [] }
  }
  const families = options.families?.length ? options.families : ALL_FAMILIES
  const tax = options.includeTax ? SELL_TAX_FACTOR : NO_TAX_FACTOR
  const rows: OpportunityRow[] = []
  const total = families.length
  let completed = 0
  const progress = async (family: OpportunityFamily, label: string) => {
    completed++
    onProgress?.({ family, label, completed, total })
    await new Promise<void>(resolve => setTimeout(resolve, 0))
  }

  if (families.includes("单步/制作")) {
    const data = await getLeaderboardDataApi({ currentPage: 1, size: 1, includeTax: options.includeTax, includeRare: options.includeRare, fullList: true })
    addRows(rows, data.list, "单步/制作")
    await progress("单步/制作", "单步与逐级制作")
  }
  if (families.includes("制作炼金")) {
    const data = await getManualchemyDataApi({ currentPage: 1, size: 1, includeTax: options.includeTax, includeRare: options.includeRare, fullList: true })
    addRows(rows, data.list, "制作炼金")
    await progress("制作炼金", "制作后炼金")
  }
  if (families.includes("多步炼金")) {
    for (const row of computeSuperAlchemy({ catalystRanks: [0, 1, 2], sellTaxFactor: tax, mode: "smart", includeRare: options.includeRare })) {
      rows.push(superAlchemyRow(row))
    }
    await progress("多步炼金", "多步炼金")
  }
  if (families.includes("直接强化")) {
    addRows(rows, calcSuperEnhanceProfit(tax), "直接强化")
    await progress("直接强化", "直接强化")
  }
  if (families.includes("制作强化")) {
    addRows(rows, await calcManufactureEnhanceProfit({ sellTaxFactor: tax, includeRare: options.includeRare }), "制作强化")
    await progress("制作强化", "制作后强化")
  }
  if (families.includes("继承强化")) {
    addRows(rows, calcInheritEnhanceProfit({ noEscape: false }, { sellTaxFactor: tax, includeRare: options.includeRare }), "继承强化")
    await progress("继承强化", "继承后强化")
  }

  // 只删除同一路线完全重复的记录；禁止按终产物 HRID 去重，否则会丢掉不同强化等级与供应策略。
  const unique = new Map<string, OpportunityRow>()
  for (const row of rows) unique.set(row.id, row)
  const list = [...unique.values()].sort((a, b) => b.profitPH - a.profitPH || a.id.localeCompare(b.id))
  return { rows: list, marketTimestamp: game.marketData.timestamp, playerVersion: player.configVersion, scannedFamilies: families }
}
