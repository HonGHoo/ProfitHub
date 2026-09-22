import { describe, expect, it } from "vitest"
import { adaptCalculatorToOpportunityPlan } from "@/calculator/opportunity/adapters"
import { evaluateOpportunityPlan } from "@/calculator/opportunity/evaluate"

describe("workflow opportunity adapter", () => {
  it("uses the workflow's net external boundary instead of double-counting child transfers", () => {
    const childA = {
      action: "craft",
      hrid: "ore",
      enhanceLevel: 0,
      actionsPH: 10,
      ingredientListWithPrice: [{ hrid: "ore", level: 0, countPH: 10, price: 10, marketPrice: 10 }],
      productListWithPrice: [{ hrid: "bar", level: 0, countPH: 10, price: 20 }]
    }
    const childB = {
      action: "craft",
      hrid: "bar",
      enhanceLevel: 0,
      actionsPH: 10,
      ingredientListWithPrice: [{ hrid: "bar", level: 0, countPH: 10, price: 20, marketPrice: 20 }],
      productListWithPrice: [{ hrid: "sword", level: 0, countPH: 10, price: 30 }]
    }
    const workflow = {
      calculatorList: [childA, childB],
      workMultiplier: [0.5, 0.5],
      hrid: "sword",
      enhanceLevel: 0,
      sellTaxFactor: 1,
      ingredientListWithPrice: [{ hrid: "ore", level: 0, countPH: 5, price: 10, marketPrice: 10 }],
      productListWithPrice: [{ hrid: "sword", level: 0, countPH: 5, price: 30 }]
    }
    const result = evaluateOpportunityPlan(adaptCalculatorToOpportunityPlan(workflow as any, "workflow"))

    expect(result.totalCost).toBe(50)
    expect(result.totalIncome).toBe(150)
    expect(result.netProfit).toBe(100)
    expect(result.timeSec).toBe(3600)
  })
})
