import { describe, expect, it } from "vitest";

import {
  classifyMegaCombatTier,
  classifyMegaCoverageTier,
  isMegaTierTypeFloor,
  isWithinMegaTierLeaderTolerance,
  parseMegaWeatherTierSummary,
  type MegaCombatTierEvidence
} from "../src/lib/pogo/megatier";

const noEvidence: MegaCombatTierEvidence = {
  baselineOutrightAndCatchAligned: false,
  weatherOutrightAndCatchAligned: false,
  baselineCatchAligned: false,
  weatherCatchAligned: false,
  baselineOutright: false,
  weatherOutright: false
};

describe("Mega combat tier rules", () => {
  it("treats strategies within 1% of the DPS leader as co-leaders", () => {
    expect(isWithinMegaTierLeaderTolerance(100, 100)).toBe(true);
    expect(isWithinMegaTierLeaderTolerance(99, 100)).toBe(true);
    expect(isWithinMegaTierLeaderTolerance(98.99, 100)).toBe(false);
    expect(isWithinMegaTierLeaderTolerance(101, 100)).toBe(true);
  });

  it("excludes impossible Normal weaknesses from every type floor", () => {
    expect(isMegaTierTypeFloor("None")).toBe(false);
    expect(isMegaTierTypeFloor("Normal")).toBe(false);
    expect(isMegaTierTypeFloor("Dragon")).toBe(true);
  });

  it("lets a higher-tier strict aura superset override exact-duplicate tiers", () => {
    expect(
      classifyMegaCoverageTier({
        auraTypeCount: 2,
        hasExactDuplicate: true,
        hasHigherTierExactDuplicate: true,
        hasHigherTierStrictSuperset: true
      })
    ).toBe("F");
    expect(
      classifyMegaCoverageTier({
        auraTypeCount: 2,
        hasExactDuplicate: true,
        hasHigherTierExactDuplicate: true,
        hasHigherTierStrictSuperset: false
      })
    ).toBe("E");
    expect(
      classifyMegaCoverageTier({
        auraTypeCount: 2,
        hasExactDuplicate: true,
        hasHigherTierExactDuplicate: false,
        hasHigherTierStrictSuperset: false
      })
    ).toBe("D");
    expect(
      classifyMegaCoverageTier({
        auraTypeCount: 2,
        hasExactDuplicate: false,
        hasHigherTierExactDuplicate: false,
        hasHigherTierStrictSuperset: false
      })
    ).toBe("D+");
  });

  it.each([
    ["baselineOutrightAndCatchAligned", "A"],
    ["weatherOutrightAndCatchAligned", "A-"],
    ["baselineCatchAligned", "B+"],
    ["weatherCatchAligned", "B"],
    ["baselineOutright", "B-"],
    ["weatherOutright", "C+"]
  ] as const)("maps %s evidence to %s", (field, tier) => {
    expect(classifyMegaCombatTier({ ...noEvidence, [field]: true })).toBe(tier);
  });

  it("uses the strongest applicable rule when baseline and weather evidence overlap", () => {
    expect(
      classifyMegaCombatTier({
        ...noEvidence,
        weatherOutrightAndCatchAligned: true,
        baselineCatchAligned: true,
        weatherCatchAligned: true,
        baselineOutright: true,
        weatherOutright: true
      })
    ).toBe("A-");
    expect(
      classifyMegaCombatTier({
        ...noEvidence,
        weatherCatchAligned: true,
        baselineOutright: true,
        weatherOutright: true
      })
    ).toBe("B");
    expect(
      classifyMegaCombatTier({
        ...noEvidence,
        baselineOutright: true,
        weatherOutright: true
      })
    ).toBe("B-");
  });

  it("returns no combat tier without qualifying boss evidence", () => {
    expect(classifyMegaCombatTier(noEvidence)).toBeUndefined();
  });

  it("aggregates weather summary statuses and tolerates leading worker diagnostics", () => {
    const header =
      "weather\tcandidate\tstatus\tbossCount\tbosses\tminMarginPercent\tmaxMarginPercent";
    const result = parseMegaWeatherTierSummary(
      "rain",
      [
        "worker diagnostic",
        header,
        "rain\tMega Example\tDuo leader\t1\tBoss A\t1\t1",
        "rain\tMega Example\tCatch-aligned duo leader\t1\tBoss B\t2\t2",
        "rain\tMega Combined\tDuo leader + catch-aligned\t1\tBoss C\t3\t3",
        ""
      ].join("\n")
    );

    expect(result.get("Mega Example")).toEqual({
      outrightAndCatchAligned: false,
      catchAligned: true,
      outright: true
    });
    expect(result.get("Mega Combined")).toEqual({
      outrightAndCatchAligned: true,
      catchAligned: true,
      outright: true
    });
  });

  it("accepts a header-only weather summary as no qualifying evidence", () => {
    expect(
      parseMegaWeatherTierSummary(
        "snow",
        "weather\tcandidate\tstatus\tbossCount\tbosses\tminMarginPercent\tmaxMarginPercent\n"
      ).size
    ).toBe(0);
  });
});
