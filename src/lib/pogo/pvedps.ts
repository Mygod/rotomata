import { calculateCP, calculateCpMultiplier } from "./parity";
import {
  listDoubleWeaknessPresets,
  listPvpdpsTypeNames,
  type DoubleWeaknessPreset
} from "./pvpdps";
import type {
  Masterfile,
  MasterfileForm,
  MasterfileMove,
  MasterfilePokemon,
  MasterfileStats,
  MasterfileTempEvolution,
  MasterfileTypeEntry,
  MasterfileTypeRef
} from "./masterfile";

const FIXED_IV = 15;
const NORMAL_LEVEL = 50;
const MEGA_LEVEL_FOUR_LEVEL = 52;
const MEGA_LEVEL_FOUR_MOVE_MULTIPLIER = 1.3;
const MATCHING_MEGA_TEAMMATE_MULTIPLIER = 1.3;
const OTHER_MEGA_TEAMMATE_MULTIPLIER = 1.1;
const HIDDEN_POWER_MOVE_ID = 281;
const STRUGGLE_MOVE_ID = 133;
const RETURN_MOVE_ID = 323;
const FRUSTRATION_MOVE_ID = 322;
const STAB_MULTIPLIER = 1.2;
const SHADOW_ATTACK_MULTIPLIER = 1.2;
const DPS_SCALE = 500;
const TDO_SCALE = 1_000_000;

const TEMP_EVOLUTION_NAMES: Record<number, string> = {
  1: "Mega",
  2: "Mega X",
  3: "Mega Y",
  4: "Primal",
  5: "Mega Z"
};

const MODE_PARTY_COUNTS: Record<PvedpsMode, number> = {
  gym: 0,
  raid: 1,
  party2: 2,
  party3: 3,
  party4: 4
};

const PARTY_QUICK_THRESHOLDS = [0, 0, -18, -9, -6];

interface ResistanceMap {
  [typeId: number]: number;
}

interface PvedpsStatLine {
  attack: number;
  defense: number;
  hp: number;
  value: number;
  level: number;
  cp: number;
}

interface PvedpsMoveset {
  quick?: number;
  quickType?: number;
  quicks?: number;
  charged?: number;
  dps: number;
}

interface CarrierOptions {
  level: number;
  form: string;
  availability: PvedpsAvailability;
  allowShadow: boolean;
  specialMove?: number;
  teammateAuraTypes?: ReadonlySet<number>;
}

export type PvedpsMode = "gym" | "raid" | "party2" | "party3" | "party4";
export type PvedpsAvailability = "Available" | "Unreleased";

export interface PvedpsInput {
  mode?: PvedpsMode;
  type1?: string;
  type2?: string;
  /** Restrict ranking rows to movesets whose Charged Attack has this type. */
  attackTypeId?: number;
  /** Model a second Trainer using the same Mega/Primal and boosting this one's attacks. */
  megaTeammateBoost?: boolean;
  /** Apply one teammate's explicit Mega/Primal aura to every modeled attacker. */
  teammateAuraTypeIds?: readonly number[];
}

interface ResolvedPvedpsInput {
  mode: PvedpsMode;
  type1: string;
  type2: string;
  attackTypeId?: number;
  megaTeammateBoost: boolean;
  teammateAuraTypes?: ReadonlySet<number>;
}

export interface PvedpsRow {
  pokemon: string;
  form: string;
  alignment: string;
  availability: PvedpsAvailability;
  level: number;
  cp: number;
  quick?: number;
  quickType?: number;
  quicks?: number;
  charged?: number;
  dps: number;
  value: number;
}

export interface PvedpsDisplayRow {
  pokemon: string;
  form: string;
  alignment: string;
  availability: string;
  level: string;
  cp: string;
  quick: string;
  charged: string;
  dps: string;
  tdo: string;
}

export class PvedpsMasterfileError extends Error {}

export function isPvedpsMode(value: string | null): value is PvedpsMode {
  return value !== null && Object.hasOwn(MODE_PARTY_COUNTS, value);
}

export function calculateMegaLevel4MovePower(power: number): number {
  return power * MEGA_LEVEL_FOUR_MOVE_MULTIPLIER;
}

export function listPvedpsTypeNames(masterfile: Masterfile): string[] {
  return listPvpdpsTypeNames(masterfile);
}

export function listPvedpsWeaknessPresets(masterfile: Masterfile): DoubleWeaknessPreset[] {
  return listDoubleWeaknessPresets(masterfile);
}

export type { DoubleWeaknessPreset };

function resolveMoveTypeId(move: MasterfileMove | undefined): number {
  if (typeof move?.type === "number") {
    return move.type;
  }
  return move?.type?.typeId ?? 0;
}

function resolveCarrierTypes(
  carrier: { types?: Record<string, MasterfileTypeRef> },
  fallback?: MasterfilePokemon
): MasterfileTypeRef[] {
  return Object.values(carrier.types ?? fallback?.types ?? {});
}

export function listMegaAuraTypeIds(
  masterfile: Masterfile,
  pokemonName: string,
  form: string,
  carrier: MasterfileTempEvolution,
  fallback: MasterfilePokemon
): number[] {
  let typeNames: string[] | undefined;
  if (pokemonName === "Kyogre" && form === "Primal") {
    typeNames = ["Water", "Electric", "Bug"];
  } else if (pokemonName === "Groudon" && form === "Primal") {
    typeNames = ["Ground", "Fire", "Grass"];
  } else if (pokemonName === "Rayquaza" && form === "Mega") {
    typeNames = ["Flying", "Dragon", "Psychic"];
  }
  if (typeNames) {
    const wanted = new Set(typeNames);
    return Object.values(masterfile.types)
      .filter((type) => wanted.has(type.typeName))
      .map((type) => type.typeId);
  }
  return resolveCarrierTypes(carrier, fallback).map((type) => type.typeId);
}

export function calculateMegaTeammateMoveMultiplier(
  moveTypeId: number,
  auraTypeIds: ReadonlySet<number>
): number {
  return auraTypeIds.has(moveTypeId)
    ? MATCHING_MEGA_TEAMMATE_MULTIPLIER
    : OTHER_MEGA_TEAMMATE_MULTIPLIER;
}

function teammateAttackMultiplier(
  typeId: number,
  teammateAuraTypes: ReadonlySet<number> | undefined
): number {
  return teammateAuraTypes
    ? calculateMegaTeammateMoveMultiplier(typeId, teammateAuraTypes)
    : 1;
}

function resolveCarrierStats(
  carrier: { stats?: MasterfileStats },
  fallback?: MasterfilePokemon
): MasterfileStats | null {
  return carrier.stats ?? fallback?.stats ?? null;
}

function resolveMoveIds(
  carrier: MasterfileForm | MasterfilePokemon | MasterfileTempEvolution,
  fallback: MasterfilePokemon | undefined,
  baseKey: "quickMoves" | "chargedMoves",
  eliteKey: "eliteQuickMoves" | "eliteChargedMoves"
): number[] {
  const source = carrier as MasterfileForm | MasterfilePokemon;
  return (source[baseKey] ?? fallback?.[baseKey] ?? []).concat(
    source[eliteKey] ?? fallback?.[eliteKey] ?? []
  );
}

function shouldCheckForm(form: MasterfileForm): boolean {
  return Boolean(
    form.stats ||
      form.types ||
      form.quickMoves ||
      form.eliteQuickMoves ||
      form.chargedMoves ||
      form.eliteChargedMoves
  );
}

function canShadow(carrier: MasterfileForm | MasterfilePokemon, pokemonData?: MasterfilePokemon): boolean {
  if (carrier.purificationDust) {
    return true;
  }
  return (
    pokemonData === undefined &&
    Object.values((carrier as MasterfilePokemon).forms ?? {}).some(
      (form) => form.name === "Normal" && Boolean(form.purificationDust)
    )
  );
}

function resolveTypeMultipliers(
  types: Record<string, MasterfileTypeEntry>,
  typeName: string | undefined
): ResistanceMap {
  const result: ResistanceMap = {};
  const lookup = typeName?.trim();
  if (!lookup || lookup === "None") {
    return result;
  }
  const type = Object.values(types).find(
    (entry) => entry.typeName.localeCompare(lookup, undefined, { sensitivity: "accent" }) === 0
  );
  if (!type) {
    return result;
  }
  for (const entry of type.weaknesses ?? []) {
    result[entry.typeId] = 1.6;
  }
  for (const entry of type.resistances ?? []) {
    result[entry.typeId] = 0.625;
  }
  for (const entry of type.immunes ?? []) {
    result[entry.typeId] = 0.390625;
  }
  return result;
}

function moveDamageMultiplier(typeId: number, first: ResistanceMap, second: ResistanceMap): number {
  return (first[typeId] ?? 1) * (second[typeId] ?? 1);
}

function buildStatLine(stats: MasterfileStats, level: number): PvedpsStatLine {
  const multiplier = calculateCpMultiplier(level);
  const attack = (stats.attack + FIXED_IV) * multiplier;
  const defense = (stats.defense + FIXED_IV) * multiplier;
  const hp = Math.max(10, Math.floor((stats.stamina + FIXED_IV) * multiplier));
  return {
    attack,
    defense,
    hp,
    value: attack * defense * hp,
    level,
    cp: calculateCP(stats, FIXED_IV, FIXED_IV, FIXED_IV, level)
  };
}

function durationMs(move: MasterfileMove, partyCount: number): number {
  const rawDuration = move.durationMs ?? 0;
  return partyCount ? Math.round(rawDuration / 500) * 500 : rawDuration;
}

function durationMultiplier(move: MasterfileMove, partyCount: number): number {
  const roundedDuration = durationMs(move, partyCount);
  if (!roundedDuration) {
    return 1;
  }
  const multiplier = (move.durationMs ?? 0) / roundedDuration;
  return multiplier > 0.8 && multiplier < 1.2 ? 1 : 2 - multiplier;
}

function addBestMoveset(bestMoves: PvedpsMoveset[], moveset: PvedpsMoveset): void {
  if (bestMoves.length) {
    if (moveset.dps < bestMoves[0].dps) {
      return;
    }
    if (moveset.dps > bestMoves[0].dps) {
      bestMoves.length = 0;
    }
  }
  bestMoves.push(moveset);
}

function shouldSkipChargedMove(
  masterfile: Masterfile,
  chargedMoveId: number,
  candidateChargedMoveIds: number[],
  partyCount: number
): boolean {
  const chargedMove = masterfile.moves[String(chargedMoveId)];
  if (!chargedMove || partyCount || (chargedMove.energyDelta ?? 0) >= -50) {
    return false;
  }
  const chargedType = resolveMoveTypeId(chargedMove);
  const hasSameTypeTwoBar = candidateChargedMoveIds.some((candidateMoveId) => {
    if (candidateMoveId === chargedMoveId) {
      return false;
    }
    const candidateMove = masterfile.moves[String(candidateMoveId)];
    return (
      candidateMove !== undefined &&
      (candidateMove.energyDelta ?? -100) >= -50 &&
      resolveMoveTypeId(candidateMove) === chargedType
    );
  });
  return !hasSameTypeTwoBar;
}

function pushCarrierRows(
  rows: PvedpsRow[],
  masterfile: Masterfile,
  input: ResolvedPvedpsInput,
  pokemonName: string,
  carrier: MasterfileForm | MasterfilePokemon | MasterfileTempEvolution,
  pokemonData: MasterfilePokemon | undefined,
  options: CarrierOptions,
  shadowMoveId = RETURN_MOVE_ID
): void {
  const partyCount = MODE_PARTY_COUNTS[input.mode];
  const partyQuicks = PARTY_QUICK_THRESHOLDS[partyCount];
  const resistanceMap1 = resolveTypeMultipliers(masterfile.types, input.type1);
  const resistanceMap2 = resolveTypeMultipliers(masterfile.types, input.type2);
  const stabTypes = new Set(resolveCarrierTypes(carrier, pokemonData).map((type) => type.typeId));
  const chargedMoveIds = resolveMoveIds(carrier, pokemonData, "chargedMoves", "eliteChargedMoves");
  if (
    input.mode !== "gym" &&
    options.specialMove !== undefined &&
    !chargedMoveIds.includes(options.specialMove)
  ) {
    chargedMoveIds.push(options.specialMove);
  }
  let bestMoves: PvedpsMoveset[] = [];
  let shadowCapable =
    options.allowShadow &&
    canShadow(carrier as MasterfileForm | MasterfilePokemon, pokemonData);
  let canStruggle = false;

  for (const quickMoveId of resolveMoveIds(carrier, pokemonData, "quickMoves", "eliteQuickMoves")) {
    if (quickMoveId === STRUGGLE_MOVE_ID) {
      return;
    }
    const quickMove = masterfile.moves[String(quickMoveId)];
    if (!quickMove) {
      continue;
    }
    const quickDuration = durationMs(quickMove, partyCount);
    const quickEpms = (quickMove.energyDelta ?? 0) / quickDuration;
    if (!quickDuration || !quickEpms) {
      continue;
    }
    const testQuickMove = (moveset: Omit<PvedpsMoveset, "dps">, quickType: number): void => {
      let quickDps =
        (DPS_SCALE *
          (quickMove.power ?? 0) *
          moveDamageMultiplier(quickType, resistanceMap1, resistanceMap2) *
          teammateAttackMultiplier(quickType, options.teammateAuraTypes)) /
        quickDuration;
      if (stabTypes.has(quickType)) {
        quickDps *= STAB_MULTIPLIER;
      }
      if (partyCount) {
        quickDps *= durationMultiplier(quickMove, partyCount);
      }
      if (input.attackTypeId === undefined) {
        addBestMoveset(bestMoves, { ...moveset, dps: quickDps });
      }

      const testChargedMove = (chargedMoveId: number): void => {
        const chargedMove = masterfile.moves[String(chargedMoveId)];
        if (!chargedMove) {
          return;
        }
        const chargedType = resolveMoveTypeId(chargedMove);
        if (input.attackTypeId !== undefined && chargedType !== input.attackTypeId) {
          return;
        }
        if (chargedMoveId === STRUGGLE_MOVE_ID) {
          canStruggle = true;
          if (partyQuicks) {
            for (let quicks = -1; quicks >= partyQuicks; quicks -= 1) {
              let chargedDamage =
                DPS_SCALE *
                (chargedMove.power ?? 0) *
                moveDamageMultiplier(resolveMoveTypeId(chargedMove), resistanceMap1, resistanceMap2) *
                teammateAttackMultiplier(
                  resolveMoveTypeId(chargedMove),
                  options.teammateAuraTypes
                ) *
                (1 + quicks / partyQuicks);
              if (stabTypes.has(resolveMoveTypeId(chargedMove))) {
                chargedDamage *= STAB_MULTIPLIER;
              }
              const quickMs = quickDuration * quicks;
              addBestMoveset(bestMoves, {
                ...moveset,
                charged: chargedMoveId,
                quicks,
                dps:
                  (chargedDamage - quickMs * quickDps) /
                  (durationMs(chargedMove, partyCount) - quickMs)
              });
            }
          }
          return;
        }
        if (!chargedMove.energyDelta) {
          return;
        }
        if (shouldSkipChargedMove(masterfile, chargedMoveId, chargedMoveIds, partyCount)) {
          return;
        }
        const power =
          chargedMoveId === options.specialMove
            ? calculateMegaLevel4MovePower(chargedMove.power ?? 0)
            : (chargedMove.power ?? 0);
        let chargedDamage =
          DPS_SCALE *
          power *
          moveDamageMultiplier(chargedType, resistanceMap1, resistanceMap2) *
          teammateAttackMultiplier(chargedType, options.teammateAuraTypes);
        if (stabTypes.has(chargedType)) {
          chargedDamage *= STAB_MULTIPLIER;
        }
        if (partyCount) {
          chargedDamage *= durationMultiplier(chargedMove, partyCount);
        }
        if (partyQuicks) {
          chargedDamage *=
            1 +
            Math.min(1, chargedMove.energyDelta / (partyQuicks * (quickMove.energyDelta ?? 0)));
        }
        const quickMs = chargedMove.energyDelta / quickEpms;
        addBestMoveset(bestMoves, {
          ...moveset,
          charged: chargedMoveId,
          dps:
            (chargedDamage - quickMs * quickDps) /
            (durationMs(chargedMove, partyCount) - quickMs)
        });
      };

      for (const chargedMoveId of chargedMoveIds) {
        testChargedMove(chargedMoveId);
      }
      if (shadowCapable) {
        testChargedMove(shadowMoveId);
      }
    };

    if (quickMoveId === HIDDEN_POWER_MOVE_ID) {
      for (let quickType = 2; quickType < 18; quickType += 1) {
        testQuickMove({ quick: quickMoveId, quickType }, quickType);
      }
    } else {
      testQuickMove({ quick: quickMoveId }, resolveMoveTypeId(quickMove));
    }
  }

  if (canStruggle) {
    const struggle = masterfile.moves[String(STRUGGLE_MOVE_ID)];
    if (struggle?.durationMs) {
      const struggleType = resolveMoveTypeId(struggle);
      let dps =
        (DPS_SCALE *
          (struggle.power ?? 0) *
          moveDamageMultiplier(struggleType, resistanceMap1, resistanceMap2) *
          teammateAttackMultiplier(struggleType, options.teammateAuraTypes)) /
        durationMs(struggle, partyCount);
      if (stabTypes.has(struggleType)) {
        dps *= STAB_MULTIPLIER;
      }
      addBestMoveset(bestMoves, { charged: STRUGGLE_MOVE_ID, dps });
    }
  }
  if (!bestMoves.length) {
    return;
  }

  const stats = resolveCarrierStats(carrier, pokemonData);
  if (!stats) {
    return;
  }
  const statLine = buildStatLine(stats, options.level);
  if (shadowCapable && bestMoves.every((move) => move.charged === RETURN_MOVE_ID)) {
    pushCarrierRows(
      rows,
      masterfile,
      input,
      pokemonName,
      carrier,
      pokemonData,
      options,
      FRUSTRATION_MOVE_ID
    );
    shadowCapable = false;
  }
  for (const moveset of bestMoves) {
    const row: PvedpsRow = {
      pokemon: pokemonName,
      form: options.form,
      alignment: "",
      availability: options.availability,
      level: statLine.level,
      cp: statLine.cp,
      quick: moveset.quick,
      quickType: moveset.quickType,
      quicks: moveset.quicks,
      charged: moveset.charged,
      dps: moveset.dps * statLine.attack,
      value: (statLine.value * moveset.dps) / TDO_SCALE
    };
    if (shadowMoveId === RETURN_MOVE_ID) {
      rows.push(row);
    }
    if (shadowCapable) {
      rows.push({
        ...row,
        alignment: "Shadow",
        dps: row.dps * SHADOW_ATTACK_MULTIPLIER
      });
    }
  }
}

function pushApexRows(
  rows: PvedpsRow[],
  masterfile: Masterfile,
  input: ResolvedPvedpsInput,
  pokemonName: string,
  alignment: string,
  pokemon: MasterfilePokemon | undefined,
  chargedMoveId: number
): void {
  if (!pokemon?.stats) {
    return;
  }
  const partyCount = MODE_PARTY_COUNTS[input.mode];
  const partyQuicks = PARTY_QUICK_THRESHOLDS[partyCount];
  const chargedMoveIds = (pokemon.chargedMoves ?? []).concat(pokemon.eliteChargedMoves ?? []);
  if (shouldSkipChargedMove(masterfile, chargedMoveId, chargedMoveIds, partyCount)) {
    return;
  }
  const chargedMove = masterfile.moves[String(chargedMoveId)];
  if (!chargedMove?.energyDelta) {
    return;
  }
  const chargedType = resolveMoveTypeId(chargedMove);
  if (input.attackTypeId !== undefined && chargedType !== input.attackTypeId) {
    return;
  }
  const resistanceMap1 = resolveTypeMultipliers(masterfile.types, input.type1);
  const resistanceMap2 = resolveTypeMultipliers(masterfile.types, input.type2);
  const stabTypes = new Set(Object.values(pokemon.types ?? {}).map((type) => type.typeId));
  let bestMoves: PvedpsMoveset[] = [];
  for (const quickMoveId of (pokemon.quickMoves ?? []).concat(pokemon.eliteQuickMoves ?? [])) {
    if (quickMoveId === STRUGGLE_MOVE_ID) {
      return;
    }
    const quickMove = masterfile.moves[String(quickMoveId)];
    if (!quickMove) {
      continue;
    }
    const quickDuration = durationMs(quickMove, partyCount);
    const quickEpms = (quickMove.energyDelta ?? 0) / quickDuration;
    if (!quickDuration || !quickEpms) {
      continue;
    }
    const testQuickMove = (moveset: Omit<PvedpsMoveset, "dps">, quickType: number): void => {
      let quickDps =
        (DPS_SCALE *
          (quickMove.power ?? 0) *
          moveDamageMultiplier(quickType, resistanceMap1, resistanceMap2) *
          teammateAttackMultiplier(quickType, input.teammateAuraTypes)) /
        quickDuration;
      if (stabTypes.has(quickType)) {
        quickDps *= STAB_MULTIPLIER;
      }
      let chargedDamage =
        DPS_SCALE *
        (chargedMove.power ?? 0) *
        moveDamageMultiplier(chargedType, resistanceMap1, resistanceMap2) *
        teammateAttackMultiplier(chargedType, input.teammateAuraTypes);
      if (stabTypes.has(chargedType)) {
        chargedDamage *= STAB_MULTIPLIER;
      }
      if (partyQuicks) {
        chargedDamage *=
          1 +
          Math.min(1, chargedMove.energyDelta! / (partyQuicks * (quickMove.energyDelta ?? 0)));
      }
      const quickMs = chargedMove.energyDelta! / quickEpms;
      addBestMoveset(bestMoves, {
        ...moveset,
        charged: chargedMoveId,
        dps:
          (chargedDamage - quickMs * quickDps) /
          (durationMs(chargedMove, partyCount) - quickMs)
      });
    };
    if (quickMoveId === HIDDEN_POWER_MOVE_ID) {
      for (let quickType = 2; quickType < 18; quickType += 1) {
        testQuickMove({ quick: quickMoveId, quickType }, quickType);
      }
    } else {
      testQuickMove({ quick: quickMoveId }, resolveMoveTypeId(quickMove));
    }
  }
  const statLine = buildStatLine(pokemon.stats, NORMAL_LEVEL);
  for (const moveset of bestMoves) {
    const dps = moveset.dps * statLine.attack;
    rows.push({
      pokemon: pokemonName,
      form: "",
      alignment,
      availability: "Available",
      level: statLine.level,
      cp: statLine.cp,
      quick: moveset.quick,
      quickType: moveset.quickType,
      charged: moveset.charged,
      dps: alignment.endsWith("Shadow") ? dps * SHADOW_ATTACK_MULTIPLIER : dps,
      value: (statLine.value * moveset.dps) / TDO_SCALE
    });
  }
}

export function assertPvedpsMasterfile(masterfile: Masterfile): void {
  const hasPveEnergy = Object.values(masterfile.moves).some(
    (move) => typeof move.energyDelta === "number"
  );
  const attachedSpecialMoves = Object.values(masterfile.pokemon).flatMap((pokemon) =>
    Object.values(pokemon.tempEvolutions ?? {})
      .map((tempEvolution) => tempEvolution.specialMove)
      .filter((moveId): moveId is number => typeof moveId === "number")
  );
  const hasCompleteSpecialMove = attachedSpecialMoves.some((moveId) => {
    const move = masterfile.moves[String(moveId)];
    return Boolean(move && move.power !== undefined && move.durationMs && move.energyDelta);
  });
  if (!hasPveEnergy || !hasCompleteSpecialMove) {
    throw new PvedpsMasterfileError(
      "The runtime masterfile predates PvE energy or Mega special-move data."
    );
  }
}

export function buildPvedpsRows(masterfile: Masterfile, input: PvedpsInput = {}): PvedpsRow[] {
  assertPvedpsMasterfile(masterfile);
  const teammateAuraTypeIds = input.teammateAuraTypeIds ?? [];
  if (input.megaTeammateBoost && teammateAuraTypeIds.length) {
    throw new Error("megaTeammateBoost and teammateAuraTypeIds model different strategies");
  }
  const resolvedInput: ResolvedPvedpsInput = {
    mode: input.mode ?? "party2",
    type1: input.type1 ?? "None",
    type2: input.type2 ?? "None",
    attackTypeId: input.attackTypeId,
    megaTeammateBoost: input.megaTeammateBoost ?? false,
    teammateAuraTypes: teammateAuraTypeIds.length ? new Set(teammateAuraTypeIds) : undefined
  };
  const rows: PvedpsRow[] = [];
  for (const pokemon of Object.values(masterfile.pokemon)) {
    pushCarrierRows(rows, masterfile, resolvedInput, pokemon.name, pokemon, undefined, {
      level: NORMAL_LEVEL,
      form: "",
      availability: "Available",
      allowShadow: true,
      teammateAuraTypes: resolvedInput.teammateAuraTypes
    });
    for (const form of Object.values(pokemon.forms ?? {})) {
      if (!shouldCheckForm(form)) {
        continue;
      }
      pushCarrierRows(rows, masterfile, resolvedInput, pokemon.name, form, pokemon, {
        level: NORMAL_LEVEL,
        form: form.name ?? "",
        availability: "Available",
        allowShadow: true,
        teammateAuraTypes: resolvedInput.teammateAuraTypes
      });
    }
    for (const tempEvolution of Object.values(pokemon.tempEvolutions ?? {})) {
      const tempEvoId = Number(tempEvolution.tempEvoId);
      const form = TEMP_EVOLUTION_NAMES[tempEvoId];
      if (!form) {
        continue;
      }
      pushCarrierRows(rows, masterfile, resolvedInput, pokemon.name, tempEvolution, pokemon, {
        level: MEGA_LEVEL_FOUR_LEVEL,
        form,
        availability: tempEvolution.unreleased ? "Unreleased" : "Available",
        allowShadow: false,
        specialMove: tempEvolution.specialMove,
        teammateAuraTypes: resolvedInput.megaTeammateBoost
          ? new Set(listMegaAuraTypeIds(masterfile, pokemon.name, form, tempEvolution, pokemon))
          : resolvedInput.teammateAuraTypes
      });
    }
  }
  pushApexRows(rows, masterfile, resolvedInput, "Lugia", "Apex Shadow", masterfile.pokemon["249"], 360);
  pushApexRows(rows, masterfile, resolvedInput, "Lugia", "Apex", masterfile.pokemon["249"], 361);
  pushApexRows(rows, masterfile, resolvedInput, "Ho Oh", "Apex Shadow", masterfile.pokemon["250"], 362);
  pushApexRows(rows, masterfile, resolvedInput, "Ho Oh", "Apex", masterfile.pokemon["250"], 363);
  rows.sort((left, right) => right.dps - left.dps || right.value - left.value);
  return rows;
}

export function formatPvedpsRow(masterfile: Masterfile, row: PvedpsRow): PvedpsDisplayRow {
  const quickMove = row.quick === undefined ? undefined : masterfile.moves[String(row.quick)];
  const chargedMove = row.charged === undefined ? undefined : masterfile.moves[String(row.charged)];
  const quickType =
    row.quickType === undefined ? "" : ` ${masterfile.types[String(row.quickType)]?.typeName ?? ""}`;
  const quickCount = row.quicks === undefined ? "" : ` x${-row.quicks}`;
  return {
    pokemon: row.pokemon,
    form: row.form,
    alignment: row.alignment,
    availability: row.availability,
    level: String(row.level),
    cp: String(row.cp),
    quick: quickMove ? `${quickMove.name}${quickType}${quickCount}` : "",
    charged: chargedMove?.name ?? "",
    dps: row.dps.toFixed(2),
    tdo: row.value.toFixed(2)
  };
}
