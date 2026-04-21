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

let pendingFetch: Promise<Masterfile> | null = null;

function ensureEliteChargedMoves(
  target: Pick<MasterfilePokemon, "eliteChargedMoves"> | Pick<MasterfileForm, "eliteChargedMoves">,
  moveIds: number[]
): void {
  const existing = new Set(target.eliteChargedMoves ?? []);
  for (const moveId of moveIds) {
    existing.add(moveId);
  }
  target.eliteChargedMoves = Array.from(existing);
}

export function applyMasterfilePatches(masterfile: Masterfile): Masterfile {
  for (const patch of ELITE_CHARGED_MOVE_PATCHES) {
    const pokemon = masterfile.pokemon[String(patch.pokemonId)];
    if (!pokemon) {
      continue;
    }
    if (patch.formId === undefined) {
      ensureEliteChargedMoves(pokemon, patch.moveIds);
      continue;
    }
    const form = pokemon.forms?.[String(patch.formId)];
    if (!form) {
      continue;
    }
    ensureEliteChargedMoves(form, patch.moveIds);
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
