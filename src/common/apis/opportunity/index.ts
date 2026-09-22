import type { OpportunityFamily, OpportunityOptions, OpportunityProgress, OpportunityResult, OpportunityRow } from "./types"
import type Calculator from "@/calculator"
import type { SuperAlchemyRow } from "@/calculator/superAlchemy"
import { adaptCalculatorToOpportunityPlan } from "@/calculator/opportunity/adapters"
import { evaluateOpportunityPlan } from "@/calculator/opportunity/evaluate"
import { computeSuperAlchemyWithStats } from "@/calculator/superAlchemy"
import { getPriceOf, withCalculationSnapshot } from "@/common/apis/game"
import { calcEnhanceProfit as calcManufactureEnhanceProfit } from "@/common/apis/jungle"
import { calcEnhanceProfit as calcInheritEnhanceProfit } from "@/common/apis/jungle/junglerit"
import { calcSuperEnhanceProfit } from "@/common/apis/jungle/junglest"
import { getLeaderboardDataApi } from "@/common/apis/leaderboard"
import { getLeaderboardDataApi as getManualchemyDataApi } from "@/common/apis/manualchemy"
import { NO_TAX_FACTOR, SELL_TAX_FACTOR } from "@/common/constants/market"
import { useGameStoreOutside } from "@/pinia/stores/game"
import { usePlayerStoreOutside } from "@/pinia/stores/player"
import { buildRouteSignature, isPureLowTierTrain as matchesLowTierTrain, resolveFamilies } from "./rules"

export * from "./types"

export class OpportunityScanCancelledError extends Error {
  constructor() {
    super("Opportunity scan cancelled")
  }
}

/** A compact content fingerprint makes same-timestamp market refreshes visible. */
function fingerprint(value: unknown) {
  const text = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function workflowStepCount(cal: Calculator) {
  const list = (cal as any).calculatorList
  return Array.isArray(list) ? list.flat().length : 1
}

/**
 * Calculator.id 未包含强化保护、逃逸和全部工作流参数；机会榜必须保留这些
 * 策略差异，不能让 Map 去重时把不同路线互相覆盖。
 */
function routeSignature(cal: Calculator) {
  const list = Array.isArray((cal as any).calculatorList)
    ? (cal as any).calculatorList.flat()
    : [cal]
  return buildRouteSignature(list)
}

function calculatorRow(cal: Calculator, family: OpportunityFamily, snapshotId: string): OpportunityRow | null {
  const result = cal.result
  if (!result || !Number.isFinite(result.profitPH)) return null
  const level = cal.enhanceLevel || 0
  const volume1h = getPriceOf(cal.hrid, level).vol
  const id = `${family}:${routeSignature(cal)}`
  const plan = adaptCalculatorToOpportunityPlan(cal, id)
  const evaluation = evaluateOpportunityPlan(plan)
  return {
    id,
    family,
    name: result.name || cal.key,
    hrid: cal.hrid,
    project: result.project || cal.project,
    stepCount: plan.steps.length || workflowStepCount(cal),
    steps: plan.steps,
    externalInputs: evaluation.externalInputs,
    externalOutputs: evaluation.externalOutputs,
    timeSec: evaluation.timeSec,
    totalCost: evaluation.totalCost,
    totalIncome: evaluation.totalIncome,
    netProfit: evaluation.netProfit,
    warnings: evaluation.warnings,
    snapshotId,
    profitPH: evaluation.profitPH,
    profitRate: evaluation.totalCost > 0 ? evaluation.netProfit / evaluation.totalCost : 0,
    costPH: evaluation.totalCost,
    incomePH: evaluation.totalIncome,
    volume1h: typeof volume1h === "number" ? volume1h : -1,
    status: !cal.valid || evaluation.status !== "priced" ? "unpriced" : "priced",
    calculator: cal,
    evaluation
  }
}

function superAlchemyRow(row: SuperAlchemyRow, snapshotId: string): OpportunityRow {
  const plan = adaptSuperAlchemyToPlan(row)
  const evaluation = evaluateOpportunityPlan(plan)
  const totalCost = evaluation.totalCost
  const totalIncome = evaluation.totalIncome
  const timePerUnit = evaluation.timeSec
  const costPH = timePerUnit > 0 ? totalCost / timePerUnit * 3600 : 0
  const incomePH = timePerUnit > 0 ? totalIncome / timePerUnit * 3600 : 0
  return {
    id: `多步炼金:${row.item.hrid}:${row.eval.action}:${row.eval.catalystRank}:${row.eval.mainHrids.join(">")}`,
    family: "多步炼金",
    name: row.eval.name,
    hrid: row.item.hrid,
    project: row.eval.mainPath.length > 1 ? `${row.eval.mainPath.length}步炼金` : "炼金",
    stepCount: plan.steps.length,
    steps: plan.steps,
    externalInputs: evaluation.externalInputs,
    externalOutputs: evaluation.externalOutputs,
    timeSec: evaluation.timeSec,
    totalCost,
    totalIncome,
    netProfit: evaluation.netProfit,
    warnings: evaluation.warnings,
    snapshotId,
    profitPH: evaluation.profitPH,
    profitRate: totalCost > 0 ? evaluation.netProfit / totalCost : 0,
    costPH,
    incomePH,
    volume1h: row.volume1h,
    status: evaluation.status,
    superAlchemy: row,
    evaluation
  }
}

/**
 * Turns the chosen alchemy tree into the same external-boundary plan used by
 * every other family.  Intermediate products stay internal; only the root
 * purchase, step consumptions and terminal/cycle-cut sales cross the boundary.
 */
function adaptSuperAlchemyToPlan(row: SuperAlchemyRow) {
  const steps: OpportunityRow["steps"] = []
  const rootBid = getPriceOf(row.item.hrid, 0).bid
  const taxFactor = row.eval.sellValue > 0 && typeof rootBid === "number" && rootBid > 0
    ? Math.min(1, row.eval.sellValue / rootBid)
    : SELL_TAX_FACTOR
  const outputs: OpportunityRow["externalOutputs"] = []
  const addSale = (hrid: string, count: number, isCoin = false) => {
    if (isCoin) {
      outputs.push({ hrid, level: 0, count, price: 1, source: "coin", required: false })
      return
    }
    const bid = getPriceOf(hrid, 0).bid
    outputs.push({ hrid, level: 0, count, price: typeof bid === "number" ? bid : -1, source: "market", required: true })
  }
  const walk = (ev: SuperAlchemyRow["eval"], count: number, depth: number) => {
    if (ev.action === "sell") {
      addSale(ev.hrid, count)
      return
    }
    steps.push({
      id: `alchemy:${row.item.hrid}:${depth}:${ev.hrid}:${ev.action}:${ev.catalystRank}`,
      action: ev.action,
      hrid: ev.hrid,
      level: 0,
      executions: ev.attemptsPerUnit * count,
      timeSec: ev.ownTimePerUnit * count,
      // Existing calculators expose this as a money aggregate.  Keeping it as
      // a named non-market consumption avoids inventing a catalyst HRID while
      // still accounting for it exactly once in the unified boundary.
      inputs: ev.costPerUnit > 0 ? [{ hrid: "alchemy-step-cost", level: 0, count: ev.costPerUnit * count, price: 1, source: "coin" as const, required: false, label: "炼金催化剂、茶与金币消耗" }] : [],
      outputs: []
    })
    for (const product of ev.cycleCutProducts) addSale(product.hrid, product.count * count, product.hrid === "item_coin")
    for (const child of ev.children) {
      if (child.evaluation) walk(child.evaluation, child.countPerUnit * count, depth + 1)
    }
  }
  walk(row.eval, 1, 0)
  return {
    id: `多步炼金:${row.item.hrid}:${row.eval.action}:${row.eval.catalystRank}`,
    steps: [{
      id: `alchemy-root:${row.item.hrid}`,
      action: "market-buy",
      hrid: row.item.hrid,
      level: 0,
      executions: 1,
      timeSec: 0,
      inputs: [{ hrid: row.item.hrid, level: 0, count: 1, price: row.ask, source: "market" as const, required: true }],
      outputs: []
    }, ...steps, {
      id: `alchemy-sales:${row.item.hrid}`,
      action: "market-sell",
      hrid: row.item.hrid,
      level: 0,
      executions: 0,
      timeSec: 0,
      inputs: [],
      outputs
    }],
    sellTaxFactor: taxFactor
  }
}

function addRows(target: OpportunityRow[], calculators: Calculator[], family: OpportunityFamily, snapshotId: string) {
  for (const cal of calculators) {
    const row = calculatorRow(cal, family, snapshotId)
    if (row) target.push(row)
  }
}

function isPureLowTierTrain(row: OpportunityRow, itemHrids: Set<string>) {
  if (itemHrids.size === 0 || row.family !== "单步/制作" || !row.calculator) return false
  const list = (row.calculator as any).calculatorList
  if (!Array.isArray(list) || list.length < 2) return false
  return matchesLowTierTrain(row.family, list.flat().map((step: any) => step.hrid), itemHrids)
}

/**
 * 从每个原有计算器拿完整候选集，再以统一人物、行情、税率和稀有开关归一。
 * 每个阶段之间让出一次事件循环，页面能够显示真实的扫描进度。
 */
export async function getOpportunityDataApi(options: OpportunityOptions, onProgress?: (progress: OpportunityProgress) => void): Promise<OpportunityResult> {
  const game = useGameStoreOutside()
  const player = usePlayerStoreOutside()
  if (!game.marketData || !game.gameData) {
    return {
      rows: [],
      marketTimestamp: 0,
      playerVersion: player.configVersion,
      scannedFamilies: [],
      snapshotId: "empty",
      familyCounts: {},
      excludedLowTierTrain: 0,
      excludedLowTierSamples: [],
      warnings: ["游戏数据或行情尚未就绪"],
      limited: false,
      limitReasons: [],
      options: { includeTax: options.includeTax, includeRare: options.includeRare, families: options.families, lowTierTrain: options.lowTierTrain, maxAlchemyNodes: options.maxAlchemyNodes }
    }
  }
  const immutableSnapshot = {
    gameData: structuredClone(toRaw(game.gameData)),
    marketData: structuredClone(toRaw(game.marketData)),
    buyStatus: game.buyStatus,
    sellStatus: game.sellStatus
  }
  const marketTimestamp = immutableSnapshot.marketData.timestamp
  const playerVersion = player.configVersion
  const buyStatus = immutableSnapshot.buyStatus
  const sellStatus = immutableSnapshot.sellStatus
  const marketFingerprint = fingerprint(immutableSnapshot.marketData.marketData)
  const playerFingerprint = fingerprint(toRaw(player.$state))
  return withCalculationSnapshot(immutableSnapshot, async () => {
  // [] 是用户明确选择“不扫描任何路线”，不能静默恢复为全量。
    const families = resolveFamilies(options.families)
    const tax = options.includeTax ? SELL_TAX_FACTOR : NO_TAX_FACTOR
    const snapshotId = [marketTimestamp, marketFingerprint, playerVersion, playerFingerprint, buyStatus, sellStatus, options.includeTax ? "tax" : "no-tax", options.includeRare ? "rare" : "no-rare", families.join(","), options.maxAlchemyNodes ?? "default"].join(":")
    const rows: OpportunityRow[] = []
    const familyCounts: Partial<Record<OpportunityFamily, number>> = {}
    const limitReasons: string[] = []
    const total = families.length
    let completed = 0
    const progress = async (family: OpportunityFamily, label: string) => {
      if (options.isCancelled?.()) throw new OpportunityScanCancelledError()
      completed++
      onProgress?.({ family, label, completed, total })
      await new Promise<void>(resolve => setTimeout(resolve, 0))
    }

    if (families.includes("单步/制作")) {
      const data = await getLeaderboardDataApi({ currentPage: 1, size: 1, includeTax: options.includeTax, includeRare: options.includeRare, fullList: true, fresh: true })
      familyCounts["单步/制作"] = data.list.length
      addRows(rows, data.list, "单步/制作", snapshotId)
      await progress("单步/制作", "单步与逐级制作")
    }
    if (families.includes("制作炼金")) {
      const data = await getManualchemyDataApi({ currentPage: 1, size: 1, includeTax: options.includeTax, includeRare: options.includeRare, fullList: true, fresh: true })
      familyCounts["制作炼金"] = data.list.length
      addRows(rows, data.list, "制作炼金", snapshotId)
      await progress("制作炼金", "制作后炼金")
    }
    if (families.includes("多步炼金")) {
      const result = computeSuperAlchemyWithStats({ catalystRanks: [0, 1, 2], sellTaxFactor: tax, mode: "smart", includeRare: options.includeRare, maxNodes: options.maxAlchemyNodes })
      familyCounts["多步炼金"] = result.rows.length
      if (result.limited) limitReasons.push(`多步炼金达到节点上限 ${options.maxAlchemyNodes ?? 6000}（已展开 ${result.nodeCount}）`)
      if (result.cycleCuts > 0) limitReasons.push(`多步炼金切断 ${result.cycleCuts} 条环路`)
      for (const row of result.rows) {
        rows.push(superAlchemyRow(row, snapshotId))
      }
      await progress("多步炼金", "多步炼金")
    }
    if (families.includes("直接强化")) {
      const data = calcSuperEnhanceProfit(tax)
      familyCounts["直接强化"] = data.length
      addRows(rows, data, "直接强化", snapshotId)
      await progress("直接强化", "直接强化")
    }
    if (families.includes("制作强化")) {
      const data = await calcManufactureEnhanceProfit({ sellTaxFactor: tax, includeRare: options.includeRare })
      familyCounts["制作强化"] = data.length
      addRows(rows, data, "制作强化", snapshotId)
      await progress("制作强化", "制作后强化")
    }
    if (families.includes("继承强化")) {
      const data = calcInheritEnhanceProfit({ noEscape: false }, { sellTaxFactor: tax, includeRare: options.includeRare })
      familyCounts["继承强化"] = data.length
      addRows(rows, data, "继承强化", snapshotId)
      await progress("继承强化", "继承后强化")
    }

    // 只删除同一路线完全重复的记录；禁止按终产物 HRID 去重，否则会丢掉不同强化等级与供应策略。
    const unique = new Map<string, OpportunityRow>()
    for (const row of rows) unique.set(row.id, row)
    const lowTierItems = new Set(options.lowTierTrain?.itemHrids ?? [])
    const deduped = [...unique.values()]
    const excludedRows = deduped.filter(row => isPureLowTierTrain(row, lowTierItems))
    const excludedLowTierTrain = excludedRows.length
    const excludedLowTierSamples = excludedRows.slice(0, 5).map(({ id, name, hrid }) => ({ id, name, hrid }))
    const list = deduped
      .filter(row => !isPureLowTierTrain(row, lowTierItems))
      .sort((a, b) => b.profitPH - a.profitPH || a.id.localeCompare(b.id))
    const warnings: string[] = []
    if (lowTierItems.size === 0) warnings.push("低级火车排除规则未设置；当前未排除任何路线")
    if (game.marketData?.timestamp !== marketTimestamp || player.configVersion !== playerVersion || game.buyStatus !== buyStatus || game.sellStatus !== sellStatus) {
      warnings.push("扫描期间人物或行情已变更；结果已标为过期，请重新扫描")
    }
    return {
      rows: list,
      marketTimestamp,
      playerVersion,
      scannedFamilies: families,
      snapshotId,
      familyCounts,
      excludedLowTierTrain,
      excludedLowTierSamples,
      warnings,
      limited: limitReasons.length > 0,
      limitReasons,
      options: { includeTax: options.includeTax, includeRare: options.includeRare, families: [...families], lowTierTrain: options.lowTierTrain ? { itemHrids: [...options.lowTierTrain.itemHrids] } : undefined, maxAlchemyNodes: options.maxAlchemyNodes }
    }
  })
}
