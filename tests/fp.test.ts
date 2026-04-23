import { describe, expect, it } from "vitest";

import {
  buildFunctionallyPerfectJudgeHref,
  buildFunctionallyPerfectSections
} from "../src/lib/pogo/fp";
import type { Masterfile, MasterfilePokemon, MasterfileStats } from "../src/lib/pogo/masterfile";

function stats(stamina: number, attack = 100, defense = 100): MasterfileStats {
  return {
    attack,
    defense,
    stamina
  };
}

function pokemon(
  name: string,
  pokedexId: number,
  stamina: number,
  extra: Partial<MasterfilePokemon> = {}
): MasterfilePokemon {
  return {
    name,
    pokedexId,
    stats: stats(stamina),
    ...extra
  };
}

function masterfile(pokemonEntries: Record<string, MasterfilePokemon>): Masterfile {
  return {
    pokemon: pokemonEntries,
    types: {},
    moves: {}
  };
}

function sectionLabels(masterfileData: Masterfile, level: number): string[] {
  return buildFunctionallyPerfectSections(masterfileData)
    .find((section) => section.level === level)!
    .entries.map((entry) => entry.label);
}

describe("Functionally Perfect List", () => {
  it("builds fixed Judge links for listed entries", () => {
    expect(buildFunctionallyPerfectJudgeHref("100/100/15")).toBe(
      "/judge?stats=100%2F100%2F15&atk=15&def=15&sta=14&cpcap=50000&lvcap=50%2C51%2C52%2C53%2C55"
    );
  });

  it("includes base and form entries at regular levels", () => {
    const data = masterfile({
      "1": pokemon("BaseOnly", 1, 14),
      "2": pokemon("Formed", 2, 201, {
        defaultFormId: 10,
        forms: {
          "10": {
            name: "Normal",
            form: 10
          },
          "11": {
            name: "Tall",
            form: 11,
            stats: stats(11)
          },
          "12": {
            name: "Hat",
            form: 12,
            isCostume: true,
            stats: stats(14)
          }
        }
      })
    });

    expect(sectionLabels(data, 40)).toEqual(["BaseOnly"]);
    expect(sectionLabels(data, 50)).toEqual(["Formed (Tall)"]);
    expect(sectionLabels(data, 51)).toEqual(["Formed (Tall)"]);
  });

  it("uses mega-eligible base entries for mega-only levels when HP is unchanged", () => {
    const data = masterfile({
      "1": pokemon("BaseOnly", 1, 15),
      "2": pokemon("Charizard", 6, 15, {
        tempEvolutions: {
          "2": {
            tempEvoId: 2,
            stats: stats(15, 273, 213)
          },
          "3": {
            tempEvoId: 3,
            stats: stats(15, 319, 212)
          }
        }
      })
    });

    expect(sectionLabels(data, 55)).toEqual(["Charizard"]);
  });

  it("splits stamina-changing mega and primal entries for regular and mega-only levels", () => {
    const data = masterfile({
      "384": pokemon("Rayquaza", 384, 14, {
        tempEvolutions: {
          "1": {
            tempEvoId: 1,
            stats: stats(19, 377, 210)
          }
        }
      }),
      "382": pokemon("Kyogre", 382, 201, {
        tempEvolutions: {
          "4": {
            tempEvoId: 4,
            stats: stats(19, 353, 268)
          }
        }
      })
    });

    expect(sectionLabels(data, 40)).toEqual([
      "Kyogre (Primal)",
      "Rayquaza",
      "Rayquaza (Mega)"
    ]);
    expect(sectionLabels(data, 52)).toEqual([
      "Kyogre (Primal)",
      "Rayquaza (Mega)"
    ]);
  });

  it("sorts section entries by pokedex and form id and suppresses duplicate candidates", () => {
    const data = masterfile({
      "2": pokemon("LaterDex", 2, 15, {
        tempEvolutions: {
          "1": {
            tempEvoId: 1,
            stats: stats(15, 200, 200)
          }
        }
      }),
      "1": pokemon("EarlierDex", 1, 14, {
        defaultFormId: 11,
        forms: {
          "11": {
            name: "Normal",
            form: 11
          },
          "12": {
            name: "Higher Form",
            form: 12,
            stats: stats(14, 210, 210),
            tempEvolutions: {
              "1": {
                tempEvoId: 1,
                stats: stats(19, 250, 250)
              }
            }
          }
        }
      }),
      "3": pokemon("Alpha", 3, 15, {
        tempEvolutions: {
          "1": {
            tempEvoId: 1,
            stats: stats(15, 210, 210)
          }
        }
      }),
      "4": pokemon("Alpha", 4, 15, {
        tempEvolutions: {
          "1": {
            tempEvoId: 1,
            stats: stats(15, 210, 210)
          }
        }
      })
    });

    expect(sectionLabels(data, 40)).toEqual([
      "EarlierDex",
      "EarlierDex (Higher Form)",
      "EarlierDex (Higher Form) (Mega)"
    ]);
    expect(sectionLabels(data, 55)).toEqual(["LaterDex", "Alpha"]);
  });
});
