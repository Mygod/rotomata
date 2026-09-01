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
 * The C and C- type floors are full-pool comparisons against a synthetic target
 * weak only to the audited Charged Attack type. Party of 2 ranks every mutually
 * boosted active Mega/Primal against every background-booster strategy; Gym ranks
 * every Mega, Primal, and non-Mega without a teammate aura.
 *
 * Usage:
 *   npm run audit:megatier
 *   npm run audit:megatier -- --pokemon "Mega Gengar"
 *   npm run audit:megatier -- --weather cloudy --pokemon "Mega Lucario Z"
 *   npm run audit:megatier -- --format json --masterfile /path/to/masterfile.json
 *   npm run audit:megatier -- --list-bosses
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
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
  calculateWeatherMoveMultiplier,
  isPvedpsWeather,
  listMegaAuraTypeIds,
  PVEDPS_WEATHER_OPTIONS,
  type PvedpsRow,
  type PvedpsWeather
} from "../src/lib/pogo/pvedps";
import {
  classifyMegaCombatTier,
  parseMegaWeatherTierSummary,
  type MegaCombatTier,
  type MegaWeatherCombatEvidence,
  type MegaWeatherTierAudit
} from "../src/lib/pogo/megatier";

type OutputFormat = "markdown" | "tsv" | "json" | "summary";
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
  weather: PvedpsWeather;
  summaryOutputPath?: string;
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
  quickWeatherMultiplier: number;
  chargedWeatherMultiplier: number;
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
  quickWeatherMultiplier: number;
  chargedWeatherMultiplier: number;
}

type MechanicalTier = "S" | MegaCombatTier | "C" | "C-" | "D+" | "D" | "E" | "F";

interface TierAssignment {
  tier: MechanicalTier;
  party2TypeLeads: string[];
  gymTypeLeads: string[];
  coveringMegas: string[];
  conditionalWeathers: PvedpsWeather[];
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
const SCRIPT_PATH = fileURLToPath(import.meta.url);
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
const CONDITIONAL_WEATHERS = PVEDPS_WEATHER_OPTIONS.filter(
  (option) => option.value !== "none"
).map((option) => option.value);
// Every worker ranks the full attacker pool repeatedly, so keep enough CPU and
// memory headroom for the parent process and other development tasks.
const MAX_WEATHER_WORKERS = 4;

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
  --format FORMAT         markdown, tsv, json, or summary (default: markdown)
  --pokemon NAME          Limit output to one Mega/Primal; may be repeated
  --weather WEATHER       none, clear, rain, partly-cloudy, cloudy, windy, snow, or fog
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
    listBosses: false,
    weather: "none"
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
    if (
      argument === "--masterfile" ||
      argument === "--format" ||
      argument === "--pokemon" ||
      argument === "--weather" ||
      argument === "--summary-output"
    ) {
      const value = args[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === "--masterfile") result.masterfilePath = path.resolve(value);
      if (argument === "--pokemon") result.pokemon.push(value);
      if (argument === "--summary-output") result.summaryOutputPath = path.resolve(value);
      if (argument === "--weather") {
        if (!isPvedpsWeather(value)) throw new Error(`Unsupported weather: ${value}`);
        result.weather = value;
      }
      if (argument === "--format") {
        if (!(["markdown", "tsv", "json", "summary"] as string[]).includes(value)) {
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

function buildAudit(
  masterfile: Masterfile,
  bosses: BossProfile[],
  weather: PvedpsWeather
): Map<string, AuditMatchup[]> {
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
    const unboostedRows = buildPvedpsRows(masterfile, {
      mode: "party2",
      type1,
      type2,
      weather
    });
    const rows = buildPvedpsRows(masterfile, {
      mode: "party2",
      type1,
      type2,
      weather,
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
          weather,
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
          chargedAuraMultiplier: calculateMegaTeammateMoveMultiplier(chargedType, auraTypeIds),
          quickWeatherMultiplier: calculateWeatherMoveMultiplier(quickType, weather),
          chargedWeatherMultiplier: calculateWeatherMoveMultiplier(chargedType, weather)
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
          chargedAuraMultiplier: calculateMegaTeammateMoveMultiplier(chargedType, auraTypes),
          quickWeatherMultiplier: calculateWeatherMoveMultiplier(quickType, weather),
          chargedWeatherMultiplier: calculateWeatherMoveMultiplier(chargedType, weather)
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
      benchmarkAttackTypeId: type.typeId,
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
          benchmarkAttackTypeId: type.typeId,
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
  audit: Map<string, AuditMatchup[]>,
  weatherAudits: ReadonlyMap<PvedpsWeather, MegaWeatherTierAudit>
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
    const weatherConditions = (
      predicate: (evidence: MegaWeatherCombatEvidence) => boolean
    ): PvedpsWeather[] =>
      CONDITIONAL_WEATHERS.filter((weather) => {
        const evidence = weatherAudits.get(weather)?.get(identity.name);
        return evidence !== undefined && predicate(evidence);
      });
    const combinedWeathers = weatherConditions((evidence) => evidence.outrightAndCatchAligned);
    const catchAlignedWeathers = weatherConditions((evidence) => evidence.catchAligned);
    const outrightWeathers = weatherConditions((evidence) => evidence.outright);
    const combatTier = classifyMegaCombatTier({
      baselineOutrightAndCatchAligned: matchups.some(
        (matchup) => matchup.outright && matchup.candyAligned
      ),
      weatherOutrightAndCatchAligned: combinedWeathers.length > 0,
      baselineCatchAligned: matchups.some((matchup) => matchup.candyAligned),
      weatherCatchAligned: catchAlignedWeathers.length > 0,
      baselineOutright: matchups.some((matchup) => matchup.outright),
      weatherOutright: outrightWeathers.length > 0
    });
    let tier: MechanicalTier | undefined;
    let conditionalWeathers: PvedpsWeather[] = [];
    if (S_TIER.has(identity.name)) tier = "S";
    else if (combatTier) {
      tier = combatTier;
      if (tier === "A-") conditionalWeathers = combinedWeathers;
      if (tier === "B") conditionalWeathers = catchAlignedWeathers;
      if (tier === "C+") conditionalWeathers = outrightWeathers;
    } else if (party2TypesByMega.has(identity.name)) tier = "C";
    else if (gymTypesByMega.has(identity.name)) tier = "C-";
    if (!tier) continue;
    assignments.set(identity.name, {
      tier,
      party2TypeLeads: party2TypesByMega.get(identity.name) ?? [],
      gymTypeLeads: gymTypesByMega.get(identity.name) ?? [],
      coveringMegas: [],
      conditionalWeathers
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
      coveringMegas: coveringMegas.map((candidate) => candidate.name),
      conditionalWeathers: []
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

function weatherOption(weather: PvedpsWeather) {
  const option = PVEDPS_WEATHER_OPTIONS.find((candidate) => candidate.value === weather);
  if (!option) throw new Error(`Missing weather definition: ${weather}`);
  return option;
}

function moveMultipliers(aura: number, weather: number): string {
  return `${aura.toFixed(1)}x aura, ${weather.toFixed(1)}x weather`;
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

const TIER_ORDER: MechanicalTier[] = [
  "S",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "E",
  "F"
];

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
  tierAudit?: MechanicalTierAudit
): void {
  const selectedWeather = weatherOption(options.weather);
  console.log("# Mega tier-list evidence audit\n");
  console.log(`- Masterfile: \`${options.masterfilePath}\``);
  console.log("- Mode: Party of 2; ordinary attackers level 50; Mega/Primal attackers level 52");
  console.log(
    `- Weather: ${selectedWeather.label}${selectedWeather.typeNames.length ? `; ${selectedWeather.typeNames.join("/")} moves receive 1.2x` : ""}`
  );
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
  if (tierAudit) {
    console.log(
      `- Conditional combat tiers: ${CONDITIONAL_WEATHERS.map((weather) => weatherOption(weather).label).join(", ")} are each audited independently after moveset reselection`
    );
  }
  console.log(
    "- Type floors: the audited type is 1.6x effective and every other attack type is neutral; Party of 2 compares every active Mega/Primal with every background-supported non-Mega; Gym compares every attacker"
  );

  if (tierAudit) {
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
  } else {
    console.log(
      "\nA single-weather run reports that condition's boss evidence only. Run with --weather none to generate the complete baseline-plus-weather tier assignment."
    );
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
        `| ${status(matchup)} | ${matchup.boss.label} | ${matchup.boss.defenseTypes.join("/")} | ${matchup.boss.catchTypes.join("/")} | ${candidate.auraTypes.join("/")} | ${moveName(masterfile, candidate.row.quick)} (${moveMultipliers(matchup.quickAuraMultiplier, matchup.quickWeatherMultiplier)}) / ${moveName(masterfile, candidate.row.charged)} (${moveMultipliers(matchup.chargedAuraMultiplier, matchup.chargedWeatherMultiplier)}) | ${candidate.boostedDps.toFixed(1)} | ${formatAttacker(background.row)} + ${background.booster.name}; ${moveName(masterfile, background.row.quick)} (${moveMultipliers(background.quickAuraMultiplier, background.quickWeatherMultiplier)}) / ${moveName(masterfile, background.row.charged)} (${moveMultipliers(background.chargedAuraMultiplier, background.chargedWeatherMultiplier)}) | ${background.row.dps.toFixed(1)} | +${margin.toFixed(1)}% |`
      );
    }
  }
}

function outputTsv(
  masterfile: Masterfile,
  options: CliOptions,
  audit: Map<string, AuditMatchup[]>,
  tierAudit?: MechanicalTierAudit
): void {
  console.log(
    [
      "candidate",
      "tier",
      "tierConditionalWeathers",
      "weather",
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
      "quickWeatherMultiplier",
      "chargedWeatherMultiplier",
      "unboostedMegaDps",
      "boostedMegaDps",
      "unboostedNonMegaDps",
      "backgroundBooster",
      "backgroundAttacker",
      "backgroundQuick",
      "backgroundCharged",
      "backgroundQuickAuraMultiplier",
      "backgroundChargedAuraMultiplier",
      "backgroundQuickWeatherMultiplier",
      "backgroundChargedWeatherMultiplier",
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
          tierAudit?.assignments.get(name)?.tier ?? "-",
          tierAudit?.assignments.get(name)?.conditionalWeathers.join(",") ?? "-",
          options.weather,
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
          matchup.quickWeatherMultiplier,
          matchup.chargedWeatherMultiplier,
          candidate.unboostedDps,
          candidate.boostedDps,
          matchup.unboostedLeader.dps,
          background.booster.name,
          formatAttacker(background.row),
          moveName(masterfile, background.row.quick),
          moveName(masterfile, background.row.charged),
          background.quickAuraMultiplier,
          background.chargedAuraMultiplier,
          background.quickWeatherMultiplier,
          background.chargedWeatherMultiplier,
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

function outputSummary(
  options: CliOptions,
  audit: Map<string, AuditMatchup[]>
): void {
  const lines = [
    "weather\tcandidate\tstatus\tbossCount\tbosses\tminMarginPercent\tmaxMarginPercent"
  ];
  for (const name of selectedNames(audit, options.pokemon)) {
    const byStatus = new Map<string, AuditMatchup[]>();
    for (const matchup of sortedMatchups(audit.get(name) ?? [])) {
      const label = status(matchup);
      byStatus.set(label, [...(byStatus.get(label) ?? []), matchup]);
    }
    for (const [label, matchups] of byStatus) {
      const margins = matchups.map(
        (matchup) =>
          (matchup.candidate.boostedDps / matchup.backgroundLeader.row.dps - 1) * 100
      );
      lines.push(
        [
          options.weather,
          name,
          label,
          matchups.length,
          matchups.map((matchup) => matchup.boss.label).join("; "),
          Math.min(...margins),
          Math.max(...margins)
        ].join("\t")
      );
    }
  }
  const output = `${lines.join("\n")}\n`;
  if (options.summaryOutputPath) fs.writeFileSync(options.summaryOutputPath, output);
  else process.stdout.write(output);
}

function runWeatherTierAudit(
  options: CliOptions,
  weather: PvedpsWeather,
  workerScript: string,
  summaryOutputPath: string
): Promise<MegaWeatherTierAudit> {
  const args = [
    workerScript,
    "--format",
    "summary",
    "--weather",
    weather,
    "--masterfile",
    options.masterfilePath,
    "--summary-output",
    summaryOutputPath
  ];
  if (!options.projections) args.push("--no-projections");
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      args,
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `${weatherOption(weather).label} audit failed: ${stderr.trim() || error.message}`,
              { cause: error }
            )
          );
          return;
        }
        try {
          resolve(
            parseMegaWeatherTierSummary(
              weather,
              fs.readFileSync(summaryOutputPath, "utf8")
            )
          );
        } catch (parseError) {
          reject(
            new Error(
              `${weatherOption(weather).label} audit returned invalid output${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
              { cause: parseError }
            )
          );
        }
      }
    );
  });
}

async function buildWeatherWorker(): Promise<{ directory: string; script: string }> {
  const directory = await fs.promises.mkdtemp(path.join(tmpdir(), "rotomata-megatier-"));
  const script = path.join(directory, "weather-worker.mjs");
  try {
    const { build } = await import("esbuild");
    await build({
      entryPoints: [SCRIPT_PATH],
      outfile: script,
      bundle: true,
      platform: "node",
      format: "esm",
      external: ["esbuild"],
      logLevel: "silent"
    });
    return { directory, script };
  } catch (error) {
    await fs.promises.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function buildConditionalWeatherAudits(
  options: CliOptions
): Promise<Map<PvedpsWeather, MegaWeatherTierAudit>> {
  const worker = await buildWeatherWorker();
  try {
    const unordered = new Map<PvedpsWeather, MegaWeatherTierAudit>();
    let nextWeather = 0;
    const workerCount = Math.min(
      MAX_WEATHER_WORKERS,
      availableParallelism(),
      CONDITIONAL_WEATHERS.length
    );
    console.error(`Auditing conditional tiers with ${workerCount} parallel workers`);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextWeather < CONDITIONAL_WEATHERS.length) {
          const index = nextWeather;
          nextWeather += 1;
          const weather = CONDITIONAL_WEATHERS[index];
          console.error(
            `Auditing conditional tier weather ${index + 1}/${CONDITIONAL_WEATHERS.length}: ${weatherOption(weather).label}`
          );
          unordered.set(
            weather,
            await runWeatherTierAudit(
              options,
              weather,
              worker.script,
              path.join(worker.directory, `${weather}.tsv`)
            )
          );
        }
      })
    );
    return new Map(CONDITIONAL_WEATHERS.map((weather) => [weather, unordered.get(weather)!]));
  } finally {
    await fs.promises.rm(worker.directory, { recursive: true, force: true });
  }
}

function outputJson(
  masterfile: Masterfile,
  options: CliOptions,
  projections: ProjectionResult[],
  bosses: BossProfile[],
  audit: Map<string, AuditMatchup[]>,
  tierAudit?: MechanicalTierAudit
): void {
  const pokemon = Object.fromEntries(
    selectedNames(audit, options.pokemon).map((name) => [
      name,
      sortedMatchups(audit.get(name) ?? []).map((matchup) => {
        const candidate = matchup.candidate;
        const background = matchup.backgroundLeader;
        return {
          tier: tierAudit?.assignments.get(name)?.tier ?? null,
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
          weather: {
            condition: options.weather,
            quickMultiplier: matchup.quickWeatherMultiplier,
            chargedMultiplier: matchup.chargedWeatherMultiplier
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
            chargedMultiplier: background.chargedAuraMultiplier,
            quickWeatherMultiplier: background.quickWeatherMultiplier,
            chargedWeatherMultiplier: background.chargedWeatherMultiplier
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
          weather: {
            value: options.weather,
            label: weatherOption(options.weather).label,
            boostedTypes: weatherOption(options.weather).typeNames,
            matchingMoveTypeMultiplier: 1.2
          },
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
        ...(tierAudit
          ? {
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
              }
            }
          : {
              tierPolicy:
                "Single-weather output does not calculate the complete baseline-plus-weather tier assignment; run with --weather none"
            }),
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
  const audit = buildAudit(masterfile, bosses, options.weather);
  const shouldBuildTierAudit = options.weather === "none" && options.format !== "summary";
  const weatherAudits = shouldBuildTierAudit
    ? await buildConditionalWeatherAudits(options)
    : new Map<PvedpsWeather, MegaWeatherTierAudit>();
  const tierAudit = shouldBuildTierAudit
    ? buildMechanicalTiers(masterfile, audit, weatherAudits)
    : undefined;
  if (options.format === "json") {
    outputJson(masterfile, options, projections, bosses, audit, tierAudit);
  }
  if (options.format === "tsv") outputTsv(masterfile, options, audit, tierAudit);
  if (options.format === "summary") outputSummary(options, audit);
  if (options.format === "markdown") {
    outputMarkdown(masterfile, options, projections, bosses, audit, tierAudit);
  }
}
