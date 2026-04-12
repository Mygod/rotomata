import { calculateCpMultiplier } from "./parity";
import type {
  Masterfile,
  MasterfileForm,
  MasterfileMove,
  MasterfileMoveBuff,
  MasterfilePokemon,
  MasterfileStats,
  MasterfileTypeEntry,
  MasterfileTypeRef
} from "./masterfile";

const EXACT_CP_MULTIPLIERS: Record<string, number> = {
  "40": 0.790300011634826,
  "40.5": 0.792803950958807,
  "41": 0.795300006866455,
  "41.5": 0.79780392148697,
  "42": 0.800300002098083,
  "42.5": 0.802803892322847,
  "43": 0.805299997329711,
  "43.5": 0.807803863460723,
  "44": 0.81029999256134,
  "44.5": 0.812803834895026,
  "45": 0.815299987792968,
  "45.5": 0.817803806620319,
  "46": 0.820299983024597,
  "46.5": 0.822803778631297,
  "47": 0.825299978256225,
  "47.5": 0.827803750922782,
  "48": 0.830299973487854,
  "48.5": 0.832803753381377,
  "49": 0.835300028324127,
  "49.5": 0.837803755931569,
  "50": 0.840300023555755,
  "50.5": 0.842803729034748,
  "51": 0.845300018787384,
  "51.5": 0.847803702398935,
  "52": 0.850300014019012,
  "52.5": 0.852803676019539,
  "53": 0.85530000925064,
  "53.5": 0.857803649892077,
  "54": 0.860300004482269,
  "54.5": 0.862803624012168,
  "55": 0.865299999713897
};

const DEFAULT_CP_CAP = 1e8;
const DEFAULT_LEVEL_CAP = 50;
const CHARGED_SECONDS = 10;
const HIDDEN_POWER_MOVE_ID = 281;
const STRUGGLE_MOVE_ID = 133;
const PREFER_RANK_1 = true;

interface ResistanceMap {
  [typeId: number]: number;
}

interface PvpdpsBestEntry {
  attack: number;
  hp: number;
  value: number;
  level: number;
  cp: number;
  iv: string;
}

interface PvpdpsMoveset {
  quick: number;
  quickType?: number;
  charged?: number;
  dps: number;
}

export interface PvpdpsInput {
  cpCap?: number;
  type1?: string;
  type2?: string;
  charged?: boolean;
}

export interface PvpdpsRow {
  pokemon: string;
  form: string;
  shadow: boolean;
  iv: string;
  level: number;
  cp: number;
  quick: number;
  quickType?: number;
  charged?: number;
  dps: number;
  value: number;
  attack: number;
}

export interface PvpdpsDisplayRow {
  pokemon: string;
  form: string;
  alignment: string;
  iv: string;
  level: string;
  cp: string;
  quick: string;
  charged: string;
  dps: string;
  tdo: string;
}

export interface DoubleWeaknessPreset {
  value: string;
  label: string;
  attackingType: string;
  defenderType1: string;
  defenderType2: string;
  count: number;
}

const NO_PRESET_DEFENDER_TYPE = "None";
const GHOST_TYPE_ID = 8;
const DARK_TYPE_ID = 17;

function calculatePvpdpsCpMultiplier(level: number): number {
  if (level < 40) {
    return calculateCpMultiplier(level);
  }
  const exact = EXACT_CP_MULTIPLIERS[String(level)];
  if (exact !== undefined) {
    return exact;
  }
  const baseLevel = Math.floor(level);
  const baseCpm = Math.fround(0.5903 + baseLevel * 0.005);
  if (baseLevel === level) {
    return Math.fround(baseCpm);
  }
  const nextCpm = Math.fround(0.5903 + (baseLevel + 1) * 0.005);
  return Math.sqrt((baseCpm * baseCpm + nextCpm * nextCpm) / 2);
}

function calculatePvpdpsCp(
  stats: MasterfileStats,
  attack: number,
  defense: number,
  stamina: number,
  level: number
): number {
  const multiplier = calculatePvpdpsCpMultiplier(level);
  const a = stats.attack + attack;
  const d = stats.defense + defense;
  const s = stats.stamina + stamina;
  const cp = Math.floor((multiplier * multiplier * a * Math.sqrt(d * s)) / 10);
  return cp < 10 ? 10 : cp;
}

function calculatePvpdpsStat(
  stats: MasterfileStats,
  attack: number,
  defense: number,
  stamina: number,
  cap: number,
  lvCap: number,
  minLevel = 1
): Omit<PvpdpsBestEntry, "iv"> | null {
  let bestCP = calculatePvpdpsCp(stats, attack, defense, stamina, minLevel);
  if (bestCP > cap) {
    return null;
  }
  let lowest = minLevel;
  let highest = lvCap;
  for (
    let mid = Math.ceil(lowest + highest) / 2;
    lowest < highest;
    mid = Math.ceil(lowest + highest) / 2
  ) {
    const cp = calculatePvpdpsCp(stats, attack, defense, stamina, mid);
    if (cp <= cap) {
      lowest = mid;
      bestCP = cp;
    } else {
      highest = mid - 0.5;
    }
  }
  const multiplier = calculatePvpdpsCpMultiplier(lowest);
  const scaledAttack = (attack + stats.attack) * multiplier;
  let hp = (stamina + stats.stamina) * multiplier;
  hp = hp < 10 ? 10 : Math.floor(hp);
  return {
    attack: scaledAttack,
    hp,
    value: scaledAttack * (defense + stats.defense) * multiplier * hp,
    level: lowest,
    cp: bestCP
  };
}

function resolveCarrierTypes(
  carrier: { types?: Record<string, MasterfileTypeRef> } | undefined,
  fallback: MasterfilePokemon | undefined
): MasterfileTypeRef[] {
  return Object.values(carrier?.types ?? fallback?.types ?? {});
}

function resolveCarrierStats(
  carrier: { stats?: MasterfileStats } | undefined,
  fallback: MasterfilePokemon | undefined
): MasterfileStats | null {
  return carrier?.stats ?? fallback?.stats ?? null;
}

function resolveMoveIds(
  carrier: MasterfileForm | MasterfilePokemon,
  fallback: MasterfilePokemon | undefined,
  baseKey: "quickMoves" | "chargedMoves",
  eliteKey: "eliteQuickMoves" | "eliteChargedMoves"
): number[] {
  return (carrier[baseKey] ?? fallback?.[baseKey] ?? []).concat(
    carrier[eliteKey] ?? fallback?.[eliteKey] ?? []
  );
}

function shouldCheckCarrier(formData: MasterfileForm): boolean {
  return (
    formData.stats !== undefined ||
    formData.quickMoves !== undefined ||
    formData.chargedMoves !== undefined ||
    formData.eliteQuickMoves !== undefined ||
    formData.eliteChargedMoves !== undefined ||
    formData.types !== undefined
  );
}

function canShadow(formData: MasterfileForm | MasterfilePokemon, pokemonData?: MasterfilePokemon): boolean {
  return Boolean(formData.purificationDust) || (
    pokemonData === undefined &&
    Object.values((formData as MasterfilePokemon).forms ?? {}).some(
      (form) => form.name === "Normal" && Boolean(form.purificationDust)
    )
  );
}

function resolveTypeMultipliers(
  types: Record<string, MasterfileTypeEntry>,
  typeName: string | undefined
): ResistanceMap {
  const lookup = typeName?.trim();
  const result: ResistanceMap = {};
  if (!lookup) {
    return result;
  }
  for (const type of Object.values(types)) {
    if (type.typeName.localeCompare(lookup, undefined, { sensitivity: "accent" }) !== 0) {
      continue;
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
    break;
  }
  return result;
}

function includesBadBuff(move: MasterfileMove | undefined): boolean {
  return Boolean(
    move?.pvpBuffs?.some(
      (buff: MasterfileMoveBuff) =>
        (buff.buffActivationChance ?? 0) > 0 &&
        ((buff.attackerAttackStatStageChange ?? 0) < 0 ||
          (buff.targetDefenseStatStageChange ?? 0) > 0)
    )
  );
}

function moveDamageMultiplier(typeId: number, first: ResistanceMap, second: ResistanceMap): number {
  return (first[typeId] ?? 1) * (second[typeId] ?? 1);
}

function addBestMoveset(bestMoves: PvpdpsMoveset[], moveset: PvpdpsMoveset): void {
  if (bestMoves.length > 0) {
    if (moveset.dps < bestMoves[0].dps) {
      return;
    }
    if (moveset.dps > bestMoves[0].dps) {
      bestMoves.length = 0;
    }
  }
  bestMoves.push(moveset);
}

function buildBestEntries(stats: MasterfileStats, cpCap: number, lvCap: number): PvpdpsBestEntry[] {
  const key = `${stats.attack},${stats.defense},${stats.stamina},${cpCap},${lvCap}`;
  const cached = bestEntryCache.get(key);
  if (cached) {
    return cached;
  }
  let bestEntries: PvpdpsBestEntry[] = [];
  const ivFloor = stats.attack === 414 ? 10 : 0;
  for (let a = ivFloor; a <= 15; a += 1) {
    for (let d = ivFloor; d <= 15; d += 1) {
      for (let s = ivFloor; s <= 15; s += 1) {
        const entry = calculatePvpdpsStat(stats, a, d, s, cpCap, lvCap);
        if (!entry) {
          continue;
        }
        let value = entry.value;
        if (!PREFER_RANK_1) {
          value /= entry.attack;
        }
        if (bestEntries.length > 0) {
          let delta: number;
          if (PREFER_RANK_1) {
            delta = value - bestEntries[0].value;
            if (delta === 0) {
              delta = entry.attack - bestEntries[0].attack;
            }
          } else {
            delta = entry.attack - bestEntries[0].attack;
            if (delta === 0) {
              delta = value - bestEntries[0].value;
            }
          }
          if (delta < 0) {
            continue;
          }
          if (delta > 0) {
            bestEntries = [];
          }
        }
        bestEntries.push({
          attack: entry.attack,
          hp: entry.hp,
          value,
          level: entry.level,
          cp: entry.cp,
          iv: `${a}/${d}/${s}`
        });
      }
    }
  }
  bestEntryCache.set(key, bestEntries);
  return bestEntries;
}

const bestEntryCache = new Map<string, PvpdpsBestEntry[]>();

function pushRowsForCarrier(
  rows: PvpdpsRow[],
  masterfile: Masterfile,
  input: Required<PvpdpsInput>,
  pokemonName: string,
  formName: string,
  carrier: MasterfileForm | MasterfilePokemon,
  pokemonData?: MasterfilePokemon
): void {
  if (pokemonData && !shouldCheckCarrier(carrier as MasterfileForm)) {
    return;
  }
  const stabTypes = new Set(
    resolveCarrierTypes(carrier, pokemonData).map((type) => type.typeId)
  );
  let bestMoves: PvpdpsMoveset[] = [];
  const shadowCapable = canShadow(carrier, pokemonData);
  const resistanceMap1 = resolveTypeMultipliers(masterfile.types, input.type1);
  const resistanceMap2 = resolveTypeMultipliers(masterfile.types, input.type2);

  for (const quickMoveId of resolveMoveIds(carrier, pokemonData, "quickMoves", "eliteQuickMoves")) {
    if (quickMoveId === STRUGGLE_MOVE_ID) {
      return;
    }
    const quickMove = masterfile.moves[String(quickMoveId)];
    if (!quickMove) {
      continue;
    }
    const turns = 1 + (quickMove.pvpDurationTurns ?? 0);
    const quickEpt = (quickMove.pvpEnergyDelta ?? 0) / turns;
    if (!quickEpt) {
      continue;
    }
    const testQuickMove = (moveset: Omit<PvpdpsMoveset, "dps">, quickType: number): void => {
      let quickDps =
        (1.28 * (quickMove.pvpPower ?? 0) / turns) *
        moveDamageMultiplier(quickType, resistanceMap1, resistanceMap2);
      if (stabTypes.has(quickType)) {
        quickDps *= 1.2;
      }
      if (!input.charged) {
        addBestMoveset(bestMoves, { ...moveset, dps: quickDps });
        return;
      }
      for (const chargedMoveId of resolveMoveIds(carrier, pokemonData, "chargedMoves", "eliteChargedMoves")) {
        const chargedMove = masterfile.moves[String(chargedMoveId)];
        if (!chargedMove || includesBadBuff(chargedMove)) {
          continue;
        }
        let chargedDamage =
          0.64 *
          (chargedMove.pvpPower ?? 0) *
          moveDamageMultiplier(chargedMove.type ?? 0, resistanceMap1, resistanceMap2);
        if (stabTypes.has(chargedMove.type ?? 0)) {
          chargedDamage *= 1.2;
        }
        const quickTurns = (chargedMove.pvpEnergyDelta ?? 0) / quickEpt;
        addBestMoveset(bestMoves, {
          ...moveset,
          charged: chargedMoveId,
          dps: (quickDps * quickTurns * -0.5 + chargedDamage) / (quickTurns * -0.5 + CHARGED_SECONDS)
        });
      }
      if (false && shadowCapable) {
        // Preserve the script's disabled Frustration/Return path.
      }
    };
    if (quickMoveId === HIDDEN_POWER_MOVE_ID) {
      for (let quickType = 2; quickType < 18; quickType += 1) {
        testQuickMove({ quick: quickMoveId, quickType }, quickType);
      }
    } else {
      testQuickMove({ quick: quickMoveId }, quickMove.type ?? 0);
    }
  }
  if (!bestMoves.length) {
    return;
  }

  const stats = resolveCarrierStats(carrier, pokemonData);
  if (!stats) {
    return;
  }
  for (const entry of buildBestEntries(stats, input.cpCap, DEFAULT_LEVEL_CAP)) {
    for (const moveset of bestMoves) {
      const row: PvpdpsRow = {
        pokemon: pokemonName,
        form: formName,
        shadow: false,
        iv: entry.iv,
        level: entry.level,
        cp: entry.cp,
        quick: moveset.quick,
        quickType: moveset.quickType,
        charged: moveset.charged,
        dps: moveset.dps * entry.attack,
        value: entry.value,
        attack: entry.attack
      };
      rows.push(row);
      if (!shadowCapable) {
        continue;
      }
      const shadowRow: PvpdpsRow = {
        ...row,
        shadow: true,
        dps: row.dps * 1.2
      };
      shadowRow.value /= 1.2;
      rows.push(shadowRow);
    }
  }
}

export function listPvpdpsTypeNames(masterfile: Masterfile): string[] {
  return Object.values(masterfile.types)
    .sort((left, right) => left.typeId - right.typeId)
    .map((type) => type.typeName);
}

function typeMatchupMultiplier(defenderType: MasterfileTypeEntry, attackingTypeId: number): number {
  if ((defenderType.immunes ?? []).some((type) => type.typeId === attackingTypeId)) {
    return 0.390625;
  }
  if ((defenderType.resistances ?? []).some((type) => type.typeId === attackingTypeId)) {
    return 0.625;
  }
  if ((defenderType.weaknesses ?? []).some((type) => type.typeId === attackingTypeId)) {
    return 1.6;
  }
  return 1;
}

function countSpeciesByTypeCombo(masterfile: Masterfile): Map<string, number> {
  const counts = new Map<string, number>();
  const toKey = (typeIds: number[]): string => typeIds.join(":");
  const addTypes = (seen: Set<string>, types: Record<string, MasterfileTypeRef> | undefined): void => {
    const typeIds = Object.values(types ?? {})
      .map((type) => type.typeId)
      .sort((left, right) => left - right);
    if (!typeIds.length) {
      return;
    }
    seen.add(toKey(typeIds));
  };
  for (const pokemon of Object.values(masterfile.pokemon)) {
    const seen = new Set<string>();
    addTypes(seen, pokemon.types);
    for (const form of Object.values(pokemon.forms ?? {})) {
      addTypes(seen, form.types ?? pokemon.types);
    }
    for (const tempEvolution of Object.values(pokemon.tempEvolutions ?? {})) {
      addTypes(seen, tempEvolution.types ?? pokemon.types);
    }
    for (const comboKey of seen) {
      counts.set(comboKey, (counts.get(comboKey) ?? 0) + 1);
    }
  }
  return counts;
}

export function listDoubleWeaknessPresets(masterfile: Masterfile): DoubleWeaknessPreset[] {
  const defendingTypes = Object.values(masterfile.types)
    .filter((type) => type.typeId > 0)
    .sort((left, right) => left.typeId - right.typeId);
  const comboCounts = countSpeciesByTypeCombo(masterfile);
  const presets = new Map<
    string,
    DoubleWeaknessPreset & { attackingTypeId: number; defenderType1Id: number; defenderType2Id: number }
  >();
  const registerPreset = (
    attackingTypeId: number | null,
    firstType: MasterfileTypeEntry,
    secondType?: MasterfileTypeEntry,
    overrideAttackingType?: string
  ): void => {
    const attackingType = attackingTypeId === null ? null : masterfile.types[String(attackingTypeId)];
    if (attackingTypeId !== null && !attackingType) {
      return;
    }
    const defenderType1Id = firstType.typeId;
    const defenderType2Id = secondType?.typeId ?? 0;
    const countKey = secondType ? `${defenderType1Id}:${defenderType2Id}` : `${defenderType1Id}`;
    const count = comboCounts.get(countKey) ?? 0;
    if (count <= 0) {
      return;
    }
    const attackingTypeLabel = overrideAttackingType ?? attackingType?.typeName ?? "";
    const key = `${attackingTypeLabel}:${countKey}`;
    if (presets.has(key)) {
      return;
    }
    const defenderLabel = secondType
      ? `${firstType.typeName}+${secondType.typeName}`
      : firstType.typeName;
    presets.set(key, {
      value: key,
      label: `${attackingTypeLabel} -> ${defenderLabel} (${count})`,
      attackingType: attackingTypeLabel,
      defenderType1: firstType.typeName,
      defenderType2: secondType?.typeName ?? NO_PRESET_DEFENDER_TYPE,
      count,
      attackingTypeId: attackingTypeId ?? DARK_TYPE_ID,
      defenderType1Id,
      defenderType2Id
    });
  };
  for (const firstType of defendingTypes) {
    const singleWeaknesses = defendingTypes
      .map((attackingType) => attackingType.typeId)
      .filter((attackingTypeId) => typeMatchupMultiplier(firstType, attackingTypeId) > 1);
    if (singleWeaknesses.length === 1) {
      registerPreset(singleWeaknesses[0], firstType);
    }
  }
  for (let firstIndex = 0; firstIndex < defendingTypes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < defendingTypes.length; secondIndex += 1) {
      const firstType = defendingTypes[firstIndex];
      const secondType = defendingTypes[secondIndex];
      const totalWeaknesses: number[] = [];
      const doubleWeaknesses: number[] = [];
      for (const attackingType of defendingTypes) {
        const multiplier =
          typeMatchupMultiplier(firstType, attackingType.typeId) *
          typeMatchupMultiplier(secondType, attackingType.typeId);
        if (multiplier > 1) {
          totalWeaknesses.push(attackingType.typeId);
        }
        if (multiplier > 1.6) {
          doubleWeaknesses.push(attackingType.typeId);
        }
      }
      if (doubleWeaknesses.length === 1) {
        registerPreset(doubleWeaknesses[0], firstType, secondType);
      } else if (
        doubleWeaknesses.length === 2 &&
        doubleWeaknesses.includes(DARK_TYPE_ID) &&
        doubleWeaknesses.includes(GHOST_TYPE_ID)
      ) {
        registerPreset(null, firstType, secondType, "Dark+Ghost");
      }
      if (totalWeaknesses.length === 1) {
        registerPreset(totalWeaknesses[0], firstType, secondType);
      }
    }
  }
  return Array.from(presets.values())
    .sort(
    (left, right) =>
      left.attackingTypeId - right.attackingTypeId ||
      left.defenderType1Id - right.defenderType1Id ||
      left.defenderType2Id - right.defenderType2Id
    )
    .map(
      ({
        attackingTypeId: _attackingTypeId,
        defenderType1Id: _defenderType1Id,
        defenderType2Id: _defenderType2Id,
        ...preset
      }) => preset
    );
}

export function buildPvpdpsRows(masterfile: Masterfile, input: PvpdpsInput): PvpdpsRow[] {
  const normalizedInput: Required<PvpdpsInput> = {
    cpCap: input.cpCap && input.cpCap > 0 ? input.cpCap : DEFAULT_CP_CAP,
    type1: input.type1?.trim() ?? "",
    type2: input.type2?.trim() ?? "",
    charged: Boolean(input.charged)
  };
  const rows: PvpdpsRow[] = [];
  for (const pokemon of Object.values(masterfile.pokemon)) {
    pushRowsForCarrier(rows, masterfile, normalizedInput, pokemon.name, "", pokemon);
    for (const form of Object.values(pokemon.forms ?? {})) {
      pushRowsForCarrier(rows, masterfile, normalizedInput, pokemon.name, form.name ?? "", form, pokemon);
    }
    if (false && pokemon.tempEvolutions) {
      // Preserve the script's disabled temp-evolution path.
    }
  }
  rows.sort((left, right) => {
    const delta = right.dps - left.dps;
    return delta === 0 ? right.value - left.value : delta;
  });
  return rows;
}

export function formatPvpdpsRow(masterfile: Masterfile, row: PvpdpsRow): PvpdpsDisplayRow {
  const quickMove = masterfile.moves[String(row.quick)];
  const chargedMove = row.charged ? masterfile.moves[String(row.charged)] : undefined;
  const quickTypeName = row.quickType
    ? masterfile.types[String(row.quickType)]?.typeName ?? String(row.quickType)
    : "";
  const tdo = (((
    (PREFER_RANK_1 ? row.value / row.attack : row.value) *
    row.dps
  ) / 1000000)).toFixed(2);
  return {
    pokemon: row.pokemon,
    form: row.form,
    alignment: row.shadow ? "Shadow" : "",
    iv: row.iv,
    level: String(row.level),
    cp: String(row.cp),
    quick: `${quickMove?.name ?? row.quick}${row.quickType ? ` ${quickTypeName}` : ""}`,
    charged: chargedMove?.name ?? "",
    dps: row.dps.toFixed(2),
    tdo
  };
}
