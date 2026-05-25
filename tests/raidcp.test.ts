import { describe, expect, it } from "vitest";

import { calculateCP, type BaseStats } from "../src/lib/pogo/parity";
import { buildRaidCpResult, type RaidCpInput, type RaidCpResult, type RaidCpTarget } from "../src/lib/pogo/raidcp";

const detailUrl = new URL("https://rotomata.mygod.be/pvpstat");
const anyTarget: RaidCpTarget = {
  fullAttack: false,
  fullDefense: false,
  hpMode: "any"
};
const perfectTarget: RaidCpTarget = {
  fullAttack: true,
  fullDefense: true,
  hpMode: "full"
};

function input(stats: BaseStats, overrides: Partial<RaidCpInput>): RaidCpInput {
  return {
    stats,
    statsString: `${stats.attack}/${stats.defense}/${stats.stamina}`,
    ivFloor: 10,
    naturalTarget: anyTarget,
    includePurified: false,
    purifiedTarget: perfectTarget,
    ...overrides
  };
}

function ivs(result: RaidCpResult): Set<string> {
  return new Set(result.rows.map((row) => row.iv));
}

function row(result: RaidCpResult, iv: string) {
  return result.rows.find((entry) => entry.iv === iv);
}

describe("Raid CP Filter", () => {
  it("treats 14 HP IV as functional only when it ties 15 HP at Lv20 or Lv25", () => {
    const functionalStats = {
      attack: 100,
      defense: 100,
      stamina: 100
    };
    const nonFunctionalStats = {
      attack: 100,
      defense: 100,
      stamina: 101
    };

    expect(
      ivs(
        buildRaidCpResult(
          input(functionalStats, {
            ivFloor: 14,
            naturalTarget: {
              fullAttack: true,
              fullDefense: false,
              hpMode: "functional"
            }
          }),
          detailUrl
        )
      )
    ).toContain("15/14/14");
    const nonFunctionalResult = buildRaidCpResult(
      input(nonFunctionalStats, {
        ivFloor: 14,
        naturalTarget: {
          fullAttack: true,
          fullDefense: false,
          hpMode: "functional"
        }
      }),
      detailUrl
    );
    expect(ivs(nonFunctionalResult)).not.toContain("15/14/14");
    expect(ivs(nonFunctionalResult)).toContain("15/14/15");
  });

  it("unions natural raid targets with stricter purified targets", () => {
    const stats = {
      attack: 100,
      defense: 100,
      stamina: 100
    };
    const result = buildRaidCpResult(
      input(stats, {
        ivFloor: 6,
        naturalTarget: {
          fullAttack: true,
          fullDefense: false,
          hpMode: "full"
        },
        includePurified: true,
        purifiedTarget: perfectTarget
      }),
      detailUrl
    );
    const resultIvs = ivs(result);

    expect(resultIvs).toContain("15/6/15");
    expect(resultIvs).toContain("13/13/13");
    expect(resultIvs).not.toContain("13/6/13");
    expect(row(result, "13/13/13")).toEqual(
      expect.objectContaining({
        cp20: String(calculateCP(stats, 13, 13, 13, 20)),
        cp25: String(calculateCP(stats, 13, 13, 13, 25))
      })
    );
  });

  it("applies IV floor to displayed boss IVs before purification", () => {
    const result = buildRaidCpResult(
      input(
        {
          attack: 100,
          defense: 100,
          stamina: 100
        },
        {
          ivFloor: 14,
          includePurified: true,
          purifiedTarget: perfectTarget
        }
      ),
      detailUrl
    );

    expect(ivs(result)).not.toContain("13/13/13");
  });
});
