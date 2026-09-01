/**
 * Evidence-only Mega tier-list audit.
 *
 * The audit answers two Party-of-2 questions without awarding utility merely for
 * occupying a Mega slot:
 *   1. Which mutually boosted Mega/Primal beats every background-booster strategy?
 *   2. Which does so after excluding choices that do not boost encounter candy?
 *
 * Each active Mega is modeled alongside the same Mega on the other Trainer. The
 * competing strategy gives each Trainer a top non-Mega attacker plus a backline
 * Primal Kyogre, Primal Groudon, or Mega Rayquaza. Every move receives 1.3x when
 * its type is covered by the relevant aura, or 1.1x otherwise, and each strategy's
 * best moveset is selected after those multipliers apply.
 *
 * The C and C- type floors are full-pool comparisons. Party of 2 ranks every
 * mutually boosted active Mega/Primal against every background-booster strategy;
 * Gym ranks every Mega, Primal, and non-Mega without a teammate aura.
 *
 * Usage:
 *   npm run audit:megatier
 *   npm run audit:megatier -- --pokemon "Mega Gengar"
 *   npm run audit:megatier -- --format json --masterfile /path/to/masterfile.json
 *   npm run audit:megatier -- --list-bosses
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { applyMasterfilePatches } from "../src/lib/pogo/masterfile";
import type {
  Masterfile,
  MasterfilePokemon,
  MasterfileTempEvolution,
  MasterfileTypeRef
} from "../src/lib/pogo/masterfile";
import {
  buildPvedpsRows,
  calculateMegaTeammateMoveMultiplier,
  listMegaAuraTypeIds,
  type PvedpsRow
} from "../src/lib/pogo/pvedps";

type OutputFormat = "markdown" | "tsv" | "json";
type BossCategory = "legendary" | "mythical" | "ultra-beast" | "mega";
type BossSource =
  | "road-of-legends"
  | "mega-finale"
  | "elite-raid"
  | "game-master-profile"
  | "game-master-legendary-mega"
  | "editorial-typed-form";
type BossAvailability = "released-or-announced" | "unreleased" | "foreseeable-assumption";

interface CliOptions {
  masterfilePath: string;
  format: OutputFormat;
  pokemon: string[];
  projections: boolean;
  listBosses: boolean;
}

interface BossProfile {
  label: string;
  pokemonId: number;
  defenseTypes: string[];
  catchTypes: string[];
  category: BossCategory;
  source: BossSource;
  availability: BossAvailability;
}

interface MegaResult {
  name: string;
  pokemonId: number;
  auraTypes: string[];
  auraTypeIds: number[];
  unboostedDps: number;
  boostedDps: number;
  row: PvedpsRow;
}

interface MegaIdentity {
  name: string;
  pokemonId: number;
  auraTypes: string[];
  auraTypeIds: number[];
}

interface BackgroundBooster {
  name: "Primal Kyogre" | "Primal Groudon" | "Mega Rayquaza";
  auraTypes: string[];
  auraTypeIds: number[];
}

interface BackgroundResult {
  booster: BackgroundBooster;
  row: PvedpsRow;
  quickAuraMultiplier: number;
  chargedAuraMultiplier: number;
}

interface AuditMatchup {
  boss: BossProfile;
  outright: boolean;
  candyAligned: boolean;
  candidate: MegaResult;
  outrightLeader: MegaResult;
  candyLeader?: MegaResult;
  unboostedLeader: PvedpsRow;
  backgroundLeader: BackgroundResult;
  quickEffectiveness: number;
  chargedEffectiveness: number;
  quickAuraMultiplier: number;
  chargedAuraMultiplier: number;
}

type MechanicalTier = "S" | "A" | "B" | "C+" | "C" | "C-" | "D+" | "D" | "E" | "F";

interface TierAssignment {
  tier: MechanicalTier;
  party2TypeLeads: string[];
  gymTypeLeads: string[];
  coveringMegas: string[];
}

interface MechanicalTierAudit {
  assignments: Map<string, TierAssignment>;
  party2TypeLeaders: Map<string, string[]>;
  gymTypeLeaders: Map<string, string[]>;
  party2TypeComparisons: TypeLeaderComparison[];
  gymTypeComparisons: TypeLeaderComparison[];
}

interface TypeLeaderComparison {
  type: string;
  winningStrategies: string[];
  megaLeaders: string[];
  leaderDps: number;
  runnerUpStrategies: string[];
  runnerUpDps?: number;
}

interface TypeLeaderAudit {
  leaders: Map<string, string[]>;
  comparisons: TypeLeaderComparison[];
}

interface ProjectionResult {
  pokemon: string;
  move: string;
  applied: boolean;
}

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));
const DEFAULT_MASTERFILE = path.resolve(
  REPO_ROOT,
  "../Masterfile-Generator/master-latest-rotomata.json"
);

const TEMP_EVOLUTION_NAMES: Record<number, string> = {
  1: "Mega",
  2: "Mega X",
  3: "Mega Y",
  4: "Primal",
  5: "Mega Z"
};

const SOURCE_URLS: Record<BossSource, string | null> = {
  "road-of-legends": "https://pokemongo.com/news/road-of-legends-2026?hl=en",
  "mega-finale": "https://pokemongo.com/gofest/megafinale",
  "elite-raid": "https://pokemongo.com/post/elite-raids-new-feature?hl=en",
  "game-master-profile": null,
  "game-master-legendary-mega": null,
  "editorial-typed-form": null
};

const BACKGROUND_BOOSTER_TYPES = [
  { name: "Primal Kyogre", auraTypes: ["Water", "Electric", "Bug"] },
  { name: "Primal Groudon", auraTypes: ["Ground", "Fire", "Grass"] },
  { name: "Mega Rayquaza", auraTypes: ["Flying", "Dragon", "Psychic"] }
] as const;

const S_TIER = new Set(["Primal Kyogre", "Primal Groudon", "Mega Rayquaza"]);

const ALL_TYPES = [
  "Normal",
  "Fighting",
  "Flying",
  "Poison",
  "Ground",
  "Rock",
  "Bug",
  "Ghost",
  "Steel",
  "Fire",
  "Water",
  "Grass",
  "Electric",
  "Psychic",
  "Ice",
  "Dragon",
  "Dark",
  "Fairy"
] as const;

const ROAD_OF_LEGENDS_BOSSES = new Set([
  "Articuno",
  "Zapdos",
  "Moltres",
  "Raikou",
  "Entei",
  "Suicune",
  "Lugia",
  "Ho Oh",
  "Regirock",
  "Regice",
  "Registeel",
  "Latias",
  "Latios",
  "Kyogre",
  "Groudon",
  "Rayquaza",
  "Deoxys",
  "Deoxys (Attack)",
  "Deoxys (Defense)",
  "Deoxys (Speed)",
  "Uxie",
  "Mesprit",
  "Azelf",
  "Dialga",
  "Dialga (Origin)",
  "Palkia",
  "Palkia (Origin)",
  "Heatran",
  "Regigigas",
  "Giratina (Altered)",
  "Giratina (Origin)",
  "Cresselia",
  "Darkrai",
  "Cobalion",
  "Terrakion",
  "Virizion",
  "Tornadus (Incarnate)",
  "Tornadus (Therian)",
  "Thundurus (Incarnate)",
  "Thundurus (Therian)",
  "Reshiram",
  "Zekrom",
  "Landorus (Incarnate)",
  "Landorus (Therian)",
  "Kyurem",
  "Kyurem (Black)",
  "Kyurem (White)",
  "Genesect",
  "Genesect (Burn)",
  "Genesect (Chill)",
  "Genesect (Douse)",
  "Genesect (Shock)",
  "Xerneas",
  "Yveltal",
  "Tapu Koko",
  "Tapu Lele",
  "Tapu Bulu",
  "Tapu Fini",
  "Solgaleo",
  "Lunala",
  "Nihilego",
  "Buzzwole",
  "Pheromosa",
  "Xurkitree",
  "Celesteela",
  "Kartana",
  "Guzzlord",
  "Necrozma",
  "Necrozma (Dusk Mane)",
  "Necrozma (Dawn Wings)",
  "Stakataka",
  "Blacephalon",
  "Zacian (Hero)",
  "Zacian (Crowned Sword)",
  "Zamazenta (Hero)",
  "Zamazenta (Crowned Shield)",
  "Regieleki",
  "Regidrago",
  "Enamorus (Incarnate)",
  "Enamorus (Therian)"
]);

const BASE_ENCOUNTER_FORMS: Record<string, string> = {
  "Kyurem (Black)": "Normal",
  "Kyurem (White)": "Normal",
  "Necrozma (Dusk Mane)": "Normal",
  "Necrozma (Dawn Wings)": "Normal",
  "Zacian (Crowned Sword)": "Hero",
  "Zamazenta (Crowned Shield)": "Hero"
};

// These base records are the named form's fallback data, not an additional boss.
const BASE_FORM_ALIASES: Record<string, string> = {
  Giratina: "Altered",
  Tornadus: "Incarnate",
  Thundurus: "Incarnate",
  Landorus: "Incarnate",
  Zacian: "Crowned Sword",
  Zamazenta: "Crowned Shield",
  Enamorus: "Incarnate"
};

// The base Urshifu template is pure Fighting, but every actual Urshifu is one of
// the two typed styles represented by its form records.
const OMIT_BASE_BOSS_PROFILES = new Set(["Urshifu"]);

const BOSS_NAME_OVERRIDES: Record<string, string> = {
  "Ho Oh": "Ho-Oh",
  "Type Null": "Type: Null",
  Wochien: "Wo-Chien",
  Chienpao: "Chien-Pao",
  Tinglu: "Ting-Lu",
  Chiyu: "Chi-Yu",
  Walkingwake: "Walking Wake",
  Ironleaves: "Iron Leaves",
  Gougingfire: "Gouging Fire",
  Ragingbolt: "Raging Bolt",
  Ironboulder: "Iron Boulder",
  Ironcrown: "Iron Crown"
};

function displayBossLabel(label: string): string {
  for (const [name, display] of Object.entries(BOSS_NAME_OVERRIDES)) {
    if (label === name || label.startsWith(`${name} (`)) {
      return display + label.slice(name.length);
    }
  }
  return label;
}

function usage(): never {
  console.log(`Usage: npm run audit:megatier -- [options] [masterfile]

Options:
  --masterfile PATH       Rotomata masterfile (default: neighboring generator output)
  --format FORMAT         markdown, tsv, or json (default: markdown)
  --pokemon NAME          Limit output to one Mega/Primal; may be repeated
  --no-projections        Do not project announced Fell Stinger+ and Dark Pulse+
  --list-bosses           Print the complete modeled boss pool and exit
  --help                  Show this help`);
  process.exit(0);
}

function parseArgs(args: string[]): CliOptions {
  const result: CliOptions = {
    masterfilePath: DEFAULT_MASTERFILE,
    format: "markdown",
    pokemon: [],
    projections: true,
    listBosses: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") usage();
    if (argument === "--no-projections") {
      result.projections = false;
      continue;
    }
    if (argument === "--list-bosses") {
      result.listBosses = true;
      continue;
    }
    if (argument === "--masterfile" || argument === "--format" || argument === "--pokemon") {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--masterfile") result.masterfilePath = path.resolve(value);
      if (argument === "--pokemon") result.pokemon.push(value);
      if (argument === "--format") {
        if (!(["markdown", "tsv", "json"] as string[]).includes(value)) {
          throw new Error(`Unsupported format: ${value}`);
        }
        result.format = value as OutputFormat;
      }
      continue;
    }
    if (argument.startsWith("--")) throw new Error(`Unknown option: ${argument}`);
    result.masterfilePath = path.resolve(argument);
  }
  return result;
}

function resolveTypeIds(
  carrier: { types?: Record<string, MasterfileTypeRef> },
  fallback?: MasterfilePokemon
): number[] {
  return Object.values(carrier.types ?? fallback?.types ?? {}).map((type) => type.typeId);
}

function typeNames(masterfile: Masterfile, typeIds: number[]): string[] {
  return typeIds.map((id) => masterfile.types[String(id)]?.typeName ?? `Type ${id}`);
}

function displayMega(pokemon: string, form: string): string {
  if (form === "Primal") return `Primal ${pokemon}`;
  if (form === "Mega") return `Mega ${pokemon}`;
  if (form.startsWith("Mega ")) return `Mega ${pokemon} ${form.slice(5)}`;
  throw new Error(`Not a temporary evolution: ${pokemon} ${form}`);
}

function addProjectedMove(
  masterfile: Masterfile,
  pokemonId: number,
  syntheticMoveId: number,
  ordinaryMoveId: number,
  name: string,
  power: number
): ProjectionResult {
  const pokemon = masterfile.pokemon[String(pokemonId)];
  const ordinary = masterfile.moves[String(ordinaryMoveId)];
  const mega = Object.values(pokemon?.tempEvolutions ?? {}).find(
    (entry) => Number(entry.tempEvoId) === 1
  );
  if (!pokemon || !ordinary || !mega) throw new Error(`Cannot project ${name}`);
  if (mega.specialMove !== undefined) {
    return { pokemon: `Mega ${pokemon.name}`, move: name, applied: false };
  }
  masterfile.moves[String(syntheticMoveId)] = {
    ...ordinary,
    id: syntheticMoveId,
    name,
    proto: `PROJECTED_${name.toUpperCase().replaceAll(" ", "_")}`,
    power,
    energyDelta: -100
  };
  mega.specialMove = syntheticMoveId;
  return { pokemon: `Mega ${pokemon.name}`, move: name, applied: true };
}

function applyAnnouncedProjections(masterfile: Masterfile): ProjectionResult[] {
  return [
    addProjectedMove(masterfile, 15, 10_001, 311, "Fell Stinger+", 140),
    addProjectedMove(masterfile, 229, 10_002, 16, "Dark Pulse+", 150)
  ];
}

function classifyBossSource(label: string): BossSource | null {
  if (ROAD_OF_LEGENDS_BOSSES.has(label)) return "road-of-legends";
  if (label === "Mewtwo" || label === "Mewtwo (A)") return "mega-finale";
  if (label === "Hoopa (Unbound)") return "elite-raid";
  if (
    label === "Arceus" ||
    label.startsWith("Arceus (") ||
    label === "Silvally" ||
    label.startsWith("Silvally (")
  ) {
    return "editorial-typed-form";
  }
  return null;
}

function bossAvailability(source: BossSource): BossAvailability {
  return source === "game-master-profile" || source === "editorial-typed-form"
    ? "foreseeable-assumption"
    : "released-or-announced";
}

function sameTypes(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((type, index) => type === right[index]);
}

function buildBossProfiles(masterfile: Masterfile): BossProfile[] {
  const bosses: BossProfile[] = [];
  for (const pokemon of Object.values(masterfile.pokemon)) {
    if (pokemon.legendary || pokemon.mythic || pokemon.ultraBeast) {
      const category: BossCategory = pokemon.ultraBeast
        ? "ultra-beast"
        : pokemon.mythic
          ? "mythical"
          : "legendary";
      const baseTypes = typeNames(masterfile, resolveTypeIds(pokemon));
      const baseFormAlias = BASE_FORM_ALIASES[pokemon.name];
      const baseLabel = baseFormAlias ? `${pokemon.name} (${baseFormAlias})` : pokemon.name;
      if (!OMIT_BASE_BOSS_PROFILES.has(pokemon.name)) {
        const baseSource = classifyBossSource(baseLabel) ?? "game-master-profile";
        const encounterFormName = BASE_ENCOUNTER_FORMS[baseLabel];
        const encounterForm = encounterFormName
          ? Object.values(pokemon.forms ?? {}).find((entry) => entry.name === encounterFormName)
          : undefined;
        bosses.push({
          label: displayBossLabel(baseLabel),
          pokemonId: pokemon.pokedexId,
          defenseTypes: baseTypes,
          catchTypes: typeNames(masterfile, resolveTypeIds(encounterForm ?? pokemon, pokemon)),
          category,
          source: baseSource,
          availability: bossAvailability(baseSource)
        });
      }
      for (const form of Object.values(pokemon.forms ?? {})) {
        if (
          !form.name ||
          form.name === "Normal" ||
          form.name === baseFormAlias ||
          form.isCostume
        ) {
          continue;
        }
        const label = `${pokemon.name} (${form.name})`;
        const defenseTypes = typeNames(masterfile, resolveTypeIds(form, pokemon));
        const classifiedSource = classifyBossSource(label);
        if (!classifiedSource && sameTypes(defenseTypes, baseTypes)) continue;
        const source = classifiedSource ?? "game-master-profile";
        const encounterFormName = BASE_ENCOUNTER_FORMS[label];
        const encounterForm = encounterFormName
          ? Object.values(pokemon.forms ?? {}).find((entry) => entry.name === encounterFormName)
          : form;
        bosses.push({
          label: displayBossLabel(label),
          pokemonId: pokemon.pokedexId,
          defenseTypes,
          catchTypes: typeNames(masterfile, resolveTypeIds(encounterForm ?? pokemon, pokemon)),
          category,
          source,
          availability: bossAvailability(source)
        });
      }
    }
    if (pokemon.legendary || pokemon.mythic) {
      const baseCatchTypes = typeNames(masterfile, resolveTypeIds(pokemon));
      for (const branch of Object.values(pokemon.tempEvolutions ?? {})) {
        const form = TEMP_EVOLUTION_NAMES[Number(branch.tempEvoId)];
        if (!form) continue;
        bosses.push({
          label: displayMega(pokemon.name, form),
          pokemonId: pokemon.pokedexId,
          defenseTypes: typeNames(masterfile, resolveTypeIds(branch, pokemon)),
          catchTypes: baseCatchTypes,
          category: "mega",
          source: "game-master-legendary-mega",
          availability: branch.unreleased ? "unreleased" : "released-or-announced"
        });
      }
    }
  }
  return Array.from(
    new Map(
      bosses.map((boss) => [
        `${boss.label}|${boss.defenseTypes.join("/")}|${boss.catchTypes.join("/")}`,
        boss
      ])
    ).values()
  );
}

function assertCompleteTypedForms(bosses: BossProfile[]): void {
  for (const species of ["Arceus", "Silvally"]) {
    const profiles = bosses.filter(
      (boss) =>
        boss.source === "editorial-typed-form" &&
        (boss.label === species || boss.label.startsWith(`${species} (`))
    );
    const profileTypes = new Set(
      profiles.flatMap((profile) => (profile.defenseTypes.length === 1 ? profile.defenseTypes : []))
    );
    const missing = ALL_TYPES.filter((type) => !profileTypes.has(type));
    if (profiles.length !== ALL_TYPES.length || missing.length) {
      throw new Error(
        `${species} typed-form pool is incomplete: expected ${ALL_TYPES.length}, found ${profiles.length}; missing ${missing.join(", ") || "none"}`
      );
    }
  }
}

function resolveMoveTypeId(masterfile: Masterfile, moveId: number | undefined): number {
  if (moveId === undefined) return 0;
  const type = masterfile.moves[String(moveId)]?.type;
  return typeof type === "number" ? type : (type?.typeId ?? 0);
}

function effectiveness(masterfile: Masterfile, attackType: number, bossTypes: string[]): number {
  let result = 1;
  for (const bossTypeName of bossTypes) {
    const bossType = Object.values(masterfile.types).find(
      (entry) => entry.typeName === bossTypeName
    );
    if (!bossType) throw new Error(`Missing boss type ${bossTypeName}`);
    if (bossType.weaknesses?.some((entry) => entry.typeId === attackType)) result *= 1.6;
    if (bossType.resistances?.some((entry) => entry.typeId === attackType)) result *= 0.625;
    if (bossType.immunes?.some((entry) => entry.typeId === attackType)) result *= 0.390625;
  }
  return result;
}

function buildPokemonNameMap(masterfile: Masterfile): Map<string, MasterfilePokemon> {
  return new Map(Object.values(masterfile.pokemon).map((pokemon) => [pokemon.name, pokemon]));
}

function resolvePokemon(
  pokemonByName: Map<string, MasterfilePokemon>,
  row: PvedpsRow
): MasterfilePokemon {
  const pokemon = pokemonByName.get(row.pokemon);
  if (!pokemon) throw new Error(`Missing Pokemon ${row.pokemon}`);
  return pokemon;
}

function resolveMegaBranch(
  pokemonByName: Map<string, MasterfilePokemon>,
  row: PvedpsRow
): { pokemon: MasterfilePokemon; branch: MasterfileTempEvolution } {
  const pokemon = resolvePokemon(pokemonByName, row);
  const tempId = Object.entries(TEMP_EVOLUTION_NAMES).find(([, name]) => name === row.form)?.[0];
  const branch = Object.values(pokemon.tempEvolutions ?? {}).find(
    (entry) => Number(entry.tempEvoId) === Number(tempId)
  );
  if (!branch) throw new Error(`Missing branch ${row.pokemon} ${row.form}`);
  return { pokemon, branch };
}

function megaAuraTypeIds(
  masterfile: Masterfile,
  pokemonByName: Map<string, MasterfilePokemon>,
  row: PvedpsRow
): number[] {
  const { pokemon, branch } = resolveMegaBranch(pokemonByName, row);
  return listMegaAuraTypeIds(masterfile, row.pokemon, row.form, branch, pokemon);
}

function typeIdsByNames(masterfile: Masterfile, names: readonly string[]): number[] {
  return names.map((name) => {
    const type = Object.values(masterfile.types).find((entry) => entry.typeName === name);
    if (!type) throw new Error(`Missing type ${name}`);
    return type.typeId;
  });
}

function listBackgroundBoosters(masterfile: Masterfile): BackgroundBooster[] {
  return BACKGROUND_BOOSTER_TYPES.map((booster) => ({
    name: booster.name,
    auraTypes: [...booster.auraTypes],
    auraTypeIds: typeIdsByNames(masterfile, booster.auraTypes)
  }));
}

function listMegaIdentities(masterfile: Masterfile): MegaIdentity[] {
  const identities: MegaIdentity[] = [];
  for (const pokemon of Object.values(masterfile.pokemon)) {
    for (const branch of Object.values(pokemon.tempEvolutions ?? {})) {
      const form = TEMP_EVOLUTION_NAMES[Number(branch.tempEvoId)];
      if (!form) continue;
      const auraTypeIds = listMegaAuraTypeIds(masterfile, pokemon.name, form, branch, pokemon);
      identities.push({
        name: displayMega(pokemon.name, form),
        pokemonId: pokemon.pokedexId,
        auraTypes: typeNames(masterfile, auraTypeIds),
        auraTypeIds
      });
    }
  }
  return identities.sort(
    (left, right) => left.pokemonId - right.pokemonId || left.name.localeCompare(right.name)
  );
}

function buildAudit(masterfile: Masterfile, bosses: BossProfile[]): Map<string, AuditMatchup[]> {
  const pokemonByName = buildPokemonNameMap(masterfile);
  const tempForms = new Set(Object.values(TEMP_EVOLUTION_NAMES));
  const backgroundBoosters = listBackgroundBoosters(masterfile);
  const bossesByDefenseTypes = new Map<string, BossProfile[]>();
  for (const boss of bosses) {
    const key = boss.defenseTypes.join("/");
    bossesByDefenseTypes.set(key, [...(bossesByDefenseTypes.get(key) ?? []), boss]);
  }

  const audit = new Map<string, AuditMatchup[]>();
  for (const [typeKey, matchingBosses] of bossesByDefenseTypes) {
    const bossTypes = typeKey.split("/");
    const [type1 = "None", type2 = "None"] = bossTypes;
    const unboostedRows = buildPvedpsRows(masterfile, { mode: "party2", type1, type2 });
    const rows = buildPvedpsRows(masterfile, {
      mode: "party2",
      type1,
      type2,
      megaTeammateBoost: true
    });
    const unboostedLeader = unboostedRows.find((row) => !tempForms.has(row.form));
    if (!unboostedLeader) continue;
    const backgroundResults = backgroundBoosters
      .map((booster): BackgroundResult | null => {
        const boostedRows = buildPvedpsRows(masterfile, {
          mode: "party2",
          type1,
          type2,
          teammateAuraTypeIds: booster.auraTypeIds
        });
        const row = boostedRows.find((candidate) => !tempForms.has(candidate.form));
        if (!row) return null;
        const quickType = row.quickType ?? resolveMoveTypeId(masterfile, row.quick);
        const chargedType = resolveMoveTypeId(masterfile, row.charged);
        const auraTypeIds = new Set(booster.auraTypeIds);
        return {
          booster,
          row,
          quickAuraMultiplier: calculateMegaTeammateMoveMultiplier(quickType, auraTypeIds),
          chargedAuraMultiplier: calculateMegaTeammateMoveMultiplier(chargedType, auraTypeIds)
        };
      })
      .filter((result): result is BackgroundResult => result !== null)
      .sort((left, right) => right.row.dps - left.row.dps);
    const backgroundLeader = backgroundResults[0];
    if (!backgroundLeader) continue;

    const unboostedByMega = new Map<string, PvedpsRow>();
    for (const row of unboostedRows) {
      if (!tempForms.has(row.form)) continue;
      const name = displayMega(row.pokemon, row.form);
      const existing = unboostedByMega.get(name);
      if (!existing || row.dps > existing.dps) unboostedByMega.set(name, row);
    }

    const byMega = new Map<string, MegaResult>();
    for (const mega of rows) {
      if (!tempForms.has(mega.form)) continue;
      const name = displayMega(mega.pokemon, mega.form);
      const existing = byMega.get(name);
      if (existing && existing.boostedDps >= mega.dps) continue;
      const auraTypeIds = megaAuraTypeIds(masterfile, pokemonByName, mega);
      const pokemon = resolvePokemon(pokemonByName, mega);
      const unboosted = unboostedByMega.get(name);
      if (!unboosted) throw new Error(`Missing unboosted result for ${name}`);
      byMega.set(name, {
        name,
        pokemonId: pokemon.pokedexId,
        auraTypes: typeNames(masterfile, auraTypeIds),
        auraTypeIds,
        unboostedDps: unboosted.dps,
        boostedDps: mega.dps,
        row: mega
      });
    }

    const megaResults = Array.from(byMega.values()).sort(
      (left, right) => right.boostedDps - left.boostedDps
    );
    const outrightLeader = megaResults[0];
    if (!outrightLeader) continue;

    for (const boss of matchingBosses) {
      const candyLeader = megaResults.find((candidate) =>
        candidate.auraTypes.some((type) => boss.catchTypes.includes(type))
      );
      const candidates = new Map<
        string,
        { candidate: MegaResult; outright: boolean; candyAligned: boolean }
      >();
      if (outrightLeader.boostedDps > backgroundLeader.row.dps) {
        candidates.set(outrightLeader.name, {
          candidate: outrightLeader,
          outright: true,
          candyAligned: false
        });
      }
      if (candyLeader && candyLeader.boostedDps > backgroundLeader.row.dps) {
        const existing = candidates.get(candyLeader.name);
        candidates.set(candyLeader.name, {
          candidate: candyLeader,
          outright: existing?.outright ?? false,
          candyAligned: true
        });
      }
      for (const entry of candidates.values()) {
        const candidate = entry.candidate;
        const existing = audit.get(candidate.name) ?? [];
        const quickType =
          candidate.row.quickType ?? resolveMoveTypeId(masterfile, candidate.row.quick);
        const chargedType = resolveMoveTypeId(masterfile, candidate.row.charged);
        const auraTypes = new Set(candidate.auraTypeIds);
        existing.push({
          boss,
          outright: entry.outright,
          candyAligned: entry.candyAligned,
          candidate,
          outrightLeader,
          candyLeader,
          unboostedLeader,
          backgroundLeader,
          quickEffectiveness: effectiveness(masterfile, quickType, boss.defenseTypes),
          chargedEffectiveness: effectiveness(masterfile, chargedType, boss.defenseTypes),
          quickAuraMultiplier: calculateMegaTeammateMoveMultiplier(quickType, auraTypes),
          chargedAuraMultiplier: calculateMegaTeammateMoveMultiplier(chargedType, auraTypes)
        });
        audit.set(candidate.name, existing);
      }
    }
  }
  return audit;
}

function buildTypeLeaderAudit(
  masterfile: Masterfile,
  mode: "party2" | "gym"
): TypeLeaderAudit {
  const leaders = new Map<string, string[]>();
  const comparisons: TypeLeaderComparison[] = [];
  const tempForms = new Set(Object.values(TEMP_EVOLUTION_NAMES));
  const backgroundBoosters = mode === "party2" ? listBackgroundBoosters(masterfile) : [];
  const identities = new Map(
    listMegaIdentities(masterfile).map((identity) => [identity.name, identity])
  );
  for (const type of Object.values(masterfile.types).sort(
    (left, right) => left.typeId - right.typeId
  )) {
    if (type.typeName === "None" || (mode === "gym" && type.typeName === "Normal")) continue;
    const rows = buildPvedpsRows(masterfile, {
      mode,
      attackTypeId: type.typeId,
      megaTeammateBoost: mode === "party2"
    });
    const strategies = new Map<string, PvedpsRow>();
    const addStrategy = (name: string, row: PvedpsRow): void => {
      const existing = strategies.get(name);
      if (!existing || row.dps > existing.dps) strategies.set(name, row);
    };
    if (mode === "party2") {
      for (const row of rows) {
        if (tempForms.has(row.form)) addStrategy(displayMega(row.pokemon, row.form), row);
      }
      for (const booster of backgroundBoosters) {
        const background = buildPvedpsRows(masterfile, {
          mode,
          attackTypeId: type.typeId,
          teammateAuraTypeIds: booster.auraTypeIds
        }).find((row) => !tempForms.has(row.form));
        if (background) {
          addStrategy(
            `${formatAttacker(background)} + ${booster.name} backline`,
            background
          );
        }
      }
    } else {
      for (const row of rows) {
        addStrategy(
          tempForms.has(row.form) ? displayMega(row.pokemon, row.form) : formatAttacker(row),
          row
        );
      }
    }
    const rankedStrategies = Array.from(strategies.entries()).sort(
      ([leftName, left], [rightName, right]) =>
        right.dps - left.dps || leftName.localeCompare(rightName)
    );
    const leaderDps = rankedStrategies[0]?.[1].dps;
    if (leaderDps === undefined) continue;
    const winningStrategies = rankedStrategies
      .filter(([, row]) => Math.abs(row.dps - leaderDps) < 1e-9)
      .map(([name]) => name);
    const megaLeaders = winningStrategies.filter((name) =>
      identities.get(name)?.auraTypeIds.includes(type.typeId)
    );
    const runnerUpDps = rankedStrategies.find(([, row]) => row.dps < leaderDps - 1e-9)?.[1].dps;
    const runnerUpStrategies =
      runnerUpDps === undefined
        ? []
        : rankedStrategies
            .filter(([, row]) => Math.abs(row.dps - runnerUpDps) < 1e-9)
            .map(([name]) => name);
    comparisons.push({
      type: type.typeName,
      winningStrategies,
      megaLeaders,
      leaderDps,
      runnerUpStrategies,
      runnerUpDps
    });
    if (megaLeaders.length) leaders.set(type.typeName, megaLeaders);
  }
  return { leaders, comparisons };
}

function leaderTypesByMega(leaders: Map<string, string[]>): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const [type, names] of leaders) {
    for (const name of names) {
      result.set(name, [...(result.get(name) ?? []), type]);
    }
  }
  return result;
}

function auraContains(covering: MegaIdentity, covered: MegaIdentity): boolean {
  const coveringTypes = new Set(covering.auraTypeIds);
  return covered.auraTypeIds.every((type) => coveringTypes.has(type));
}

function sameAura(left: MegaIdentity, right: MegaIdentity): boolean {
  return left.auraTypeIds.length === right.auraTypeIds.length && auraContains(left, right);
}

function buildMechanicalTiers(
  masterfile: Masterfile,
  audit: Map<string, AuditMatchup[]>
): MechanicalTierAudit {
  const identities = listMegaIdentities(masterfile);
  const party2TypeAudit = buildTypeLeaderAudit(masterfile, "party2");
  const gymTypeAudit = buildTypeLeaderAudit(masterfile, "gym");
  const party2TypeLeaders = party2TypeAudit.leaders;
  const gymTypeLeaders = gymTypeAudit.leaders;
  const party2TypesByMega = leaderTypesByMega(party2TypeLeaders);
  const gymTypesByMega = leaderTypesByMega(gymTypeLeaders);
  const assignments = new Map<string, TierAssignment>();

  for (const identity of identities) {
    const matchups = audit.get(identity.name) ?? [];
    let tier: MechanicalTier | undefined;
    if (S_TIER.has(identity.name)) tier = "S";
    else if (matchups.some((matchup) => matchup.outright && matchup.candyAligned)) tier = "A";
    else if (matchups.some((matchup) => matchup.candyAligned)) tier = "B";
    else if (matchups.some((matchup) => matchup.outright)) tier = "C+";
    else if (party2TypesByMega.has(identity.name)) tier = "C";
    else if (gymTypesByMega.has(identity.name)) tier = "C-";
    if (!tier) continue;
    assignments.set(identity.name, {
      tier,
      party2TypeLeads: party2TypesByMega.get(identity.name) ?? [],
      gymTypeLeads: gymTypesByMega.get(identity.name) ?? [],
      coveringMegas: []
    });
  }

  const higherTierNames = new Set(assignments.keys());
  for (const identity of identities) {
    if (assignments.has(identity.name)) continue;
    const coveringMegas = identities.filter(
      (candidate) => candidate.name !== identity.name && auraContains(candidate, identity)
    );
    const exactDuplicates = coveringMegas.filter((candidate) => sameAura(candidate, identity));
    const strictSupersets = coveringMegas.filter((candidate) => !sameAura(candidate, identity));
    let tier: MechanicalTier;
    if (identity.auraTypeIds.length < 2) {
      tier = "F";
    } else if (exactDuplicates.length) {
      tier = exactDuplicates.some((candidate) => higherTierNames.has(candidate.name)) ? "E" : "D";
    } else if (strictSupersets.some((candidate) => higherTierNames.has(candidate.name))) {
      tier = "F";
    } else {
      tier = "D+";
    }
    assignments.set(identity.name, {
      tier,
      party2TypeLeads: [],
      gymTypeLeads: [],
      coveringMegas: coveringMegas.map((candidate) => candidate.name)
    });
  }

  return {
    assignments,
    party2TypeLeaders,
    gymTypeLeaders,
    party2TypeComparisons: party2TypeAudit.comparisons,
    gymTypeComparisons: gymTypeAudit.comparisons
  };
}

function formatAttacker(row: PvedpsRow): string {
  return [row.pokemon, row.form, row.alignment].filter(Boolean).join(" ");
}

function moveName(masterfile: Masterfile, moveId: number | undefined): string {
  return moveId === undefined ? "-" : (masterfile.moves[String(moveId)]?.name ?? `Move ${moveId}`);
}

function status(matchup: AuditMatchup): string {
  if (matchup.outright && matchup.candyAligned) return "Duo leader + catch-aligned";
  if (matchup.outright) return "Duo leader";
  return "Catch-aligned duo leader";
}

function sortedMatchups(matchups: AuditMatchup[]): AuditMatchup[] {
  return matchups.slice().sort(
    (left, right) =>
      left.boss.pokemonId - right.boss.pokemonId ||
      left.boss.label.localeCompare(right.boss.label)
  );
}

function selectedNames(audit: Map<string, AuditMatchup[]>, filters: string[]): string[] {
  if (filters.length) return filters;
  return Array.from(audit.entries())
    .sort(([, left], [, right]) => {
      const leftId = left[0]?.candidate.pokemonId ?? Number.MAX_SAFE_INTEGER;
      const rightId = right[0]?.candidate.pokemonId ?? Number.MAX_SAFE_INTEGER;
      return leftId - rightId || (left[0]?.candidate.name ?? "").localeCompare(right[0]?.candidate.name ?? "");
    })
    .map(([name]) => name);
}

const TIER_ORDER: MechanicalTier[] = ["S", "A", "B", "C+", "C", "C-", "D+", "D", "E", "F"];

function tierNames(
  masterfile: Masterfile,
  tierAudit: MechanicalTierAudit,
  tier: MechanicalTier
): string[] {
  return listMegaIdentities(masterfile)
    .filter((identity) => tierAudit.assignments.get(identity.name)?.tier === tier)
    .map((identity) => identity.name);
}

function outputMarkdown(
  masterfile: Masterfile,
  options: CliOptions,
  projections: ProjectionResult[],
  bosses: BossProfile[],
  audit: Map<string, AuditMatchup[]>,
  tierAudit: MechanicalTierAudit
): void {
  console.log("# Mega tier-list evidence audit\n");
  console.log(`- Masterfile: \`${options.masterfilePath}\``);
  console.log("- Mode: Party of 2; ordinary attackers level 50; Mega/Primal attackers level 52");
  console.log(`- Boss profiles: ${bosses.length}`);
  console.log(
    "- Target pool: every Legendary, Mythical, and Ultra Beast base profile in the Game Master, plus distinct typed forms"
  );
  console.log("- Typed-form assertion: all 18 Arceus forms and all 18 Silvally forms");
  console.log(
    "- Temporary-evolution targets: only branches whose base species is Legendary or Mythical"
  );
  console.log(
    `- Announced projections: ${projections.filter((entry) => entry.applied).map((entry) => `${entry.pokemon} ${entry.move}`).join(", ") || "none"}`
  );
  console.log(
    "- Active-Mega strategy: both Trainers use the candidate; each move receives 1.3x when covered by the other candidate's aura, otherwise 1.1x"
  );
  console.log(
    "- Background strategy: both Trainers lead the best repeatable non-Mega while carrying Primal Kyogre, Primal Groudon, or Mega Rayquaza in back; movesets are reselected for each exact aura"
  );
  console.log(
    "- Qualification: the mutually boosted Mega/Primal must beat the best of those three background strategies; catch-aligned also requires its aura to cover the encounter type"
  );
  console.log(
    "- Type floors: Party of 2 compares every active Mega/Primal with every background-supported non-Mega; Gym compares every attacker"
  );

  console.log("\n## Mechanical tier result\n");
  console.log("| Tier | Pokemon |");
  console.log("| --- | --- |");
  for (const tier of TIER_ORDER) {
    console.log(`| ${tier} | ${tierNames(masterfile, tierAudit, tier).join(", ")} |`);
  }

  console.log("\n## Full-pool type comparisons\n");
  console.log("| Mode | Attack type | Winning strategy | DPS | Next strategy | DPS | Margin |");
  console.log("| --- | --- | --- | ---: | --- | ---: | ---: |");
  for (const [mode, comparisons] of [
    ["Party of 2", tierAudit.party2TypeComparisons],
    ["Gym", tierAudit.gymTypeComparisons]
  ] as const) {
    for (const comparison of comparisons) {
      const margin = comparison.runnerUpDps
        ? `${((comparison.leaderDps / comparison.runnerUpDps - 1) * 100).toFixed(1)}%`
        : "-";
      console.log(
        `| ${mode} | ${comparison.type} | ${comparison.winningStrategies.join(", ")} | ${comparison.leaderDps.toFixed(1)} | ${comparison.runnerUpStrategies.join(", ") || "-"} | ${comparison.runnerUpDps?.toFixed(1) ?? "-"} | ${margin} |`
      );
    }
  }

  for (const name of selectedNames(audit, options.pokemon)) {
    const matchups = sortedMatchups(audit.get(name) ?? []);
    console.log(`\n## ${name}\n`);
    if (!matchups.length) {
      console.log("No qualifying duo-leader matchup in the modeled boss pool.");
      continue;
    }
    console.log(
      "| Status | Boss | Defense | Encounter | Aura | Mega moves (aura) | Mega DPS | Background strategy | Background DPS | Margin |"
    );
    console.log("| --- | --- | --- | --- | --- | --- | ---: | --- | ---: | ---: |");
    for (const matchup of matchups) {
      const candidate = matchup.candidate;
      const background = matchup.backgroundLeader;
      const margin = (candidate.boostedDps / background.row.dps - 1) * 100;
      console.log(
        `| ${status(matchup)} | ${matchup.boss.label} | ${matchup.boss.defenseTypes.join("/")} | ${matchup.boss.catchTypes.join("/")} | ${candidate.auraTypes.join("/")} | ${moveName(masterfile, candidate.row.quick)} (${matchup.quickAuraMultiplier.toFixed(1)}x) / ${moveName(masterfile, candidate.row.charged)} (${matchup.chargedAuraMultiplier.toFixed(1)}x) | ${candidate.boostedDps.toFixed(1)} | ${formatAttacker(background.row)} + ${background.booster.name}; ${moveName(masterfile, background.row.quick)} (${background.quickAuraMultiplier.toFixed(1)}x) / ${moveName(masterfile, background.row.charged)} (${background.chargedAuraMultiplier.toFixed(1)}x) | ${background.row.dps.toFixed(1)} | +${margin.toFixed(1)}% |`
      );
    }
  }
}

function outputTsv(
  masterfile: Masterfile,
  options: CliOptions,
  audit: Map<string, AuditMatchup[]>,
  tierAudit: MechanicalTierAudit
): void {
  console.log(
    [
      "candidate",
      "tier",
      "status",
      "boss",
      "defenseTypes",
      "catchTypes",
      "source",
      "quick",
      "charged",
      "quickEffectiveness",
      "chargedEffectiveness",
      "quickAuraMultiplier",
      "chargedAuraMultiplier",
      "unboostedMegaDps",
      "boostedMegaDps",
      "unboostedNonMegaDps",
      "backgroundBooster",
      "backgroundAttacker",
      "backgroundQuick",
      "backgroundCharged",
      "backgroundQuickAuraMultiplier",
      "backgroundChargedAuraMultiplier",
      "backgroundDps",
      "megaMarginPercent",
      "outrightMegaLeader",
      "candyMegaLeader",
      "unboostedNonMegaLeader"
    ].join("\t")
  );
  for (const name of selectedNames(audit, options.pokemon)) {
    for (const matchup of sortedMatchups(audit.get(name) ?? [])) {
      const candidate = matchup.candidate;
      const background = matchup.backgroundLeader;
      console.log(
        [
          name,
          tierAudit.assignments.get(name)?.tier ?? "-",
          status(matchup),
          matchup.boss.label,
          matchup.boss.defenseTypes.join("/"),
          matchup.boss.catchTypes.join("/"),
          matchup.boss.source,
          moveName(masterfile, candidate.row.quick),
          moveName(masterfile, candidate.row.charged),
          matchup.quickEffectiveness,
          matchup.chargedEffectiveness,
          matchup.quickAuraMultiplier,
          matchup.chargedAuraMultiplier,
          candidate.unboostedDps,
          candidate.boostedDps,
          matchup.unboostedLeader.dps,
          background.booster.name,
          formatAttacker(background.row),
          moveName(masterfile, background.row.quick),
          moveName(masterfile, background.row.charged),
          background.quickAuraMultiplier,
          background.chargedAuraMultiplier,
          background.row.dps,
          (candidate.boostedDps / background.row.dps - 1) * 100,
          matchup.outrightLeader.name,
          matchup.candyLeader?.name ?? "-",
          formatAttacker(matchup.unboostedLeader)
        ].join("\t")
      );
    }
  }
}

function outputJson(
  masterfile: Masterfile,
  options: CliOptions,
  projections: ProjectionResult[],
  bosses: BossProfile[],
  audit: Map<string, AuditMatchup[]>,
  tierAudit: MechanicalTierAudit
): void {
  const pokemon = Object.fromEntries(
    selectedNames(audit, options.pokemon).map((name) => [
      name,
      sortedMatchups(audit.get(name) ?? []).map((matchup) => {
        const candidate = matchup.candidate;
        const background = matchup.backgroundLeader;
        return {
          tier: tierAudit.assignments.get(name)?.tier ?? null,
          status: status(matchup),
          boss: matchup.boss,
          moves: {
            quick: moveName(masterfile, candidate.row.quick),
            charged: moveName(masterfile, candidate.row.charged)
          },
          effectiveness: {
            quick: matchup.quickEffectiveness,
            charged: matchup.chargedEffectiveness
          },
          aura: {
            types: candidate.auraTypes,
            quickMultiplier: matchup.quickAuraMultiplier,
            chargedMultiplier: matchup.chargedAuraMultiplier
          },
          dps: {
            unboostedMega: candidate.unboostedDps,
            boostedMega: candidate.boostedDps,
            unboostedNonMegaBaseline: matchup.unboostedLeader.dps,
            backgroundNonMegaBaseline: background.row.dps,
            megaMarginPercent:
              (candidate.boostedDps / background.row.dps - 1) * 100
          },
          backgroundStrategy: {
            booster: background.booster.name,
            auraTypes: background.booster.auraTypes,
            attacker: formatAttacker(background.row),
            moves: {
              quick: moveName(masterfile, background.row.quick),
              charged: moveName(masterfile, background.row.charged)
            },
            quickMultiplier: background.quickAuraMultiplier,
            chargedMultiplier: background.chargedAuraMultiplier
          },
          leaders: {
            outrightMega: matchup.outrightLeader.name,
            candyAlignedMega: matchup.candyLeader?.name ?? null,
            unboostedNonMega: formatAttacker(matchup.unboostedLeader)
          }
        };
      })
    ])
  );
  console.log(
    JSON.stringify(
      {
        metadata: {
          masterfile: options.masterfilePath,
          mode: "party2",
          normalLevel: 50,
          megaLevel: 52,
          comparison:
            "same-mega-mutual-aura-vs-best-background-primal-or-rayquaza-repeatable-non-mega",
          auraMultipliers: { matchingMoveType: 1.3, otherMoveType: 1.1 },
          bossCount: bosses.length,
          ordinaryTargetRule:
            "all-game-master-legendary-mythical-ultra-beast-base-profiles-plus-distinct-typed-forms",
          temporaryEvolutionTargetRule: "legendary-or-mythical-base-species-only",
          typedFormAssumption: {
            Arceus: ALL_TYPES,
            Silvally: ALL_TYPES
          },
          sources: SOURCE_URLS,
          projections
        },
        tiers: Object.fromEntries(
          listMegaIdentities(masterfile).map((identity) => [
            identity.name,
            {
              ...tierAudit.assignments.get(identity.name),
              auraTypes: identity.auraTypes
            }
          ])
        ),
        typeLeaders: {
          party2: Object.fromEntries(tierAudit.party2TypeLeaders),
          gym: Object.fromEntries(tierAudit.gymTypeLeaders)
        },
        typeComparisons: {
          party2: tierAudit.party2TypeComparisons,
          gym: tierAudit.gymTypeComparisons
        },
        pokemon
      },
      null,
      2
    )
  );
}

const options = parseArgs(process.argv.slice(2));
const masterfile = applyMasterfilePatches(
  JSON.parse(fs.readFileSync(options.masterfilePath, "utf8")) as Masterfile
);
const projections = options.projections ? applyAnnouncedProjections(masterfile) : [];
const bosses = buildBossProfiles(masterfile);
assertCompleteTypedForms(bosses);

if (options.listBosses) {
  console.log("boss\tdefenseTypes\tcatchTypes\tcategory\tsource\tavailability");
  for (const boss of bosses.sort(
    (left, right) => left.pokemonId - right.pokemonId || left.label.localeCompare(right.label)
  )) {
    console.log(
      [
        boss.label,
        boss.defenseTypes.join("/"),
        boss.catchTypes.join("/"),
        boss.category,
        boss.source,
        boss.availability
      ].join("\t")
    );
  }
} else {
  const audit = buildAudit(masterfile, bosses);
  const tierAudit = buildMechanicalTiers(masterfile, audit);
  if (options.format === "json") {
    outputJson(masterfile, options, projections, bosses, audit, tierAudit);
  }
  if (options.format === "tsv") outputTsv(masterfile, options, audit, tierAudit);
  if (options.format === "markdown") {
    outputMarkdown(masterfile, options, projections, bosses, audit, tierAudit);
  }
}
