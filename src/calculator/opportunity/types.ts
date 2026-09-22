export type OpportunityPlanStatus = "priced" | "unpriced" | "unsupported" | "failed"

export interface OpportunityFlow {
  hrid: string
  level: number
  count: number
  price: number
  /** market = 需要真实盘口；coin 不收市场税；internal 不跨越路线边界。 */
  source: "market" | "coin" | "internal" | "estimated"
  required: boolean
  label?: string
}

export interface OpportunityPlanStep {
  id: string
  action: string
  hrid: string
  level: number
  executions: number
  timeSec: number
  inputs: OpportunityFlow[]
  outputs: OpportunityFlow[]
}

export interface OpportunityPlan {
  id: string
  steps: OpportunityPlanStep[]
  sellTaxFactor: number
}

export interface OpportunityEvaluation {
  status: OpportunityPlanStatus
  warnings: string[]
  timeSec: number
  totalCost: number
  totalIncome: number
  netProfit: number
  profitPH: number
  externalInputs: OpportunityFlow[]
  externalOutputs: OpportunityFlow[]
}
