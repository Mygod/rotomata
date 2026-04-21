import { describe, expect, it } from "vitest";

import { calculateCpMultiplier } from "../src/lib/pogo/parity";
import type {
  Masterfile,
  MasterfileForm,
  MasterfileMove,
  MasterfilePokemon,
  MasterfileStats,
  MasterfileTypeEntry,
  MasterfileTypeRef
} from "../src/lib/pogo/masterfile";
import {
  buildMaxBulkRows,
  buildMaxDpsRows,
  formatMaxBulkRow,
  listMaxBattleTypeNames
} from "../src/lib/pogo/maxbattle";

function createType(
  typeId: number,
  typeName: string,
  overrides: Partial<MasterfileTypeEntry> = {}
): MasterfileTypeEntry {
  return {
    typeId,
    typeName,
    weaknesses: [],
    ...overrides
  };
}

function createTypeRefs(typeIds: number[]): Record<string, MasterfileTypeRef> {
  return Object.fromEntries(
    typeIds.map((typeId) => [String(typeId), { typeId, typeName: TYPE_NAMES[typeId] }])
  );
}

function createMove(
  id: number,
  name: string,
  type: number,
  overrides: Partial<MasterfileMove> = {}
): MasterfileMove {
  return {
    id,
    name,
    type,
    power: 0,
    ...overrides
  };
}

function createPokemon(
  name: string,
  pokedexId: number,
  typeIds: number[],
  stats: MasterfileStats,
  overrides: Partial<MasterfilePokemon> = {}
): MasterfilePokemon {
  return {
    name,
    pokedexId,
    types: createTypeRefs(typeIds),
    stats,
    quickMoves: [],
    chargedMoves: [],
    eliteQuickMoves: [],
    eliteChargedMoves: [],
    legendary: false,
    mythic: false,
    ultraBeast: false,
    ...overrides
  };
}

function createForm(name: string, overrides: Partial<MasterfileForm> = {}): MasterfileForm {
  return {
    name,
    ...overrides
  };
}

const TYPE_NAMES: Record<number, string> = {
  1: "Normal",
  3: "Flying",
  9: "Steel",
  10: "Fire",
  11: "Water",
  13: "Electric",
  16: "Dragon"
};

function createMasterfile(pokemon: Record<string, MasterfilePokemon>): Masterfile {
  return {
    pokemon,
    types: {
      "1": createType(1, "Normal"),
      "3": createType(3, "Flying"),
      "9": createType(9, "Steel"),
      "10": createType(10, "Fire"),
      "11": createType(11, "Water"),
      "13": createType(13, "Electric", {
        weakAgainst: [{ typeId: 11, typeName: "Water" }],
        veryWeakAgainst: [{ typeId: 3, typeName: "Flying" }],
        strengths: [{ typeId: 13, typeName: "Electric" }]
      }),
      "16": createType(16, "Dragon")
    },
    moves: {
      "401": createMove(401, "Quick Steel", 9, { durationMs: 1000 }),
      "402": createMove(402, "Slow Steel", 9, { durationMs: 1500 }),
      "403": createMove(403, "Quick Water", 11, { durationMs: 1000 }),
      "404": createMove(404, "Quick Normal", 1, { durationMs: 1000 }),
      "427": createMove(427, "Gmax Wildfire", 10, { power: 450, durationMs: 2500 }),
      "479": createMove(479, "Max Behemoth Blade", 9, { power: 350, durationMs: 2500 }),
      "480": createMove(480, "Max Behemoth Bash", 9, { power: 350, durationMs: 2500 }),
      "483": createMove(483, "Max Dynamax Cannon", 16, { power: 450, durationMs: 2500 })
    }
  };
}

describe("maxbattle", () => {
  it("lists max-battle types in type-id order", () => {
    const masterfile = createMasterfile({});

    expect(listMaxBattleTypeNames(masterfile)).toEqual([
      "Normal",
      "Flying",
      "Steel",
      "Fire",
      "Water",
      "Electric",
      "Dragon"
    ]);
  });

  it("treats the masterfile None type as no filter instead of a selectable battle type", () => {
    const masterfile = createMasterfile({
      "1": createPokemon("Firemon", 1, [10], { attack: 200, defense: 160, stamina: 160 }, {
        gmaxMove: 427,
        quickMoves: [401]
      })
    });

    expect(listMaxBattleTypeNames(masterfile)).not.toContain("None");
    expect(buildMaxDpsRows(masterfile, { type: "None" })).toEqual(buildMaxDpsRows(masterfile, {}));
    expect(buildMaxBulkRows(masterfile, { type: "None" })).toEqual(buildMaxBulkRows(masterfile, {}));
  });

  it("preserves duplicate base and form rows in maxdps when both carriers expose the same gmax move", () => {
    const masterfile = createMasterfile({
      "1": createPokemon("Duplicatemon", 1, [10], { attack: 200, defense: 160, stamina: 160 }, {
        gmaxMove: 427,
        forms: {
          "101": createForm("Normal", { gmaxMove: 427 })
        }
      })
    });

    const rows = buildMaxDpsRows(masterfile, { type: "Fire" });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.form)).toEqual(["", "Normal"]);
    expect(rows.every((row) => row.move === 427)).toBe(true);
  });

  it("emits Crowned Sword adventure rows and applies the Eternatus power bonus in maxdps", () => {
    const masterfile = createMasterfile({
      "888": createPokemon("Zacian", 888, [9], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "2576": createForm("Crowned Sword", {
            stats: { attack: 332, defense: 240, stamina: 192 },
            gmaxMove: 479
          })
        }
      }),
      "890": createPokemon("Eternatus", 890, [16], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "999": createForm("Normal", {
            stats: { attack: 278, defense: 192, stamina: 268 },
            types: createTypeRefs([16]),
            gmaxMove: 483
          })
        }
      })
    });

    const rows = buildMaxDpsRows(masterfile);
    const crownedBase = rows.find((row) => row.pokemon === "Zacian" && row.form === "Crowned Sword");
    const crownedAdventure = rows.find(
      (row) => row.pokemon === "Zacian" && row.form === "Crowned Sword (Behemoth Blade)"
    );
    const eternatus = rows.find((row) => row.pokemon === "Eternatus" && row.form === "Normal");

    expect(crownedBase).toBeDefined();
    expect(crownedAdventure).toBeDefined();
    expect(crownedAdventure!.dps).toBeGreaterThan(crownedBase!.dps);

    const multiplier = calculateCpMultiplier(50);
    const attack = (278 + 15) * multiplier;
    const expectedDps = ((450 + 100) * 1.2 * attack) / 100;
    expect(eternatus?.dps).toBeCloseTo(expectedDps, 6);
  });

  it("can disable maxdps adventure effects for both the power bonus and dog variants", () => {
    const masterfile = createMasterfile({
      "888": createPokemon("Zacian", 888, [9], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "2576": createForm("Crowned Sword", {
            stats: { attack: 332, defense: 240, stamina: 192 },
            gmaxMove: 479
          })
        }
      }),
      "890": createPokemon("Eternatus", 890, [16], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "999": createForm("Normal", {
            stats: { attack: 278, defense: 192, stamina: 268 },
            types: createTypeRefs([16]),
            gmaxMove: 483
          })
        }
      }),
      "1": createPokemon("Firemon", 1, [10], { attack: 200, defense: 160, stamina: 160 }, {
        quickMoves: [401]
      })
    });

    const withEffect = buildMaxDpsRows(masterfile, { adventureEffects: true });
    const withoutEffect = buildMaxDpsRows(masterfile, { adventureEffects: false });
    const zacianAdventure = withEffect.find(
      (row) => row.pokemon === "Zacian" && row.form === "Crowned Sword (Behemoth Blade)"
    );
    const zacianAdventureWithoutEffect = withoutEffect.find(
      (row) => row.pokemon === "Zacian" && row.form === "Crowned Sword (Behemoth Blade)"
    );
    const eternatusWithEffect = withEffect.find((row) => row.pokemon === "Eternatus" && row.form === "Normal");
    const eternatusWithoutEffect = withoutEffect.find(
      (row) => row.pokemon === "Eternatus" && row.form === "Normal"
    );
    const firemonWithEffect = withEffect.find((row) => row.pokemon === "Firemon");
    const firemonWithoutEffect = withoutEffect.find((row) => row.pokemon === "Firemon");

    expect(zacianAdventure).toBeDefined();
    expect(zacianAdventureWithoutEffect).toBeUndefined();
    expect(eternatusWithEffect!.dps).toBeGreaterThan(eternatusWithoutEffect!.dps);
    expect(firemonWithEffect!.dps).toBeGreaterThan(firemonWithoutEffect!.dps);
  });

  it("sorts maxdps rows by dps and then by value", () => {
    const masterfile = createMasterfile({
      "1": createPokemon("Bulkier", 1, [10], { attack: 210, defense: 220, stamina: 220 }, {
        gmaxMove: 427
      }),
      "2": createPokemon("Frailer", 2, [10], { attack: 210, defense: 160, stamina: 160 }, {
        gmaxMove: 427
      })
    });

    const rows = buildMaxDpsRows(masterfile, { type: "Fire" });

    expect(rows.slice(0, 2).map((row) => row.pokemon)).toEqual(["Bulkier", "Frailer"]);
    expect(rows[0].dps).toBeCloseTo(rows[1].dps, 10);
    expect(rows[0].value).toBeGreaterThan(rows[1].value);
  });

  it("applies incoming-type multipliers and picks the fastest quick move in maxbulk", () => {
    const masterfile = createMasterfile({
      "1": createPokemon("Watermon", 1, [11], { attack: 200, defense: 200, stamina: 200 }, {
        quickMoves: [403, 402],
        gmaxMove: 427
      }),
      "2": createPokemon("Plainmon", 2, [1], { attack: 200, defense: 200, stamina: 200 }, {
        quickMoves: [404],
        gmaxMove: 427
      })
    });

    const rows = buildMaxBulkRows(masterfile, { type: "Electric" });
    const watermon = rows.find((row) => row.pokemon === "Watermon");
    const plainmon = rows.find((row) => row.pokemon === "Plainmon");

    expect(watermon).toBeDefined();
    expect(plainmon).toBeDefined();
    expect(watermon!.bulk).toBeGreaterThan(plainmon!.bulk);
    expect(watermon!.fast).toBe(1000);
  });

  it("adds Crowned synthetic rows and Behemoth Bash variants in maxbulk", () => {
    const masterfile = createMasterfile({
      "889": createPokemon("Zamazenta", 889, [9], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "2578": createForm("Crowned Shield", {
            stats: { attack: 250, defense: 300, stamina: 192 },
            quickMoves: [401],
            gmaxMove: 480
          })
        }
      })
    });

    const rows = buildMaxBulkRows(masterfile);
    const formNames = rows.map((row) => row.form);
    const crowned4x = rows.find((row) => row.form === "Crowned 4x");
    const crowned4xAdventure = rows.find((row) => row.form === "Crowned 4x (Behemoth Bash)");

    expect(formNames).toContain("Crowned Shield");
    expect(formNames).toContain("Crowned 4x");
    expect(formNames).toContain("Crowned Shield (Behemoth Bash)");
    expect(formNames).toContain("Crowned 4x (Behemoth Bash)");
    expect(crowned4x?.gmax).toBe(480);
    expect(formatMaxBulkRow(crowned4xAdventure!).gmax).toBe("✓");
  });

  it("can disable maxbulk adventure effects for both the shield bonus and dog variants", () => {
    const masterfile = createMasterfile({
      "889": createPokemon("Zamazenta", 889, [9], { attack: 250, defense: 200, stamina: 180 }, {
        forms: {
          "2578": createForm("Crowned Shield", {
            stats: { attack: 250, defense: 300, stamina: 192 },
            quickMoves: [401],
            gmaxMove: 480
          })
        }
      }),
      "1": createPokemon("BaseMon", 1, [1], { attack: 200, defense: 220, stamina: 220 }, {
        quickMoves: [404]
      })
    });

    const withEffect = buildMaxBulkRows(masterfile, { adventureEffects: true });
    const withoutEffect = buildMaxBulkRows(masterfile, { adventureEffects: false });
    const baseMonWithEffect = withEffect.find((row) => row.pokemon === "BaseMon" && row.form === "");
    const baseMonWithoutEffect = withoutEffect.find((row) => row.pokemon === "BaseMon" && row.form === "");
    const crownedAdventure = withEffect.find(
      (row) => row.pokemon === "Zamazenta" && row.form === "Crowned Shield (Behemoth Bash)"
    );
    const crownedAdventureWithoutEffect = withoutEffect.find(
      (row) => row.pokemon === "Zamazenta" && row.form === "Crowned Shield (Behemoth Bash)"
    );
    const crowned4xAdventureWithoutEffect = withoutEffect.find(
      (row) => row.pokemon === "Zamazenta" && row.form === "Crowned 4x (Behemoth Bash)"
    );

    expect(baseMonWithEffect!.bulk).toBeGreaterThan(baseMonWithoutEffect!.bulk);
    expect(crownedAdventure).toBeDefined();
    expect(crownedAdventureWithoutEffect).toBeUndefined();
    expect(crowned4xAdventureWithoutEffect).toBeUndefined();
  });

  it("breaks maxbulk ties by value", () => {
    const masterfile = createMasterfile({
      "1": createPokemon("BaseMon", 1, [1], { attack: 200, defense: 220, stamina: 220 }, {
        quickMoves: [404],
        forms: {
          "101": createForm("Crowned Sword", {
            stats: { attack: 200, defense: 220, stamina: 220 },
            quickMoves: [404]
          })
        }
      }),
      "2": createPokemon("HigherAttack", 2, [1], { attack: 240, defense: 180, stamina: 180 }, {
        quickMoves: [404]
      }),
      "3": createPokemon("LowerAttack", 3, [1], { attack: 200, defense: 180, stamina: 180 }, {
        quickMoves: [404]
      })
    });

    const rows = buildMaxBulkRows(masterfile);
    const baseMon = rows.find((row) => row.pokemon === "BaseMon" && row.form === "");
    const crowned = rows.find((row) => row.pokemon === "BaseMon" && row.form === "Crowned Sword");
    const sameBulkRows = rows.filter((row) => row.pokemon === "HigherAttack" || row.pokemon === "LowerAttack");

    expect(baseMon!.bulk).toBeGreaterThan(crowned!.bulk);
    expect(sameBulkRows.map((row) => row.pokemon)).toEqual(["HigherAttack", "LowerAttack"]);
    expect(sameBulkRows[0].bulk).toBeCloseTo(sameBulkRows[1].bulk, 10);
    expect(sameBulkRows[0].value).toBeGreaterThan(sameBulkRows[1].value);
  });
});
