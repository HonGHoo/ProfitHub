import type Calculator from "@/calculator"
import type { SuperAlchemyRow } from "@/calculator/superAlchemy"

/** 可比较的路线来源。名称既是展示分类，也是扫描范围的一部分。 */
export type OpportunityFamily = "单步/制作" | "制作炼金" | "多步炼金" | "直接强化" | "制作强化" | "继承强化"

export type OpportunityStatus = "priced" | "unpriced" | "failed"

export interface OpportunityRow {
  /** 路线而非终产物的稳定标识；强化等级和完整步骤都必须参与 ID。 */
  id: string
  family: OpportunityFamily
  name: string
  hrid: string
  project: string
  stepCount: number
  profitPH: number
  profitRate: number
  costPH: number
  incomePH: number
  volume1h: number
  status: OpportunityStatus
  /** 用于详情跳转／展开，保持为原计算器而不复制其全局依赖。 */
  calculator?: Calculator
  superAlchemy?: SuperAlchemyRow
}

export interface OpportunityOptions {
  includeTax: boolean
  includeRare: boolean
  /** 只计算指定路线族；空数组表示全部。 */
  families?: OpportunityFamily[]
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
}
