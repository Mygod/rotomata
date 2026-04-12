export interface PokedexEntry {
  id: number;
  name: string;
  at: number;
  df: number;
  st: number;
}

interface MasterfilePokemon {
  name?: string;
  attack?: number;
  defense?: number;
  stamina?: number;
  forms?: Record<string, MasterfilePokemon>;
  temp_evolutions?: Record<string, MasterfilePokemon>;
}

interface Masterfile {
  pokemon: Record<string, MasterfilePokemon>;
}

interface CachedPokedex {
  fetchedAt: number;
  entries: PokedexEntry[];
}

const MASTERFILE_URL =
  "https://cdn.jsdelivr.net/gh/WatWowMap/Masterfile-Generator@master/master-latest.json";
const CACHE_KEY = "rotomata:pokedex:v1";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TEMP_EVOLUTION_NAMES = ["Unset", "Mega", "Mega X", "Mega Y", "Primal", "Mega Z"];

function pushEntry(entries: PokedexEntry[], pokemonId: string, pokemonName: string, stats: MasterfilePokemon, name: string | null): void {
  if (!(stats.attack && stats.defense && stats.stamina)) {
    return;
  }
  entries.push({
    id: Number(pokemonId),
    name: name === null ? pokemonName : `${pokemonName} (${name})`,
    at: stats.attack,
    df: stats.defense,
    st: stats.stamina
  });
}

export function normalizeMasterfile(masterfile: Masterfile): PokedexEntry[] {
  const entries: PokedexEntry[] = [];
  for (const [pokemonId, pokemon] of Object.entries(masterfile.pokemon)) {
    const pokemonName = pokemon.name ?? `Pokemon ${pokemonId}`;
    pushEntry(entries, pokemonId, pokemonName, pokemon, null);
    for (const form of Object.values(pokemon.forms ?? {})) {
      pushEntry(entries, pokemonId, pokemonName, form, form.name ?? "undefined");
    }
    for (const [tempEvolutionId, tempEvolution] of Object.entries(pokemon.temp_evolutions ?? {})) {
      pushEntry(
        entries,
        pokemonId,
        pokemonName,
        tempEvolution,
        TEMP_EVOLUTION_NAMES[Number(tempEvolutionId)] ?? tempEvolution.name ?? "undefined"
      );
    }
  }
  return entries;
}

function readCachedPokedex(): CachedPokedex | null {
  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (!cachedRaw) {
      return null;
    }
    const parsed = JSON.parse(cachedRaw) as CachedPokedex;
    if (!Array.isArray(parsed.entries) || typeof parsed.fetchedAt !== "number") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedPokedex(entries: PokedexEntry[]): void {
  try {
    const payload: CachedPokedex = {
      fetchedAt: Date.now(),
      entries
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

async function fetchPokedex(): Promise<PokedexEntry[]> {
  const response = await fetch(MASTERFILE_URL, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch masterfile: ${response.status}`);
  }
  const masterfile = (await response.json()) as Masterfile;
  const entries = normalizeMasterfile(masterfile);
  writeCachedPokedex(entries);
  return entries;
}

export async function loadPokedex(
  onRefresh?: (entries: PokedexEntry[]) => void
): Promise<{ entries: PokedexEntry[]; source: "cache" | "network" }> {
  const cached = readCachedPokedex();
  if (cached) {
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      void fetchPokedex()
        .then((entries) => {
          onRefresh?.(entries);
        })
        .catch(() => {
          // Keep using cached data silently if the refresh fails.
        });
    }
    return {
      entries: cached.entries,
      source: "cache"
    };
  }
  const entries = await fetchPokedex();
  return {
    entries,
    source: "network"
  };
}
