import { describe, expect, it } from "vitest";

import {
  applyMasterfilePatches,
  type Masterfile,
  type MasterfilePokemon,
  type MasterfileTypeEntry
} from "../src/lib/pogo/masterfile";
import {
  buildPvpdpsRows,
  formatPvpdpsRow,
  listDoubleWeaknessPresets,
  listPvpdpsTypeNames
} from "../src/lib/pogo/pvpdps";

function createType(typeId: number, typeName: string, overrides: Partial<MasterfileTypeEntry> = {}): MasterfileTypeEntry {
  return {
    typeId,
    typeName,
    weaknesses: [],
    ...overrides
  };
}

function createPokemon(
  name: string,
  pokedexId: number,
  typeIds: number[],
  quickMoves: number[],
  chargedMoves: number[],
  attack: number,
  defense: number,
  stamina: number,
  purificationDust?: number
): MasterfilePokemon {
  return {
    name,
    pokedexId,
    types: Object.fromEntries(
      typeIds.map((typeId) => [String(typeId), { typeId, typeName: TYPE_NAMES[typeId] }])
    ),
    quickMoves,
    chargedMoves,
    eliteQuickMoves: [],
    eliteChargedMoves: [],
    stats: {
      attack,
      defense,
      stamina
    },
    legendary: false,
    mythic: false,
    ultraBeast: false,
    purificationDust
  };
}

const TYPE_NAMES: Record<number, string> = {
  1: "Normal",
  2: "Fighting",
  6: "Rock",
  7: "Bug",
  8: "Ghost",
  9: "Steel",
  10: "Fire",
  11: "Water",
  12: "Grass",
  13: "Electric",
  14: "Psychic",
  17: "Dark",
  18: "Fairy"
};

function createBaseMasterfile(pokemon: Record<string, MasterfilePokemon>): Masterfile {
  return {
    pokemon,
    types: {
      "1": createType(1, "Normal"),
      "8": createType(8, "Ghost"),
      "10": createType(10, "Fire", {
        weaknesses: [
          { typeId: 5, typeName: "Ground" },
          { typeId: 6, typeName: "Rock" },
          { typeId: 11, typeName: "Water" }
        ],
        resistances: [
          { typeId: 7, typeName: "Bug" },
          { typeId: 9, typeName: "Steel" },
          { typeId: 10, typeName: "Fire" },
          { typeId: 12, typeName: "Grass" }
        ],
        immunes: []
      }),
      "11": createType(11, "Water", {
        weaknesses: [
          { typeId: 12, typeName: "Grass" },
          { typeId: 13, typeName: "Electric" }
        ],
        resistances: [
          { typeId: 10, typeName: "Fire" },
          { typeId: 11, typeName: "Water" },
          { typeId: 15, typeName: "Ice" }
        ],
        immunes: []
      }),
      "12": createType(12, "Grass", {
        weaknesses: [
          { typeId: 3, typeName: "Flying" },
          { typeId: 4, typeName: "Poison" },
          { typeId: 7, typeName: "Bug" },
          { typeId: 10, typeName: "Fire" },
          { typeId: 15, typeName: "Ice" }
        ],
        resistances: [
          { typeId: 5, typeName: "Ground" },
          { typeId: 11, typeName: "Water" },
          { typeId: 12, typeName: "Grass" },
          { typeId: 13, typeName: "Electric" }
        ],
        immunes: []
      }),
      "14": createType(14, "Psychic")
    },
    moves: {
      "281": {
        id: 281,
        name: "Hidden Power",
        fast: true,
        type: 1,
        pvpPower: 5,
        pvpEnergyDelta: 8
      },
      "401": {
        id: 401,
        name: "Fire Jab",
        fast: true,
        type: 10,
        pvpPower: 6,
        pvpEnergyDelta: 6
      },
      "402": {
        id: 402,
        name: "Water Jab",
        fast: true,
        type: 11,
        pvpPower: 6,
        pvpEnergyDelta: 6
      },
      "403": {
        id: 403,
        name: "Ghost Jab",
        fast: true,
        type: 8,
        pvpPower: 6,
        pvpEnergyDelta: 6
      },
      "501": {
        id: 501,
        name: "Burst Cannon",
        fast: false,
        type: 10,
        pvpPower: 120,
        pvpEnergyDelta: -35
      }
    }
  };
}

describe("pvpdps", () => {
  it("lists defender types in type-id order", () => {
    const masterfile = createBaseMasterfile({
      "1": createPokemon("Firemon", 1, [10], [401], [501], 150, 150, 150)
    });

    expect(listPvpdpsTypeNames(masterfile)).toEqual(["Normal", "Ghost", "Fire", "Water", "Grass", "Psychic"]);
  });

  it("lists weakness presets for single-weakness and double-weakness combos", () => {
    const presets = listDoubleWeaknessPresets({
      pokemon: {
        "1": createPokemon("Normalmon", 1, [1], [401], [501], 100, 100, 100),
        "2": createPokemon("Electricmon", 2, [13], [401], [501], 100, 100, 100),
        "3": createPokemon("NormalGhostmon", 3, [1, 8], [401], [501], 100, 100, 100),
        "4": createPokemon("GrassFairymon", 4, [12, 18], [401], [501], 100, 100, 100),
        "5": createPokemon("BugGrassmon", 5, [7, 12], [401], [501], 100, 100, 100),
        "6": createPokemon("GhostPsychicmon", 6, [8, 14], [401], [501], 100, 100, 100),
        "7": createPokemon("GrassPsychicmon", 7, [12, 14], [401], [501], 100, 100, 100),
        "8": createPokemon("RockSteelmon", 8, [6, 9], [401], [501], 100, 100, 100)
      },
      moves: {},
      types: {
        "1": createType(1, "Normal", {
          weaknesses: [{ typeId: 2, typeName: "Fighting" }],
          immunes: [{ typeId: 8, typeName: "Ghost" }]
        }),
        "2": createType(2, "Fighting"),
        "3": createType(3, "Flying"),
        "4": createType(4, "Poison"),
        "5": createType(5, "Ground"),
        "6": createType(6, "Rock", {
          weaknesses: [
            { typeId: 2, typeName: "Fighting" },
            { typeId: 5, typeName: "Ground" },
            { typeId: 9, typeName: "Steel" },
            { typeId: 10, typeName: "Fire" },
            { typeId: 11, typeName: "Water" },
            { typeId: 12, typeName: "Grass" }
          ]
        }),
        "7": createType(7, "Bug", {
          weaknesses: [
            { typeId: 3, typeName: "Flying" },
            { typeId: 10, typeName: "Fire" },
            { typeId: 6, typeName: "Rock" }
          ]
        }),
        "8": createType(8, "Ghost", {
          weaknesses: [
            { typeId: 8, typeName: "Ghost" },
            { typeId: 17, typeName: "Dark" }
          ],
          immunes: [
            { typeId: 1, typeName: "Normal" },
            { typeId: 2, typeName: "Fighting" }
          ]
        }),
        "9": createType(9, "Steel", {
          weaknesses: [
            { typeId: 2, typeName: "Fighting" },
            { typeId: 5, typeName: "Ground" },
            { typeId: 10, typeName: "Fire" }
          ]
        }),
        "10": createType(10, "Fire"),
        "13": createType(13, "Electric", {
          weaknesses: [{ typeId: 5, typeName: "Ground" }]
        }),
        "14": createType(14, "Psychic", {
          weaknesses: [
            { typeId: 7, typeName: "Bug" },
            { typeId: 8, typeName: "Ghost" },
            { typeId: 17, typeName: "Dark" }
          ]
        }),
        "17": createType(17, "Dark"),
        "12": createType(12, "Grass", {
          weaknesses: [
            { typeId: 3, typeName: "Flying" },
            { typeId: 4, typeName: "Poison" },
            { typeId: 7, typeName: "Bug" },
            { typeId: 10, typeName: "Fire" },
            { typeId: 15, typeName: "Ice" }
          ]
        }),
        "18": createType(18, "Fairy", {
          weaknesses: [
            { typeId: 4, typeName: "Poison" },
            { typeId: 9, typeName: "Steel" }
          ]
        })
      }
    });

    const labels = presets.map((preset) => preset.label);

    expect(labels).toEqual(
      expect.arrayContaining([
        "Fighting -> Normal (1)",
        "Poison -> Grass+Fairy (1)",
        "Ground -> Electric (1)",
        "Bug -> Grass+Psychic (1)",
        "Dark -> Normal+Ghost (1)",
        "Dark+Ghost -> Ghost+Psychic (1)"
      ])
    );
    expect(labels.indexOf("Bug -> Grass+Psychic (1)")).toBeLessThan(
      labels.indexOf("Dark -> Normal+Ghost (1)")
    );
    expect(labels.indexOf("Dark -> Normal+Ghost (1)")).toBeLessThan(
      labels.indexOf("Dark+Ghost -> Ghost+Psychic (1)")
    );
    expect(labels).not.toContain("Ghost -> Ghost+Psychic (1)");
    expect(labels).not.toContain("Dark -> Ghost+Psychic (1)");
    expect(labels).not.toContain("Ground -> Rock+Steel (1)");
    expect(labels).not.toContain("Fighting -> Rock+Steel (1)");
  });

  it("applies prepared elite charged move patches to the shared masterfile", () => {
    const masterfile = applyMasterfilePatches({
      pokemon: {
        "384": {
          name: "Rayquaza",
          pokedexId: 384,
          eliteChargedMoves: [122, 379]
        },
        "483": {
          name: "Dialga",
          pokedexId: 483,
          forms: {
            "2829": {
              name: "Origin Forme",
              form: 2829
            }
          }
        },
        "646": {
          name: "Kyurem",
          pokedexId: 646,
          forms: {
            "147": {
              name: "White Kyurem",
              form: 147,
              eliteChargedMoves: []
            }
          }
        }
      },
      types: {},
      moves: {}
    });

    expect(masterfile.pokemon["384"].eliteChargedMoves).toEqual([122, 379, 384]);
    expect(masterfile.pokemon["483"].forms?.["2829"].eliteChargedMoves).toEqual([394]);
    expect(masterfile.pokemon["646"].forms?.["147"].eliteChargedMoves).toEqual([466]);
  });

  it("changes the top attacker with defender-type filters", () => {
    const masterfile = createBaseMasterfile({
      "1": createPokemon("Firemon", 1, [10], [401], [501], 150, 150, 150),
      "2": createPokemon("Watermon", 2, [11], [402], [501], 150, 150, 150)
    });

    const againstGrass = buildPvpdpsRows(masterfile, { type1: "Grass" });
    const againstFire = buildPvpdpsRows(masterfile, { type1: "Fire" });

    expect(againstGrass[0].pokemon).toBe("Firemon");
    expect(againstFire[0].pokemon).toBe("Watermon");
  });

  it("uses the charged-move branch only when the switch is enabled", () => {
    const masterfile = createBaseMasterfile({
      "1": createPokemon("Firemon", 1, [10], [401], [501], 150, 150, 150)
    });

    const quickOnly = buildPvpdpsRows(masterfile, {});
    const charged = buildPvpdpsRows(masterfile, { charged: true });

    expect(quickOnly[0].charged).toBeUndefined();
    expect(charged[0].charged).toBe(501);
    expect(formatPvpdpsRow(masterfile, charged[0]).charged).toBe("Burst Cannon");
  });

  it("includes shadow rows for shadow-capable Pokemon", () => {
    const masterfile = createBaseMasterfile({
      "1": createPokemon("Shadowmon", 1, [8], [403], [501], 170, 140, 150, 3000)
    });

    const rows = buildPvpdpsRows(masterfile, {});
    const normal = rows.find((row) => row.pokemon === "Shadowmon" && !row.shadow);
    const shadow = rows.find((row) => row.pokemon === "Shadowmon" && row.shadow);

    expect(normal).toBeDefined();
    expect(shadow).toBeDefined();
    expect(shadow!.dps / normal!.dps).toBeCloseTo(1.2);
    expect(shadow!.value / normal!.value).toBeCloseTo(1 / 1.2);
    expect(formatPvpdpsRow(masterfile, shadow!).tdo).toBe(formatPvpdpsRow(masterfile, normal!).tdo);
  });

  it("applies the Deoxys Attack IV-floor hack", () => {
    const masterfile = createBaseMasterfile({
      "386": createPokemon("Deoxys Attack", 386, [14], [403], [501], 414, 46, 137)
    });

    const rows = buildPvpdpsRows(masterfile, { cpCap: 1500 });

    expect(rows[0].pokemon).toBe("Deoxys Attack");
    expect(rows[0].iv).toBe("13/15/14");
  });

  it("formats Hidden Power rows with the inferred type name", () => {
    const masterfile = createBaseMasterfile({
      "1": createPokemon("Hiddenmon", 1, [10], [281], [501], 180, 180, 180)
    });

    const rows = buildPvpdpsRows(masterfile, {});
    const display = formatPvpdpsRow(masterfile, rows[0]);

    expect(display.quick).toBe("Hidden Power Fire");
    expect(display.charged).toBe("");
  });
});
