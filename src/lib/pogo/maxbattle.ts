import { calculateCP, calculateCpMultiplier } from "./parity";
import type {
  Masterfile,
  MasterfileForm,
  MasterfileMove,
  MasterfilePokemon,
  MasterfileStats,
  MasterfileTypeEntry,
  MasterfileTypeRef
} from "./masterfile";

const FIXED_LEVEL = 50;
const FIXED_IV = 15;
const STRUGGLE_MOVE_ID = 133;
const MAX_MOVE_DPS = 350;
const STAB_MULTIPLIER = 1.2;
const DPS_VALUE_DIVISOR = 1000000;
const ATTACK_DPS_DIVISOR = 100;
const ADVENTURE_EFFECT_POWER_BONUS = 100;
const ADVENTURE_EFFECT_HP_SHIELD_BONUS = 60;
const DEFAULT_HP_SHIELD = 180;

const BEHEMOTH_BLADE_ADVENTURE_EFFECTS: Record<string, AdventureEffect> = {
  "Crowned Sword": { form: "Crowned Sword (Behemoth Blade)", attack: 1.05 },
  "Crowned Shield": { form: "Crowned Shield (Behemoth Blade)", attack: 1.05 }
};

const BEHEMOTH_BASH_ADVENTURE_EFFECTS: Record<string, AdventureEffect> = {
  "Crowned Sword": { form: "Crowned Sword (Behemoth Bash)", defense: 1.05 },
  "Crowned Shield": { form: "Crowned Shield (Behemoth Bash)", defense: 1.05 },
  "Crowned 4x": { form: "Crowned 4x (Behemoth Bash)", defense: 1.05 }
};

interface AdventureEffect {
  form: string;
  attack?: number;
  defense?: number;
}

interface Level50StatLine {
  attack: number;
  defense: number;
  hp: number;
  value: number;
  level: number;
  cp: number;
}

interface MaxBattleCarrier {
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
  quickMoves?: number[];
  chargedMoves?: number[];
  eliteQuickMoves?: number[];
  eliteChargedMoves?: number[];
  gmaxMove?: number;
}

export interface MaxDpsInput {
  type?: string;
  adventureEffects?: boolean;
}

export interface MaxDpsRow {
  pokemon: string;
  form: string;
  level: number;
  cp: number;
  move: number;
  dps: number;
  value: number;
}

export interface MaxDpsDisplayRow {
  pokemon: string;
  form: string;
  level: string;
  cp: string;
  move: string;
  dps: string;
  tdo: string;
}

export interface MaxBulkInput {
  type?: string;
}

export interface MaxBulkRow {
  pokemon: string;
  form: string;
  level: number;
  cp: number;
  bulk: number;
  value: number;
  fast: number;
  gmax?: number;
}

export interface MaxBulkDisplayRow {
  pokemon: string;
  form: string;
  level: string;
  cp: string;
  bulk: string;
  tdo: string;
  fast: string;
  gmax: string;
}

function resolveMoveTypeId(move: MasterfileMove | undefined): number | null {
  if (typeof move?.type === "number") {
    return move.type;
  }
  return move?.type?.typeId ?? null;
}

function resolveCarrierTypes(
  carrier: Pick<MaxBattleCarrier, "types"> | undefined,
  fallback: Pick<MaxBattleCarrier, "types"> | undefined
): MasterfileTypeRef[] {
  return Object.values(carrier?.types ?? fallback?.types ?? {});
}

function resolveCarrierMoveIds(
  carrier: MaxBattleCarrier,
  fallback: MaxBattleCarrier | undefined,
  baseKey: "quickMoves" | "chargedMoves",
  eliteKey: "eliteQuickMoves" | "eliteChargedMoves"
): number[] {
  return (carrier[baseKey] ?? fallback?.[baseKey] ?? []).concat(
    carrier[eliteKey] ?? fallback?.[eliteKey] ?? []
  );
}

function resolveStatsCarrier(
  carrier: MaxBattleCarrier,
  fallback: MaxBattleCarrier | undefined
): MaxBattleCarrier | undefined {
  return carrier.stats ? carrier : fallback;
}

function buildLevel50StatLine(stats: MasterfileStats): Level50StatLine {
  const multiplier = calculateCpMultiplier(FIXED_LEVEL);
  const attack = (stats.attack + FIXED_IV) * multiplier;
  const defense = (stats.defense + FIXED_IV) * multiplier;
  const hp = Math.max(10, Math.floor((stats.stamina + FIXED_IV) * multiplier));
  return {
    attack,
    defense,
    hp,
    value: attack * defense * hp,
    level: FIXED_LEVEL,
    cp: calculateCP(stats, FIXED_IV, FIXED_IV, FIXED_IV, FIXED_LEVEL)
  };
}

function applyAdventureEffect(entry: Level50StatLine, adventureEffect?: AdventureEffect): Level50StatLine {
  if (!adventureEffect) {
    return entry;
  }
  const result = { ...entry };
  if (adventureEffect.attack) {
    result.attack *= adventureEffect.attack;
    result.value *= adventureEffect.attack;
  }
  if (adventureEffect.defense) {
    result.value *= adventureEffect.defense;
  }
  return result;
}

function parseTypeFilterId(masterfile: Masterfile, typeName: string | undefined): number | null {
  const lookup = typeName?.trim();
  if (!lookup) {
    return null;
  }
  for (const type of Object.values(masterfile.types)) {
    if (type.typeName.localeCompare(lookup, undefined, { sensitivity: "accent" }) === 0) {
      return type.typeId > 0 ? type.typeId : null;
    }
  }
  return null;
}

function buildBulkResistanceMap(
  masterfile: Masterfile,
  typeName: string | undefined
): Record<number, number> {
  const lookup = typeName?.trim();
  if (!lookup) {
    return {};
  }
  for (const type of Object.values(masterfile.types)) {
    if (type.typeName.localeCompare(lookup, undefined, { sensitivity: "accent" }) !== 0) {
      continue;
    }
    if (type.typeId <= 0) {
      return {};
    }
    const result: Record<number, number> = {};
    for (const entry of type.strengths ?? []) {
      result[entry.typeId] = 0.625;
    }
    for (const entry of type.weakAgainst ?? []) {
      result[entry.typeId] = 1.6;
    }
    for (const entry of type.veryWeakAgainst ?? []) {
      result[entry.typeId] = 2.56;
    }
    return result;
  }
  return {};
}

function shouldCheckMaxDpsCarrier(carrier: MasterfileForm): boolean {
  return (
    carrier.stats !== undefined ||
    carrier.quickMoves !== undefined ||
    carrier.eliteQuickMoves !== undefined ||
    carrier.chargedMoves !== undefined ||
    carrier.eliteChargedMoves !== undefined ||
    carrier.types !== undefined ||
    carrier.gmaxMove !== undefined
  );
}

function shouldCheckMaxBulkCarrier(carrier: MasterfileForm): boolean {
  return (
    carrier.stats !== undefined ||
    carrier.quickMoves !== undefined ||
    carrier.eliteQuickMoves !== undefined ||
    carrier.types !== undefined
  );
}

function pushMaxDpsRows(
  rows: MaxDpsRow[],
  masterfile: Masterfile,
  typeFilterId: number | null,
  useAdventureEffects: boolean,
  adventureEffectPowerBonus: number,
  pokemonName: string,
  formName: string,
  carrier: MasterfilePokemon | MasterfileForm,
  pokemonData?: MasterfilePokemon
): void {
  if (pokemonData && !shouldCheckMaxDpsCarrier(carrier)) {
    return;
  }
  const statsCarrier = resolveStatsCarrier(carrier, pokemonData);
  if (!statsCarrier?.stats) {
    return;
  }
  const stabTypes = new Set(resolveCarrierTypes(carrier, pokemonData).map((type) => type.typeId));
  const addMove = (
    moveId: number,
    baseDps: number,
    moveTypeId: number | null,
    adventureEffect?: AdventureEffect,
    variantForm = formName
  ): void => {
    if (moveTypeId === null) {
      return;
    }
    const entry = applyAdventureEffect(buildLevel50StatLine(statsCarrier.stats as MasterfileStats), adventureEffect);
    let dps = baseDps;
    let value = entry.value;
    if (stabTypes.has(moveTypeId)) {
      dps *= STAB_MULTIPLIER;
    }
    value *= dps / DPS_VALUE_DIVISOR;
    dps *= entry.attack / ATTACK_DPS_DIVISOR;
    rows.push({
      pokemon: pokemonName,
      form: variantForm,
      level: entry.level,
      cp: entry.cp,
      move: moveId,
      dps,
      value
    });
  };

  const gmaxMoveId = carrier.gmaxMove;
  if (gmaxMoveId !== undefined) {
    const gmaxMove = masterfile.moves[String(gmaxMoveId)];
    const gmaxMoveTypeId = resolveMoveTypeId(gmaxMove);
    if ((pokemonName === "Zacian" || pokemonName === "Zamazenta") && formName.startsWith("Crowned")) {
      if (typeFilterId === null || gmaxMoveTypeId === typeFilterId) {
        addMove(gmaxMoveId, gmaxMove?.power ?? 0, gmaxMoveTypeId);
        const adventureEffect = useAdventureEffects ? BEHEMOTH_BLADE_ADVENTURE_EFFECTS[formName] : undefined;
        if (adventureEffect !== undefined) {
          addMove(gmaxMoveId, gmaxMove?.power ?? 0, gmaxMoveTypeId, adventureEffect, adventureEffect.form);
        }
      }
      return;
    }
    if (pokemonName === "Eternatus" && formName !== "Eternamax") {
      if (typeFilterId === null || gmaxMoveTypeId === typeFilterId) {
        addMove(
          gmaxMoveId,
          (gmaxMove?.power ?? 0) + adventureEffectPowerBonus,
          gmaxMoveTypeId
        );
      }
      return;
    }
    if (typeFilterId === null || gmaxMoveTypeId === typeFilterId) {
      addMove(
        gmaxMoveId,
        (gmaxMove?.power ?? 0) + adventureEffectPowerBonus,
        gmaxMoveTypeId
      );
      if (typeFilterId !== null) {
        return;
      }
    }
  }

  for (const quickMoveId of resolveCarrierMoveIds(carrier, pokemonData, "quickMoves", "eliteQuickMoves")) {
    if (quickMoveId === STRUGGLE_MOVE_ID) {
      return;
    }
    const quickMove = masterfile.moves[String(quickMoveId)];
    const quickMoveTypeId = resolveMoveTypeId(quickMove);
    if (typeFilterId === null || quickMoveTypeId === typeFilterId) {
      addMove(
        quickMoveId,
        MAX_MOVE_DPS + adventureEffectPowerBonus,
        quickMoveTypeId
      );
      if (typeFilterId !== null) {
        return;
      }
    }
  }
}

function pushMaxBulkRow(
  rows: MaxBulkRow[],
  masterfile: Masterfile,
  resistances: Record<number, number>,
  pokemonName: string,
  formName: string,
  carrier: MasterfilePokemon | MasterfileForm,
  pokemonData?: MasterfilePokemon,
  hpShield = DEFAULT_HP_SHIELD,
  adventureEffect?: AdventureEffect
): void {
  if (pokemonData && !shouldCheckMaxBulkCarrier(carrier)) {
    return;
  }
  const statsCarrier = resolveStatsCarrier(carrier, pokemonData);
  if (!statsCarrier?.stats) {
    return;
  }
  const entry = buildLevel50StatLine(statsCarrier.stats as MasterfileStats);
  let attack = entry.attack;
  let defense = entry.defense;
  if (adventureEffect?.attack) {
    attack *= adventureEffect.attack;
  }
  if (adventureEffect?.defense) {
    defense *= adventureEffect.defense;
  }
  if (!formName.startsWith("Crowned")) {
    hpShield += ADVENTURE_EFFECT_HP_SHIELD_BONUS;
  }
  let bulk = defense * (entry.hp + hpShield) * 0.001;
  for (const type of resolveCarrierTypes(carrier, pokemonData)) {
    const multiplier = resistances[type.typeId];
    if (multiplier) {
      bulk *= multiplier;
    }
  }
  let fastestMove = Number.POSITIVE_INFINITY;
  for (const quickMoveId of resolveCarrierMoveIds(carrier, pokemonData, "quickMoves", "eliteQuickMoves")) {
    if (quickMoveId === STRUGGLE_MOVE_ID) {
      return;
    }
    const durationMs = masterfile.moves[String(quickMoveId)]?.durationMs;
    if (durationMs !== undefined) {
      fastestMove = Math.min(fastestMove, durationMs);
    }
  }
  if (!isFinite(fastestMove)) {
    return;
  }
  rows.push({
    pokemon: pokemonName,
    form: formName,
    level: entry.level,
    cp: entry.cp,
    bulk,
    value: bulk * attack,
    fast: fastestMove,
    gmax: carrier.gmaxMove
  });
}

export function listMaxBattleTypeNames(masterfile: Masterfile): string[] {
  return Object.values(masterfile.types)
    .filter((type) => type.typeId > 0)
    .sort((left, right) => left.typeId - right.typeId)
    .map((type) => type.typeName);
}

export function buildMaxDpsRows(masterfile: Masterfile, input: MaxDpsInput = {}): MaxDpsRow[] {
  const rows: MaxDpsRow[] = [];
  const typeFilterId = parseTypeFilterId(masterfile, input.type);
  const useAdventureEffects = input.adventureEffects !== false;
  const adventureEffectPowerBonus = useAdventureEffects ? ADVENTURE_EFFECT_POWER_BONUS : 0;
  for (const pokemon of Object.values(masterfile.pokemon)) {
    pushMaxDpsRows(
      rows,
      masterfile,
      typeFilterId,
      useAdventureEffects,
      adventureEffectPowerBonus,
      pokemon.name,
      "",
      pokemon
    );
    for (const form of Object.values(pokemon.forms ?? {})) {
      pushMaxDpsRows(
        rows,
        masterfile,
        typeFilterId,
        useAdventureEffects,
        adventureEffectPowerBonus,
        pokemon.name,
        form.name ?? "",
        form,
        pokemon
      );
    }
  }
  rows.sort((left, right) => right.dps - left.dps || right.value - left.value);
  return rows;
}

export function buildMaxBulkRows(masterfile: Masterfile, input: MaxBulkInput = {}): MaxBulkRow[] {
  const rows: MaxBulkRow[] = [];
  const resistances = buildBulkResistanceMap(masterfile, input.type);
  for (const pokemon of Object.values(masterfile.pokemon)) {
    if (
      pokemon.name !== "Zacian" &&
      pokemon.name !== "Zamazenta" &&
      pokemon.name !== "Urshifu"
    ) {
      pushMaxBulkRow(rows, masterfile, resistances, pokemon.name, "", pokemon);
    }
    for (const form of Object.values(pokemon.forms ?? {})) {
      if (form.name === "Complete Ten Percent") {
        continue;
      }
      pushMaxBulkRow(rows, masterfile, resistances, pokemon.name, form.name ?? "", form, pokemon);
      if (form.name === "Crowned Shield") {
        pushMaxBulkRow(rows, masterfile, resistances, pokemon.name, "Crowned 4x", form, pokemon, 240);
      }
      if (form.name === "Crowned Sword" || form.name === "Crowned Shield") {
        const adventureEffect = BEHEMOTH_BASH_ADVENTURE_EFFECTS[form.name];
        if (adventureEffect) {
          pushMaxBulkRow(
            rows,
            masterfile,
            resistances,
            pokemon.name,
            adventureEffect.form,
            form,
            pokemon,
            DEFAULT_HP_SHIELD,
            adventureEffect
          );
        }
        if (form.name === "Crowned Shield") {
          const crowned4xEffect = BEHEMOTH_BASH_ADVENTURE_EFFECTS["Crowned 4x"];
          pushMaxBulkRow(
            rows,
            masterfile,
            resistances,
            pokemon.name,
            crowned4xEffect.form,
            form,
            pokemon,
            240,
            crowned4xEffect
          );
        }
      }
    }
  }
  rows.sort((left, right) => right.bulk - left.bulk || right.value - left.value);
  return rows;
}

export function formatMaxDpsRow(masterfile: Masterfile, row: MaxDpsRow): MaxDpsDisplayRow {
  return {
    pokemon: row.pokemon,
    form: row.form,
    level: String(row.level),
    cp: String(row.cp),
    move: masterfile.moves[String(row.move)]?.name ?? "",
    dps: row.dps.toFixed(2),
    tdo: row.value.toFixed(2)
  };
}

export function formatMaxBulkRow(row: MaxBulkRow): MaxBulkDisplayRow {
  return {
    pokemon: row.pokemon,
    form: row.form,
    level: String(row.level),
    cp: String(row.cp),
    bulk: row.bulk.toFixed(2),
    tdo: row.value.toFixed(2),
    fast: String(row.fast / 500),
    gmax: row.gmax === undefined ? "" : "✓"
  };
}
