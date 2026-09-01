import { describe, expect, it } from "vitest";

import type {
  Masterfile,
  MasterfileMove,
  MasterfilePokemon,
  MasterfileTypeEntry
} from "../src/lib/pogo/masterfile";
import {
  assertPvedpsMasterfile,
  buildPvedpsRows,
  calculateMegaLevel4MovePower,
  formatPvedpsRow,
  isPvedpsMode,
  PvedpsMasterfileError
} from "../src/lib/pogo/pvedps";

function type(typeId: number, typeName: string): MasterfileTypeEntry {
  return { typeId, typeName, weaknesses: [], resistances: [], immunes: [] };
}

function move(
  id: number,
  name: string,
  moveType: number,
  power: number,
  durationMs: number,
  energyDelta: number,
  fast: boolean
): MasterfileMove {
  return { id, name, type: moveType, power, durationMs, energyDelta, fast };
}

function pokemon(
  name: string,
  pokedexId: number,
  quickMoves: number[],
  chargedMoves: number[]
): MasterfilePokemon {
  return {
    name,
    pokedexId,
    stats: { attack: 200, defense: 180, stamina: 190 },
    types: { "16": { typeId: 16, typeName: "Dragon" } },
    quickMoves,
    chargedMoves,
    eliteQuickMoves: [],
    eliteChargedMoves: []
  };
}

function createMasterfile(): Masterfile {
  const dragonite = pokemon("Dragonite", 149, [100], [200]);
  dragonite.tempEvolutions = {
    "1": {
      tempEvoId: 1,
      stats: { attack: 299, defense: 255, stamina: 209 },
      specialMove: 515
    },
    "2": { tempEvoId: 2, stats: { attack: 290, defense: 250, stamina: 209 } },
    "3": { tempEvoId: 3, stats: { attack: 300, defense: 240, stamina: 209 } },
    "4": { tempEvoId: 4, stats: { attack: 295, defense: 245, stamina: 209 } },
    "5": {
      tempEvoId: 5,
      stats: { attack: 305, defense: 235, stamina: 209 },
      unreleased: true
    },
    gmax: {
      tempEvoId: "TEMP_EVOLUTION_GMAX",
      stats: { attack: 999, defense: 999, stamina: 999 }
    }
  };

  return {
    pokemon: {
      "149": dragonite,
      "900": pokemon("Gymmon", 900, [101], [202, 203])
    },
    types: {
      "0": type(0, "None"),
      "12": type(12, "Grass"),
      "16": type(16, "Dragon")
    },
    moves: {
      "100": move(100, "Dragon Breath", 16, 6, 500, 8, true),
      "101": move(101, "Leaf Tap", 12, 8, 700, 8, true),
      "200": move(200, "Outrage", 16, 110, 4000, -50, false),
      "202": move(202, "Leaf Burst", 12, 60, 2000, -50, false),
      "203": move(203, "Leaf Cataclysm", 12, 300, 3000, -100, false),
      "515": move(515, "Outrage+", 16, 185, 4000, -100, false)
    }
  };
}

describe("pvedps", () => {
  it("uses exact, unrounded Mega Level 4 move power", () => {
    expect(calculateMegaLevel4MovePower(185)).toBe(240.5);
  });

  it("defaults to Party of 2 and recognizes only supported modes", () => {
    const masterfile = createMasterfile();
    expect(buildPvedpsRows(masterfile)).toEqual(buildPvedpsRows(masterfile, { mode: "party2" }));
    expect(isPvedpsMode("party4")).toBe(true);
    expect(isPvedpsMode("party5")).toBe(false);
  });

  it("models every Mega and Primal branch at level 52 without treating Gmax as Mega", () => {
    const rows = buildPvedpsRows(createMasterfile(), { mode: "raid" }).filter(
      (row) => row.pokemon === "Dragonite"
    );
    for (const form of ["Mega", "Mega X", "Mega Y", "Primal", "Mega Z"]) {
      const formRows = rows.filter((row) => row.form === form);
      expect(formRows.length).toBeGreaterThan(0);
      expect(formRows.every((row) => row.level === 52)).toBe(true);
      expect(formRows.every((row) => row.alignment === "")).toBe(true);
    }
    expect(rows.some((row) => row.form.includes("Gmax"))).toBe(false);
  });

  it("offers a special attack only to its attached branch", () => {
    const rows = buildPvedpsRows(createMasterfile(), { mode: "raid" }).filter(
      (row) => row.pokemon === "Dragonite"
    );
    expect(rows.some((row) => row.form === "Mega" && row.charged === 515)).toBe(true);
    expect(rows.some((row) => row.form === "" && row.charged === 515)).toBe(false);
    expect(rows.some((row) => row.form === "Mega X" && row.charged === 515)).toBe(false);
  });

  it("does not offer special Mega attacks in Gym mode", () => {
    const rows = buildPvedpsRows(createMasterfile(), { mode: "gym" }).filter(
      (row) => row.pokemon === "Dragonite"
    );
    expect(rows.some((row) => row.charged === 515)).toBe(false);
  });

  it("includes released and unreleased temporary evolutions with explicit status", () => {
    const masterfile = createMasterfile();
    const rows = buildPvedpsRows(masterfile, { mode: "raid" });
    const primal = rows.find((row) => row.pokemon === "Dragonite" && row.form === "Primal");
    const megaZ = rows.find((row) => row.pokemon === "Dragonite" && row.form === "Mega Z");
    expect(primal?.availability).toBe("Available");
    expect(megaZ?.availability).toBe("Unreleased");
    expect(formatPvedpsRow(masterfile, megaZ!).availability).toBe("Unreleased");
  });

  it("matches reference Gym one-bar filtering and the Raid/Party timing branches", () => {
    const masterfile = createMasterfile();
    const gym = buildPvedpsRows(masterfile, { mode: "gym" }).find(
      (row) => row.pokemon === "Gymmon" && row.form === ""
    );
    const raid = buildPvedpsRows(masterfile, { mode: "raid" }).find(
      (row) => row.pokemon === "Gymmon" && row.form === ""
    );
    const party2 = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Gymmon" && row.form === ""
    );
    const party3 = buildPvedpsRows(masterfile, { mode: "party3" }).find(
      (row) => row.pokemon === "Gymmon" && row.form === ""
    );
    const party4 = buildPvedpsRows(masterfile, { mode: "party4" }).find(
      (row) => row.pokemon === "Gymmon" && row.form === ""
    );
    expect(gym?.charged).toBe(203);
    expect(raid?.charged).toBe(203);
    expect(party2!.dps).toBeGreaterThan(raid!.dps);
    expect(party3!.dps).toBeGreaterThan(party2!.dps);
    expect(party4!.dps).toBe(party3!.dps);
  });

  it("keeps Hidden Power, Shadow, and Apex reference variants", () => {
    const masterfile = createMasterfile();
    const hidden = pokemon("Hiddenmon", 901, [281], [200]);
    const shadow = pokemon("Shadowmon", 902, [100], [200]);
    shadow.purificationDust = 3000;
    masterfile.pokemon["901"] = hidden;
    masterfile.pokemon["902"] = shadow;
    masterfile.pokemon["249"] = pokemon("Lugia", 249, [100], [200]);
    masterfile.pokemon["250"] = pokemon("Ho Oh", 250, [100], [200]);
    masterfile.moves["281"] = move(281, "Hidden Power", 1, 15, 1500, 15, true);
    masterfile.moves["360"] = move(360, "Aeroblast++", 16, 225, 3500, -100, false);
    masterfile.moves["361"] = move(361, "Aeroblast+", 16, 200, 3500, -100, false);
    masterfile.moves["362"] = move(362, "Sacred Fire++", 16, 155, 3000, -100, false);
    masterfile.moves["363"] = move(363, "Sacred Fire+", 16, 135, 3000, -100, false);

    const rows = buildPvedpsRows(masterfile, { mode: "raid" });
    const hiddenRow = rows.find((row) => row.pokemon === "Hiddenmon");
    const normalShadowmon = rows.find(
      (row) => row.pokemon === "Shadowmon" && row.alignment === ""
    );
    const shadowShadowmon = rows.find(
      (row) => row.pokemon === "Shadowmon" && row.alignment === "Shadow"
    );

    expect(hiddenRow?.quick).toBe(281);
    expect(hiddenRow?.quickType).toBeGreaterThanOrEqual(2);
    expect(hiddenRow?.quickType).toBeLessThan(18);
    expect(formatPvedpsRow(masterfile, hiddenRow!).quick).toContain("Hidden Power");
    expect(shadowShadowmon!.dps / normalShadowmon!.dps).toBeCloseTo(1.2);
    expect(shadowShadowmon!.value).toBe(normalShadowmon!.value);
    expect(rows.some((row) => row.pokemon === "Lugia" && row.alignment === "Apex Shadow")).toBe(true);
    expect(rows.some((row) => row.pokemon === "Lugia" && row.alignment === "Apex")).toBe(true);
    expect(rows.some((row) => row.pokemon === "Ho Oh" && row.alignment === "Apex Shadow")).toBe(true);
    expect(rows.some((row) => row.pokemon === "Ho Oh" && row.alignment === "Apex")).toBe(true);
  });

  it("rejects the old runtime masterfile schema instead of returning misleading rankings", () => {
    const masterfile = createMasterfile();
    for (const move of Object.values(masterfile.moves)) {
      delete move.energyDelta;
    }
    expect(() => assertPvedpsMasterfile(masterfile)).toThrow(PvedpsMasterfileError);
  });
});
