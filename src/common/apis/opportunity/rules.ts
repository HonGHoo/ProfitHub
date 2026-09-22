import type { OpportunityFamily } from "./types"

export const ALL_OPPORTUNITY_FAMILIES: OpportunityFamily[] = ["单步/制作", "制作炼金", "多步炼金", "直接强化", "制作强化", "继承强化"]

/** undefined means the default full scan; an explicit [] means scan nothing. */
export function resolveFamilies(families: OpportunityFamily[] | undefined) {
  return families ?? ALL_OPPORTUNITY_FAMILIES
}

/** Only a multi-step material-only production chain can match this exclusion. */
export function isPureLowTierTrain(family: OpportunityFamily, stepHrids: string[], itemHrids: Set<string>) {
  return itemHrids.size > 0
    && family === "单步/制作"
    && stepHrids.length >= 2
    && stepHrids.every(hrid => itemHrids.has(hrid))
}

export function buildRouteSignature(steps: Array<Record<string, unknown>>) {
  return steps.map(step => [
    step.hrid,
    step.project,
    step.action,
    step.originLevel ?? "",
    step.enhanceLevel ?? "",
    step.protectLevel ?? "",
    step.escapeLevel ?? "",
    step.catalystRank ?? ""
  ].join("~")).join("|")
}
