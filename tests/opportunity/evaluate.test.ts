import { describe, expect, it } from "vitest"
import { evaluateOpportunityPlan } from "@/calculator/opportunity/evaluate"

function plan(overrides: Partial<Parameters<typeof evaluateOpportunityPlan>[0]> = {}) {
  return {
    id: "fixture",
    sellTaxFactor: 0.95,
    steps: [{
      id: "step",
      action: "fixture",
      hrid: "/items/result",
      level: 0,
      executions: 1,
      timeSec: 60,
      inputs: [{ hrid: "/items/input", level: 0, count: 1, price: 100, source: "market" as const, required: true }],
      outputs: [{ hrid: "/items/result", level: 0, count: 1, price: 200, source: "market" as const, required: true }]
    }],
    ...overrides
  }
}

describe("opportunity plan evaluation", () => {
  it("a02: applies sell tax once and normalises to an hour", () => {
    const value = evaluateOpportunityPlan(plan({
      steps: [{
        ...plan().steps[0],
        inputs: [
          { hrid: "/items/input", level: 0, count: 1, price: 100, source: "market", required: true },
          { hrid: "/items/fee", level: 0, count: 1, price: 10, source: "market", required: true }
        ]
      }]
    }))
    expect(value.netProfit).toBe(80)
    expect(value.profitPH).toBe(4800)
  })

  it("a03: does not tax coin income", () => {
    const value = evaluateOpportunityPlan(plan({
      steps: [{
        ...plan().steps[0],
        inputs: [],
        outputs: [{ hrid: "/items/coin", level: 0, count: 100, price: 1, source: "coin", required: false }]
      }]
    }))
    expect(value.totalIncome).toBe(100)
  })

  it("a04: ranks by whole-plan net profit per hour", () => {
    const fast = evaluateOpportunityPlan(plan({
      steps: [{ ...plan().steps[0], timeSec: 600, inputs: [], outputs: [{ hrid: "/items/a", level: 0, count: 1, price: 1000000 / 0.95, source: "market", required: true }] }]
    }))
    const slow = evaluateOpportunityPlan(plan({
      steps: [{ ...plan().steps[0], timeSec: 1800, inputs: [], outputs: [{ hrid: "/items/b", level: 0, count: 1, price: 1500000 / 0.95, source: "market", required: true }] }]
    }))
    expect(fast.profitPH).toBeCloseTo(6000000)
    expect(slow.profitPH).toBeCloseTo(3000000)
    expect(fast.profitPH).toBeGreaterThan(slow.profitPH)
  })

  it("a05: does not buy or sell internal transfers", () => {
    const value = evaluateOpportunityPlan(plan({
      steps: [
        { ...plan().steps[0], inputs: [{ hrid: "/items/a", level: 0, count: 1, price: 100, source: "market", required: true }], outputs: [{ hrid: "/items/b", level: 0, count: 1, price: 0, source: "internal", required: false }] },
        { ...plan().steps[0], id: "step-2", inputs: [{ hrid: "/items/b", level: 0, count: 1, price: 0, source: "internal", required: true }], outputs: [{ hrid: "/items/c", level: 0, count: 1, price: 200, source: "market", required: true }] }
      ]
    }))
    expect(value.totalCost).toBe(100)
    expect(value.totalIncome).toBe(190)
    expect(value.netProfit).toBe(90)
  })

  it("a08/a09: missing or estimated market prices are not executable", () => {
    const missing = evaluateOpportunityPlan(plan({
      steps: [{ ...plan().steps[0], inputs: [{ hrid: "/items/missing", level: 0, count: 1, price: -1, source: "market", required: true }] }]
    }))
    const estimated = evaluateOpportunityPlan(plan({
      steps: [{ ...plan().steps[0], inputs: [{ hrid: "/items/craft-fallback", level: 0, count: 1, price: 100, source: "estimated", required: true }] }]
    }))
    expect(missing.status).toBe("unpriced")
    expect(estimated.status).toBe("unpriced")
  })
})
