import type { OpportunityEvaluation, OpportunityFlow, OpportunityPlan } from "./types"

function externalInputs(plan: OpportunityPlan) {
  return plan.steps.flatMap(step => step.inputs).filter(flow => flow.source !== "internal")
}

function externalOutputs(plan: OpportunityPlan) {
  return plan.steps.flatMap(step => step.outputs).filter(flow => flow.source !== "internal")
}

function isMissingPrice(flow: OpportunityFlow) {
  return flow.source === "market" && flow.required && (!Number.isFinite(flow.price) || flow.price < 0)
}

/**
 * Evaluates a closed plan boundary. Internal transfers deliberately never appear
 * as both a purchase and a sale, so neither their cost nor their tax is counted twice.
 */
export function evaluateOpportunityPlan(plan: OpportunityPlan): OpportunityEvaluation {
  const inputs = externalInputs(plan)
  const outputs = externalOutputs(plan)
  const warnings: string[] = []
  const missing = [...inputs, ...outputs].filter(isMissingPrice)
  if (missing.length > 0) warnings.push(`待补价：${missing.map(flow => flow.hrid).join(", ")}`)
  const estimated = [...inputs, ...outputs].filter(flow => flow.source === "estimated")
  if (estimated.length > 0) warnings.push(`估算价格不可作为即时成交：${estimated.map(flow => flow.hrid).join(", ")}`)
  const timeSec = plan.steps.reduce((sum, step) => sum + step.timeSec, 0)
  const totalCost = inputs.reduce((sum, flow) => sum + flow.count * Math.max(0, flow.price), 0)
  const totalIncome = outputs.reduce((sum, flow) => {
    const gross = flow.count * Math.max(0, flow.price)
    return sum + (flow.source === "coin" ? gross : gross * plan.sellTaxFactor)
  }, 0)
  const status = missing.length > 0 || estimated.length > 0 ? "unpriced" : "priced"
  const netProfit = totalIncome - totalCost
  return {
    status,
    warnings,
    timeSec,
    totalCost,
    totalIncome,
    netProfit,
    profitPH: timeSec > 0 ? netProfit * 3600 / timeSec : 0,
    externalInputs: inputs,
    externalOutputs: outputs
  }
}
