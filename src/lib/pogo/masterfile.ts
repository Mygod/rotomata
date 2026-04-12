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
  weaknesses: MasterfileTypeRef[];
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

export interface MasterfileForm {
  name?: string;
  form?: number;
  isCostume?: boolean;
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
  evolutions?: Record<string, MasterfileEvolutionRef>;
  tempEvolutions?: Record<string, MasterfileTempEvolution>;
}

export interface MasterfilePokemon {
  name: string;
  pokedexId: number;
  defaultFormId?: number;
  stats?: MasterfileStats;
  types?: Record<string, MasterfileTypeRef>;
  forms?: Record<string, MasterfileForm>;
  evolutions?: Record<string, MasterfileEvolutionRef>;
  tempEvolutions?: Record<string, MasterfileTempEvolution>;
  legendary?: boolean;
  mythic?: boolean;
  ultraBeast?: boolean;
}

export interface Masterfile {
  pokemon: Record<string, MasterfilePokemon>;
  types: Record<string, MasterfileTypeEntry>;
}

interface CachedMasterfile {
  fetchedAt: number;
  masterfile: Masterfile;
}

const MASTERFILE_URL =
  "https://cdn.jsdelivr.net/gh/WatWowMap/Masterfile-Generator@master/master-latest-everything.json";
const CACHE_KEY = "rotomata:masterfile:everything:v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

let pendingFetch: Promise<Masterfile> | null = null;

function readCachedMasterfile(): CachedMasterfile | null {
  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (!cachedRaw) {
      return null;
    }
    const parsed = JSON.parse(cachedRaw) as CachedMasterfile;
    if (!parsed.masterfile?.pokemon || !parsed.masterfile?.types) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedMasterfile(masterfile: Masterfile): void {
  try {
    const payload: CachedMasterfile = {
      fetchedAt: Date.now(),
      masterfile
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

async function fetchMasterfile(): Promise<Masterfile> {
  if (pendingFetch) {
    return pendingFetch;
  }
  pendingFetch = fetch(MASTERFILE_URL, {
    cache: "no-store"
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch masterfile: ${response.status}`);
      }
      const masterfile = (await response.json()) as Masterfile;
      writeCachedMasterfile(masterfile);
      return masterfile;
    })
    .finally(() => {
      pendingFetch = null;
    });
  return pendingFetch;
}

export async function loadMasterfile(
  onRefresh?: (masterfile: Masterfile) => void
): Promise<{ masterfile: Masterfile; source: "cache" | "network" }> {
  const cached = readCachedMasterfile();
  if (cached) {
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      void fetchMasterfile()
        .then((masterfile) => {
          onRefresh?.(masterfile);
        })
        .catch(() => {
          // Keep using cached data silently if the refresh fails.
        });
    }
    return {
      masterfile: cached.masterfile,
      source: "cache"
    };
  }
  const masterfile = await fetchMasterfile();
  return {
    masterfile,
    source: "network"
  };
}
