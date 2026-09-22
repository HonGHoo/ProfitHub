import type Calculator from "@/calculator"
import type { OpportunityEvaluation, OpportunityFlow, OpportunityPlanStep } from "@/calculator/opportunity/types"
import type { SuperAlchemyRow } from "@/calculator/superAlchemy"

/** 可比较的路线来源。名称既是展示分类，也是扫描范围的一部分。 */
export type OpportunityFamily = "单步/制作" | "制作炼金" | "多步炼金" | "直接强化" | "制作强化" | "继承强化"

export type OpportunityStatus = "priced" | "unpriced" | "unsupported" | "failed"

export interface OpportunityRow {
  /** 路线而非终产物的稳定标识；强化等级和完整步骤都必须参与 ID。 */
  id: string
  family: OpportunityFamily
  name: string
  hrid: string
  project: string
  stepCount: number
  steps: OpportunityPlanStep[]
  externalInputs: OpportunityFlow[]
  externalOutputs: OpportunityFlow[]
  timeSec: number
  totalCost: number
  totalIncome: number
  netProfit: number
  warnings: string[]
  snapshotId: string
  profitPH: number
  profitRate: number
  costPH: number
  incomePH: number
  volume1h: number
  status: OpportunityStatus
  /** 用于详情跳转／展开，保持为原计算器而不复制其全局依赖。 */
  calculator?: Calculator
  superAlchemy?: SuperAlchemyRow
  evaluation?: OpportunityEvaluation
}

export interface OpportunityOptions {
  includeTax: boolean
  includeRare: boolean
  /** 只计算指定路线族；省略时扫描全部，空数组表示不扫描。 */
  families?: OpportunityFamily[]
  /**
   * 仅在明确给出完整材料 HRID 集合时排除纯材料升级链。空集合表示不排除，
   * 防止把含低阶材料的装备、炼金和强化路线误删。
   */
  lowTierTrain?: {
    itemHrids: string[]
  }
  /** 多步炼金展开节点上限；省略时使用计算器默认安全上限。 */
  maxAlchemyNodes?: number
  /** 由页面 generation 传入；扫描会在每个路线族边界响应取消。 */
  isCancelled?: () => boolean
}

export interface OpportunityProgress {
  family: OpportunityFamily
  label: string
  completed: number
  total: number
}

export interface OpportunityResult {
  rows: OpportunityRow[]
  marketTimestamp: number
  playerVersion: number
  scannedFamilies: OpportunityFamily[]
  /** 本次扫描的稳定输入标识，导出后可用于人工复核。 */
  snapshotId: string
  /** 各路线族返回的原始候选数，未将筛选后的数量伪装成全量。 */
  familyCounts: Partial<Record<OpportunityFamily, number>>
  /** 仅统计已按明确配置排除的纯材料路线。 */
  excludedLowTierTrain: number
  /** 仅供规则复核的有限样例，不影响筛选或排序。 */
  excludedLowTierSamples: { id: string, name: string, hrid: string }[]
  /** 扫描过程中发现的边界或快照变更。 */
  warnings: string[]
  limited: boolean
  limitReasons: string[]
  /** 实际参与本次计算的范围参数，供导出后复现；不包含取消回调。 */
  options: Omit<OpportunityOptions, "isCancelled">
}
