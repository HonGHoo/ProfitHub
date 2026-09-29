/** Parse a non-negative price. K/M/B suffixes are case-insensitive. */
export function parsePriceInput(value: string): number | null {
  const text = value.trim().replaceAll(",", "")
  const match = /^(\d+(?:\.\d+)?)([kmb])?$/i.exec(text)
  if (!match) return null
  const multiplier = { k: 1e3, m: 1e6, b: 1e9 }[match[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1
  const result = Number(match[1]) * multiplier
  return Number.isFinite(result) && result <= Number.MAX_SAFE_INTEGER ? result : null
}

export function formatPriceInput(value: number): string {
  return Number.isFinite(value) && value >= 0 ? value.toLocaleString("en-US", { maximumFractionDigits: 6 }) : ""
}
