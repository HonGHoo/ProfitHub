import { describe, expect, it } from "vitest"
import { wholeRouteHourlyScore } from "@/calculator/superAlchemy"

describe("super alchemy root objective", () => {
  it("prefers the shorter route when it has lower per-unit profit but higher whole-route hourly profit", () => {
    // Both routes start from a 100 gold purchase. The long path makes more per
    // unit (150 vs 100), but its hourly return is lower (300/h vs 600/h).
    const shortRoute = wholeRouteHourlyScore(200, 10 * 60, 100)
    const longRoute = wholeRouteHourlyScore(250, 30 * 60, 100)

    expect(shortRoute * 3600).toBe(600)
    expect(longRoute * 3600).toBe(300)
    expect(shortRoute).toBeGreaterThan(longRoute)
  })
})
