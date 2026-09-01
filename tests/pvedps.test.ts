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
  isPvedpsWeather,
  PVEDPS_WEATHER_OPTIONS,
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

  it("defines every in-game weather and recognizes only supported URL values", () => {
    expect(PVEDPS_WEATHER_OPTIONS).toEqual([
      { value: "none", label: "No weather", typeIds: [], typeNames: [] },
      {
        value: "clear",
        label: "Clear / Sunny",
        typeIds: [5, 10, 12],
        typeNames: ["Ground", "Fire", "Grass"]
      },
      {
        value: "rain",
        label: "Rain",
        typeIds: [7, 11, 13],
        typeNames: ["Bug", "Water", "Electric"]
      },
      {
        value: "partly-cloudy",
        label: "Partly Cloudy",
        typeIds: [1, 6],
        typeNames: ["Normal", "Rock"]
      },
      {
        value: "cloudy",
        label: "Cloudy / Overcast",
        typeIds: [2, 4, 18],
        typeNames: ["Fighting", "Poison", "Fairy"]
      },
      {
        value: "windy",
        label: "Windy",
        typeIds: [3, 14, 16],
        typeNames: ["Flying", "Psychic", "Dragon"]
      },
      {
        value: "snow",
        label: "Snow",
        typeIds: [9, 15],
        typeNames: ["Steel", "Ice"]
      },
      {
        value: "fog",
        label: "Fog",
        typeIds: [8, 17],
        typeNames: ["Ghost", "Dark"]
      }
    ]);
    expect(isPvedpsWeather("partly-cloudy")).toBe(true);
    expect(isPvedpsWeather("sunny")).toBe(false);
  });

  it("applies weather per move type and composes it with Mega Level 4 and teammate boosts", () => {
    const masterfile = createMasterfile();
    const find = (weather: "none" | "clear" | "windy", megaTeammateBoost = false) =>
      buildPvedpsRows(masterfile, {
        mode: "party2",
        weather,
        megaTeammateBoost
      }).find((row) => row.pokemon === "Dragonite" && row.form === "Mega")!;

    expect(find("clear").dps).toBeCloseTo(find("none").dps);
    expect(find("windy").dps / find("none").dps).toBeCloseTo(1.2);
    expect(find("windy", true).dps / find("none", true).dps).toBeCloseTo(1.2);
    expect(find("windy", true).charged).toBe(515);
  });

  it("reselects the best moveset after applying weather", () => {
    const masterfile = createMasterfile();
    masterfile.moves["102"] = move(102, "Leaf Flick", 12, 8, 500, 8, true);
    masterfile.pokemon["149"].quickMoves = [100, 102];
    const unboosted = buildPvedpsRows(masterfile, { mode: "raid" }).find(
      (row) => row.pokemon === "Dragonite" && row.form === ""
    );
    const windy = buildPvedpsRows(masterfile, { mode: "raid", weather: "windy" }).find(
      (row) => row.pokemon === "Dragonite" && row.form === ""
    );

    expect(unboosted?.quick).toBe(102);
    expect(windy?.quick).toBe(100);
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

  it("applies the teammate aura per move while leaving ordinary attackers unboosted", () => {
    const masterfile = createMasterfile();
    const unboosted = buildPvedpsRows(masterfile, { mode: "party2" });
    const boosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      megaTeammateBoost: true
    });
    const find = (rows: ReturnType<typeof buildPvedpsRows>, form: string) =>
      rows.find((row) => row.pokemon === "Dragonite" && row.form === form)!;

    expect(find(boosted, "Mega").dps / find(unboosted, "Mega").dps).toBeCloseTo(1.3);
    expect(find(boosted, "").dps).toBe(find(unboosted, "").dps);

    masterfile.moves["102"] = move(102, "Leaf Flick", 12, 8, 500, 8, true);
    masterfile.moves["204"] = move(204, "Leaf Wave", 12, 120, 4000, -50, false);
    masterfile.pokemon["149"].quickMoves = [102];
    masterfile.pokemon["149"].chargedMoves = [204];
    const offTypeUnboosted = buildPvedpsRows(masterfile, { mode: "party2" });
    const offTypeBoosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      megaTeammateBoost: true
    });
    expect(find(offTypeBoosted, "Mega X").dps / find(offTypeUnboosted, "Mega X").dps).toBeCloseTo(
      1.1
    );
  });

  it("selects the best Mega moveset after applying its exact teammate aura", () => {
    const masterfile = createMasterfile();
    masterfile.moves["102"] = move(102, "Leaf Flick", 12, 8, 500, 8, true);
    masterfile.pokemon["149"].quickMoves = [100, 102];
    const unboosted = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Dragonite" && row.form === "Mega X"
    );
    const boosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      megaTeammateBoost: true
    }).find((row) => row.pokemon === "Dragonite" && row.form === "Mega X");

    expect(unboosted?.quick).toBe(102);
    expect(boosted?.quick).toBe(100);
  });

  it("applies an explicit background aura to ordinary attackers and reselects movesets", () => {
    const uniformMasterfile = createMasterfile();
    const uniformUnboosted = buildPvedpsRows(uniformMasterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Dragonite" && row.form === ""
    );
    const uniformMatching = buildPvedpsRows(uniformMasterfile, {
      mode: "party2",
      teammateAuraTypeIds: [16]
    }).find((row) => row.pokemon === "Dragonite" && row.form === "");
    const uniformOther = buildPvedpsRows(uniformMasterfile, {
      mode: "party2",
      teammateAuraTypeIds: [12]
    }).find((row) => row.pokemon === "Dragonite" && row.form === "");

    expect(uniformMatching!.dps / uniformUnboosted!.dps).toBeCloseTo(1.3);
    expect(uniformOther!.dps / uniformUnboosted!.dps).toBeCloseTo(1.1);

    const masterfile = createMasterfile();
    masterfile.moves["102"] = move(102, "Leaf Flick", 12, 8, 500, 8, true);
    masterfile.pokemon["149"].quickMoves = [100, 102];
    const unboosted = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Dragonite" && row.form === ""
    );
    const dragonAura = buildPvedpsRows(masterfile, {
      mode: "party2",
      teammateAuraTypeIds: [16]
    }).find((row) => row.pokemon === "Dragonite" && row.form === "");
    const grassAura = buildPvedpsRows(masterfile, {
      mode: "party2",
      teammateAuraTypeIds: [12]
    }).find((row) => row.pokemon === "Dragonite" && row.form === "");

    expect(unboosted?.quick).toBe(102);
    expect(dragonAura?.quick).toBe(100);
    expect(grassAura!.dps).toBeGreaterThan(unboosted!.dps * 1.1);
  });

  it("applies an explicit background aura to Apex attackers", () => {
    const masterfile = createMasterfile();
    masterfile.pokemon["249"] = pokemon("Lugia", 249, [100], [200]);
    masterfile.moves["360"] = move(360, "Aeroblast++", 16, 225, 3500, -100, false);
    const unboosted = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Lugia" && row.alignment === "Apex Shadow"
    );
    const boosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      teammateAuraTypeIds: [16]
    }).find((row) => row.pokemon === "Lugia" && row.alignment === "Apex Shadow");
    const windy = buildPvedpsRows(masterfile, {
      mode: "party2",
      teammateAuraTypeIds: [16],
      weather: "windy"
    }).find((row) => row.pokemon === "Lugia" && row.alignment === "Apex Shadow");

    expect(boosted!.dps / unboosted!.dps).toBeCloseTo(1.3);
    expect(windy!.dps / boosted!.dps).toBeCloseTo(1.2);
  });

  it("rejects combining two incompatible teammate-aura strategies", () => {
    expect(() =>
      buildPvedpsRows(createMasterfile(), {
        megaTeammateBoost: true,
        teammateAuraTypeIds: [16]
      })
    ).toThrow("model different strategies");
  });

  it("restricts type-leader rankings to movesets with the requested Charged Attack type", () => {
    const masterfile = createMasterfile();
    const rows = buildPvedpsRows(masterfile, {
      mode: "party2",
      attackTypeId: 12
    });

    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => masterfile.moves[String(row.charged)]?.type === 12)).toBe(true);
    expect(rows.some((row) => row.pokemon === "Dragonite")).toBe(false);
  });

  it("models a single-weakness type benchmark without mixing in an explicit defender", () => {
    const masterfile = createMasterfile();
    const neutral = buildPvedpsRows(masterfile, {
      mode: "raid",
      attackTypeId: 16
    }).find((row) => row.pokemon === "Dragonite" && row.form === "")!;
    const benchmark = buildPvedpsRows(masterfile, {
      mode: "raid",
      attackTypeId: 16,
      benchmarkAttackTypeId: 16
    }).find((row) => row.pokemon === "Dragonite" && row.form === "")!;

    expect(benchmark.dps / neutral.dps).toBeCloseTo(1.6);
    expect(() =>
      buildPvedpsRows(masterfile, {
        attackTypeId: 16,
        benchmarkAttackTypeId: 16,
        type1: "Dragon"
      })
    ).toThrow("cannot be combined with explicit defender types");
  });

  it("does not mistake neutral Psychic fast-move damage for Fairy leadership", () => {
    const masterfile = createMasterfile();
    masterfile.types["14"] = type(14, "Psychic");
    masterfile.types["18"] = type(18, "Fairy");
    masterfile.moves["104"] = move(104, "Confusion", 14, 19, 1500, 14, true);
    masterfile.moves["105"] = move(105, "Charm", 18, 20, 1500, 11, true);
    masterfile.moves["206"] = move(206, "Dazzling Gleam", 18, 100, 3500, -50, false);

    const alakazam = pokemon("Alakazam", 65, [104], [206]);
    alakazam.types = { "14": { typeId: 14, typeName: "Psychic" } };
    alakazam.tempEvolutions = {
      "1": { tempEvoId: 1, stats: { attack: 367, defense: 207, stamina: 146 } }
    };
    masterfile.pokemon["65"] = alakazam;

    const gardevoir = pokemon("Gardevoir", 282, [104, 105], [206]);
    gardevoir.types = {
      "14": { typeId: 14, typeName: "Psychic" },
      "18": { typeId: 18, typeName: "Fairy" }
    };
    gardevoir.tempEvolutions = {
      "1": { tempEvoId: 1, stats: { attack: 326, defense: 229, stamina: 169 } }
    };
    masterfile.pokemon["282"] = gardevoir;

    const findMega = (rows: ReturnType<typeof buildPvedpsRows>, name: string) =>
      rows.find((row) => row.pokemon === name && row.form === "Mega")!;
    const neutralRows = buildPvedpsRows(masterfile, { mode: "gym", attackTypeId: 18 });
    const benchmarkRows = buildPvedpsRows(masterfile, {
      mode: "gym",
      attackTypeId: 18,
      benchmarkAttackTypeId: 18
    });

    expect(findMega(neutralRows, "Alakazam").dps).toBeGreaterThan(
      findMega(neutralRows, "Gardevoir").dps
    );
    expect(findMega(benchmarkRows, "Gardevoir").dps).toBeGreaterThan(
      findMega(benchmarkRows, "Alakazam").dps
    );
    expect(findMega(benchmarkRows, "Gardevoir").quick).toBe(105);
  });

  it("uses Primal weather and Mega Rayquaza coverage instead of only their own types", () => {
    const masterfile = createMasterfile();
    masterfile.types["2"] = type(2, "Flying");
    masterfile.types["7"] = type(7, "Bug");
    masterfile.types["10"] = type(10, "Water");
    masterfile.types["13"] = type(13, "Electric");
    masterfile.types["14"] = type(14, "Psychic");
    masterfile.moves["102"] = move(102, "Spark", 13, 6, 500, 8, true);
    masterfile.moves["103"] = move(103, "Confusion", 14, 6, 500, 8, true);
    masterfile.moves["204"] = move(204, "Thunder", 13, 100, 4000, -50, false);
    masterfile.moves["205"] = move(205, "Psychic", 14, 100, 4000, -50, false);
    const kyogre = pokemon("Kyogre", 382, [102], [204]);
    kyogre.types = { "10": { typeId: 10, typeName: "Water" } };
    kyogre.tempEvolutions = {
      "4": { tempEvoId: 4, stats: { attack: 353, defense: 268, stamina: 218 } }
    };
    masterfile.pokemon["382"] = kyogre;
    const unboosted = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Kyogre" && row.form === "Primal"
    );
    const boosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      megaTeammateBoost: true
    }).find((row) => row.pokemon === "Kyogre" && row.form === "Primal");

    expect(boosted!.dps / unboosted!.dps).toBeCloseTo(1.3);

    const rayquaza = pokemon("Rayquaza", 384, [103], [205]);
    rayquaza.types = {
      "2": { typeId: 2, typeName: "Flying" },
      "16": { typeId: 16, typeName: "Dragon" }
    };
    rayquaza.tempEvolutions = {
      "1": { tempEvoId: 1, stats: { attack: 377, defense: 210, stamina: 227 } }
    };
    masterfile.pokemon["384"] = rayquaza;
    const rayquazaUnboosted = buildPvedpsRows(masterfile, { mode: "party2" }).find(
      (row) => row.pokemon === "Rayquaza" && row.form === "Mega"
    );
    const rayquazaBoosted = buildPvedpsRows(masterfile, {
      mode: "party2",
      megaTeammateBoost: true
    }).find((row) => row.pokemon === "Rayquaza" && row.form === "Mega");

    expect(rayquazaBoosted!.dps / rayquazaUnboosted!.dps).toBeCloseTo(1.3);
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
