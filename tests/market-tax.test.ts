import { describe, expect, it } from "vitest"
import { SELL_TAX_FACTOR, SELL_TAX_RATE } from "@/common/constants/market"
import { price } from "@/common/utils/format"

describe("market sell tax", () => {
  it("shows the stone price after the global 4% tax", () => {
    expect(SELL_TAX_RATE).toBe(4)
    expect(534000000 * SELL_TAX_FACTOR).toBe(512640000)
    expect(price(534000000 * SELL_TAX_FACTOR)).toBe("513M")
  })
})
