import { describe, expect, it } from "vitest";

import {
  classifyMegaCombatTier,
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
