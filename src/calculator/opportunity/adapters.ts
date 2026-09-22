import type { OpportunityFlow, OpportunityPlan, OpportunityPlanStep } from "./types"
import type Calculator from "@/calculator"
import { COIN_HRID } from "@/pinia/stores/game"

function calculatorList(calculator: Calculator): Calculator[] {
  const list = (calculator as any).calculatorList
  return Array.isArray(list) ? list.flat() : [calculator]
}

function flowFromInput(item: any): OpportunityFlow {
  const estimated = item.marketPrice < 0 && item.price > 0
  return {
    hrid: item.hrid,
    level: item.level || 0,
    count: item.countPH || 0,
    price: item.price,
    source: item.price === 0 ? "internal" : estimated ? "estimated" : "market",
    required: true
  }
}

function flowFromOutput(item: any): OpportunityFlow {
  return {
    hrid: item.hrid,
    level: item.level || 0,
    count: item.countPH || 0,
    price: item.price,
    source: item.price === 0 ? "internal" : item.hrid === COIN_HRID ? "coin" : "market",
    required: item.hrid !== COIN_HRID
  }
}

/**
 * Converts existing calculators into a one-hour execution plan. Workflows already
 * expose normalised workMultiplier; using it here preserves their total work time
 * while making every boundary flow inspectable by the shared evaluator.
 */
export function adaptCalculatorToOpportunityPlan(calculator: Calculator, id: string): OpportunityPlan {
  const calculators = calculatorList(calculator)
  const isWorkflow = Array.isArray((calculator as any).calculatorList)
  const workflowMultipliers = Array.isArray((calculator as any).workMultiplier)
    ? (calculator as any).workMultiplier.flat()
    : []
  const steps: OpportunityPlanStep[] = calculators.map((stepCalculator, index) => {
    const multiplier = workflowMultipliers[index] ?? (1 / calculators.length)
    return {
      id: `${id}:${index}`,
      action: stepCalculator.action,
      hrid: stepCalculator.hrid,
      level: stepCalculator.enhanceLevel || 0,
      executions: stepCalculator.actionsPH * multiplier,
      timeSec: 3600 * multiplier,
      // WorkflowCalculator already nets matching internal materials across all
      // stages.  Its detailed child steps are therefore display-only here;
      // counting their market-priced transfers as boundaries would tax/buy the
      // same material twice.
      inputs: isWorkflow ? [] : stepCalculator.ingredientListWithPrice.map(flowFromInput).map(flow => ({ ...flow, count: flow.count * multiplier })),
      outputs: isWorkflow ? [] : stepCalculator.productListWithPrice.map(flowFromOutput).map(flow => ({ ...flow, count: flow.count * multiplier }))
    }
  })
  if (isWorkflow) {
    steps.push({
      id: `${id}:boundary`,
      action: "workflow-boundary",
      hrid: calculator.hrid,
      level: calculator.enhanceLevel || 0,
      executions: 1,
      timeSec: 0,
      inputs: calculator.ingredientListWithPrice.map(flowFromInput),
      outputs: calculator.productListWithPrice.map(flowFromOutput)
    })
  }
  return { id, steps, sellTaxFactor: calculator.sellTaxFactor }
}
