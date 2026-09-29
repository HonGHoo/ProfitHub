import type { StoneSourceRow } from "./alchemyChain"

/** Invert the net-cost equation, allowing more than one equipment per action. */
export function stoneEquipmentStandardPrice(row: Pick<StoneSourceRow, "buyPrice" | "sourceCount" | "stonesPerAction" | "costPerStone">, stoneProceeds: number): number | null {
  if (stoneProceeds < 0 || row.stonesPerAction <= 0 || row.sourceCount <= 0) return null
  return row.buyPrice + (stoneProceeds - row.costPerStone) * row.stonesPerAction / row.sourceCount
}
