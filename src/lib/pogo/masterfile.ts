export interface MasterfileStats {
  attack: number;
  defense: number;
  stamina: number;
}

export interface MasterfileTypeRef {
  typeId: number;
  typeName: string;
}

export interface MasterfileTypeEntry extends MasterfileTypeRef {
  strengths?: MasterfileTypeRef[];
  weaknesses: MasterfileTypeRef[];
  veryWeakAgainst?: MasterfileTypeRef[];
  immunes?: MasterfileTypeRef[];
  weakAgainst?: MasterfileTypeRef[];
  resistances?: MasterfileTypeRef[];
}

export interface MasterfileEvolutionRef {
  pokemon: number;
  form?: number;
}

export interface MasterfileTempEvolution {
  tempEvoId?: number | string;
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
}

export interface MasterfileFormChangeBonusAttribute {
  targetForm?: number;
}

export interface MasterfileFormChangeComponentPokemonSettings {
  pokedexId?: number;
  formId?: number;
  formChangeType?: string;
}

export interface MasterfileFormChange {
  availableForms?: number[];
  componentPokemonSettings?: MasterfileFormChangeComponentPokemonSettings;
  formChangeBonusAttributes?: MasterfileFormChangeBonusAttribute[];
}

export interface MasterfileForm {
  name?: string;
  form?: number;
  isCostume?: boolean;
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
  quickMoves?: number[];
  chargedMoves?: number[];
  eliteQuickMoves?: number[];
  eliteChargedMoves?: number[];
  gmaxMove?: number;
  formChanges?: MasterfileFormChange[];
  evolutions?: Record<string, MasterfileEvolutionRef>;
  tempEvolutions?: Record<string, MasterfileTempEvolution>;
  purificationDust?: number;
}

export interface MasterfilePokemon {
  name: string;
  pokedexId: number;
  defaultFormId?: number;
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
  quickMoves?: number[];
  chargedMoves?: number[];
  eliteQuickMoves?: number[];
  eliteChargedMoves?: number[];
  gmaxMove?: number;
  formChanges?: MasterfileFormChange[];
  forms?: Record<string, MasterfileForm>;
  evolutions?: Record<string, MasterfileEvolutionRef>;
  tempEvolutions?: Record<string, MasterfileTempEvolution>;
  legendary?: boolean;
  mythic?: boolean;
  ultraBeast?: boolean;
  purificationDust?: number;
}

export interface MasterfileMoveBuff {
  attackerAttackStatStageChange?: number;
  targetDefenseStatStageChange?: number;
  buffActivationChance?: number;
}

export interface MasterfileMove {
  id: number;
  name: string;
  proto?: string;
  fast?: boolean;
  type?: number | MasterfileTypeRef;
  power?: number;
  durationMs?: number;
  pvpPower?: number;
  pvpDurationTurns?: number;
  pvpEnergyDelta?: number;
  pvpBuffs?: MasterfileMoveBuff[];
}

export interface Masterfile {
  pokemon: Record<string, MasterfilePokemon>;
  types: Record<string, MasterfileTypeEntry>;
  moves: Record<string, MasterfileMove>;
}

interface EliteChargedMovePatch {
  pokemonId: number;
  formId?: number;
  moveIds: number[];
}

type MoveListKey = "quickMoves" | "chargedMoves" | "eliteQuickMoves" | "eliteChargedMoves";

interface TemporaryMoveStatPatch {
  moveId: number;
  pvpPower?: number;
  pvpEnergyDelta?: number;
}

interface TemporaryLearnsetPatch {
  pokemonId: number;
  formId?: number;
  moveList: MoveListKey;
  moveIds: number[];
}

const MASTERFILE_URL =
  "https://raw.githubusercontent.com/WatWowMap/Masterfile-Generator/master/master-latest-rotomata.json";

const ELITE_CHARGED_MOVE_PATCHES: EliteChargedMovePatch[] = [
  { pokemonId: 384, moveIds: [384] },
  { pokemonId: 483, formId: 2829, moveIds: [394] },
  { pokemonId: 484, formId: 2830, moveIds: [388] },
  { pokemonId: 646, formId: 147, moveIds: [466] },
  { pokemonId: 646, formId: 148, moveIds: [467] },
  { pokemonId: 647, formId: 150, moveIds: [489] },
  { pokemonId: 800, formId: 2718, moveIds: [404] },
  { pokemonId: 800, formId: 2719, moveIds: [405] },
  { pokemonId: 888, formId: 2576, moveIds: [469] },
  { pokemonId: 889, formId: 2578, moveIds: [470] }
];

const TEMPORARY_MOVE_STAT_PATCHES: TemporaryMoveStatPatch[] = [
  { moveId: 46, pvpPower: 70, pvpEnergyDelta: -40 },
  { moveId: 36, pvpEnergyDelta: -65 },
  { moveId: 122, pvpEnergyDelta: -60 },
  { moveId: 384, pvpPower: 110, pvpEnergyDelta: -65 },
  { moveId: 304, pvpEnergyDelta: -50 },
  { moveId: 345, pvpEnergyDelta: 13 },
  { moveId: 320, pvpPower: 12 },
  { moveId: 13, pvpPower: 70 },
  { moveId: 273, pvpPower: 80, pvpEnergyDelta: -50 },
  { moveId: 262, pvpPower: 75 },
  { moveId: 31, pvpPower: 120 }
];

const TEMPORARY_LEARNSET_PATCHES: TemporaryLearnsetPatch[] = [
  { pokemonId: 705, moveList: "quickMoves", moveIds: [204] },
  { pokemonId: 18, moveList: "chargedMoves", moveIds: [80] },
  { pokemonId: 226, moveList: "chargedMoves", moveIds: [80] },
  { pokemonId: 352, moveList: "chargedMoves", moveIds: [77, 246] },
  { pokemonId: 428, moveList: "chargedMoves", moveIds: [77, 70] },
  { pokemonId: 683, moveList: "quickMoves", moveIds: [350] },
  { pokemonId: 700, moveList: "quickMoves", moveIds: [350] },
  { pokemonId: 809, moveList: "chargedMoves", moveIds: [246] },
  { pokemonId: 534, moveList: "quickMoves", moveIds: [462] },
  { pokemonId: 145, formId: 2800, moveList: "quickMoves", moveIds: [207] },
  { pokemonId: 914, moveList: "quickMoves", moveIds: [207] },
  { pokemonId: 166, moveList: "chargedMoves", moveIds: [364] },
  { pokemonId: 457, moveList: "quickMoves", moveIds: [345] },
  { pokemonId: 581, moveList: "quickMoves", moveIds: [345] },
  { pokemonId: 537, moveList: "chargedMoves", moveIds: [111] },
  { pokemonId: 705, moveList: "chargedMoves", moveIds: [131] },
  { pokemonId: 526, moveList: "quickMoves", moveIds: [325] },
  { pokemonId: 166, moveList: "quickMoves", moveIds: [368] },
  { pokemonId: 121, moveList: "chargedMoves", moveIds: [57] },
  { pokemonId: 141, moveList: "chargedMoves", moveIds: [57] },
  { pokemonId: 581, moveList: "chargedMoves", moveIds: [57] },
  { pokemonId: 230, moveList: "chargedMoves", moveIds: [284] },
  { pokemonId: 178, moveList: "chargedMoves", moveIds: [70] },
  { pokemonId: 211, moveList: "chargedMoves", moveIds: [70] },
  { pokemonId: 700, moveList: "chargedMoves", moveIds: [70] },
  { pokemonId: 464, moveList: "chargedMoves", moveIds: [46] }
];

let pendingFetch: Promise<Masterfile> | null = null;

function ensureMoveIds(
  target: MasterfilePokemon | MasterfileForm,
  moveList: MoveListKey,
  moveIds: number[]
): void {
  const existing = new Set(target[moveList] ?? []);
  for (const moveId of moveIds) {
    existing.add(moveId);
  }
  target[moveList] = Array.from(existing);
}

function resolvePatchTarget(
  masterfile: Masterfile,
  patch: Pick<EliteChargedMovePatch | TemporaryLearnsetPatch, "pokemonId" | "formId">
): MasterfilePokemon | MasterfileForm | null {
  const pokemon = masterfile.pokemon[String(patch.pokemonId)];
  if (!pokemon) {
    return null;
  }
  if (patch.formId === undefined) {
    return pokemon;
  }
  return pokemon.forms?.[String(patch.formId)] ?? null;
}

export function applyMasterfilePatches(masterfile: Masterfile): Masterfile {
  for (const patch of TEMPORARY_MOVE_STAT_PATCHES) {
    const move = masterfile.moves[String(patch.moveId)];
    if (!move) {
      continue;
    }
    if (patch.pvpPower !== undefined) {
      move.pvpPower = patch.pvpPower;
    }
    if (patch.pvpEnergyDelta !== undefined) {
      move.pvpEnergyDelta = patch.pvpEnergyDelta;
    }
  }
  for (const patch of ELITE_CHARGED_MOVE_PATCHES) {
    const target = resolvePatchTarget(masterfile, patch);
    if (!target) {
      continue;
    }
    ensureMoveIds(target, "eliteChargedMoves", patch.moveIds);
  }
  for (const patch of TEMPORARY_LEARNSET_PATCHES) {
    const target = resolvePatchTarget(masterfile, patch);
    if (!target) {
      continue;
    }
    ensureMoveIds(target, patch.moveList, patch.moveIds);
  }
  return masterfile;
}

async function fetchMasterfile(): Promise<Masterfile> {
  if (pendingFetch) {
    return pendingFetch;
  }
  pendingFetch = fetch(MASTERFILE_URL, {
    cache: "no-cache"
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch masterfile: ${response.status}`);
      }
      const masterfile = applyMasterfilePatches((await response.json()) as Masterfile);
      return masterfile;
    })
    .finally(() => {
      pendingFetch = null;
    });
  return pendingFetch;
}

export async function loadMasterfile(): Promise<Masterfile> {
  return fetchMasterfile();
}
