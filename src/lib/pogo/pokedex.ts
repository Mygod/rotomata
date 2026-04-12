export interface PokedexEntry {
  id: number;
  name: string;
  at: number;
  df: number;
  st: number;
}

export interface JudgePickerEntry {
  key: string;
  value: string;
  stats: string;
  familyStats: string[];
}

export interface PokemonCatalog {
  statEntries: PokedexEntry[];
  judgeEntries: JudgePickerEntry[];
}

interface EvolutionRef {
  pokemon: number;
  form?: number;
}

interface StatsCarrier {
  attack?: number;
  defense?: number;
  stamina?: number;
  name?: string;
}

interface MasterfileForm extends StatsCarrier {
  is_costume?: boolean;
  evolutions?: EvolutionRef[];
  temp_evolutions?: Record<string, StatsCarrier>;
}

interface MasterfilePokemon extends StatsCarrier {
  default_form_id?: number;
  forms?: Record<string, MasterfileForm>;
  evolutions?: EvolutionRef[];
  temp_evolutions?: Record<string, StatsCarrier>;
}

interface Masterfile {
  pokemon: Record<string, MasterfilePokemon>;
}

interface CachedCatalog {
  fetchedAt: number;
  catalog: PokemonCatalog;
}

interface JudgeCatalogNode {
  key: string;
  pokemonId: number;
  formId: number;
  value: string;
  stats: string;
  megaStats: string[];
  evolutions: string[];
}

const MASTERFILE_URL =
  "https://cdn.jsdelivr.net/gh/WatWowMap/Masterfile-Generator@master/master-latest.json";
const CACHE_KEY = "rotomata:pokemon-catalog:v2";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TEMP_EVOLUTION_NAMES = ["Unset", "Mega", "Mega X", "Mega Y", "Primal", "Mega Z"];

function getKey(pokemonId: number, formId = 0): string {
  return `${pokemonId}:${formId}`;
}

function formatPokemonLabel(pokemonId: number, name: string): string {
  return `#${pokemonId}: ${name}`;
}

function resolveStats(carrier: StatsCarrier | undefined): string | null {
  if (!(carrier?.attack && carrier.defense && carrier.stamina)) {
    return null;
  }
  return `${carrier.attack}/${carrier.defense}/${carrier.stamina}`;
}

function pushEntry(entries: PokedexEntry[], pokemonId: string, pokemonName: string, stats: StatsCarrier, name: string | null): void {
  const statsValue = resolveStats(stats);
  if (statsValue === null) {
    return;
  }
  const [at, df, st] = statsValue.split("/").map(Number);
  entries.push({
    id: Number(pokemonId),
    name: name === null ? pokemonName : `${pokemonName} (${name})`,
    at,
    df,
    st
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

function isJudgePickerForm(form: MasterfileForm, isDefaultForm: boolean): boolean {
  if (form.is_costume) {
    return false;
  }
  if (isDefaultForm) {
    return true;
  }
  return Boolean(
    resolveStats(form) ||
      (form.evolutions && form.evolutions.length) ||
      (form.temp_evolutions && Object.keys(form.temp_evolutions).length)
  );
}

function getFormLabel(pokemonName: string, form: MasterfileForm | undefined, isDefaultForm: boolean): string {
  if (!form || isDefaultForm || !form.name || form.name === "Normal") {
    return pokemonName;
  }
  return `${pokemonName} (${form.name})`;
}

function resolveFormStats(pokemon: MasterfilePokemon, formId: number): string | null {
  if (!formId) {
    return resolveStats(pokemon);
  }
  const form = pokemon.forms?.[String(formId)];
  return resolveStats(form) ?? resolveStats(pokemon);
}

function resolveMegaStats(pokemon: MasterfilePokemon, formId: number): string[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  const tempEvolutions = form?.temp_evolutions ?? pokemon.temp_evolutions ?? {};
  const result: string[] = [];
  for (const [tempEvolutionId, tempEvolution] of Object.entries(tempEvolutions)) {
    const stats = resolveStats(tempEvolution) ?? resolveStats(pokemon.temp_evolutions?.[tempEvolutionId]);
    if (stats !== null) {
      result.push(stats);
    }
  }
  return result;
}

function resolveEvolutionRefs(pokemon: MasterfilePokemon, formId: number): EvolutionRef[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  return form?.evolutions ?? pokemon.evolutions ?? [];
}

function resolveEntryKey(masterfile: Masterfile, pokemonId: number, formId = 0): string {
  const pokemon = masterfile.pokemon[String(pokemonId)];
  const defaultFormId = pokemon?.default_form_id ?? 0;
  return getKey(pokemonId, formId || defaultFormId);
}

function buildJudgeNodes(masterfile: Masterfile): JudgeCatalogNode[] {
  const nodes: JudgeCatalogNode[] = [];
  for (const [pokemonId, pokemon] of Object.entries(masterfile.pokemon)) {
    const numericId = Number(pokemonId);
    const pokemonName = pokemon.name ?? `Pokemon ${pokemonId}`;
    const defaultFormId = pokemon.default_form_id ?? 0;
    const forms = pokemon.forms ?? {};
    if (!Object.keys(forms).length) {
      const stats = resolveStats(pokemon);
      if (stats !== null) {
        nodes.push({
          key: getKey(numericId, 0),
          pokemonId: numericId,
          formId: 0,
          value: formatPokemonLabel(numericId, pokemonName),
          stats,
          megaStats: resolveMegaStats(pokemon, 0),
          evolutions: []
        });
      }
      continue;
    }
    for (const [formId, form] of Object.entries(forms)) {
      const numericFormId = Number(formId);
      const isDefaultForm = numericFormId === defaultFormId;
      if (!isJudgePickerForm(form, isDefaultForm)) {
        continue;
      }
      const stats = resolveFormStats(pokemon, numericFormId);
      if (stats === null) {
        continue;
      }
      nodes.push({
        key: getKey(numericId, numericFormId),
        pokemonId: numericId,
        formId: numericFormId,
        value: formatPokemonLabel(numericId, getFormLabel(pokemonName, form, isDefaultForm)),
        stats,
        megaStats: resolveMegaStats(pokemon, numericFormId),
        evolutions: []
      });
    }
  }
  const nodeByKey = Object.fromEntries(nodes.map((node) => [node.key, node] as const));
  for (const node of nodes) {
    const pokemon = masterfile.pokemon[String(node.pokemonId)];
    for (const evolution of resolveEvolutionRefs(pokemon, node.formId)) {
      const key = resolveEntryKey(masterfile, evolution.pokemon, evolution.form ?? 0);
      if (nodeByKey[key]) {
        node.evolutions.push(key);
      }
    }
  }
  return nodes;
}

function uniquePush(items: string[], seen: Set<string>, value: string | null): void {
  if (value === null || seen.has(value)) {
    return;
  }
  seen.add(value);
  items.push(value);
}

function collectFamilyStats(
  key: string,
  nodeByKey: Record<string, JudgeCatalogNode>,
  visitedNodes: Set<string>,
  seenStats: Set<string>,
  result: string[]
): void {
  if (visitedNodes.has(key)) {
    return;
  }
  visitedNodes.add(key);
  const node = nodeByKey[key];
  if (!node) {
    return;
  }
  uniquePush(result, seenStats, node.stats);
  for (const megaStat of node.megaStats) {
    uniquePush(result, seenStats, megaStat);
  }
  for (const evolutionKey of node.evolutions) {
    collectFamilyStats(evolutionKey, nodeByKey, visitedNodes, seenStats, result);
  }
}

export function buildPokemonCatalog(masterfile: Masterfile): PokemonCatalog {
  const statEntries = normalizeMasterfile(masterfile);
  const judgeNodes = buildJudgeNodes(masterfile);
  const nodeByKey = Object.fromEntries(judgeNodes.map((node) => [node.key, node] as const));
  return {
    statEntries,
    judgeEntries: judgeNodes.map((node) => {
      const familyStats: string[] = [];
      collectFamilyStats(node.key, nodeByKey, new Set<string>(), new Set<string>(), familyStats);
      return {
        key: node.key,
        value: node.value,
        stats: node.stats,
        familyStats
      };
    })
  };
}

function readCachedCatalog(): CachedCatalog | null {
  try {
    const cachedRaw = localStorage.getItem(CACHE_KEY);
    if (!cachedRaw) {
      return null;
    }
    const parsed = JSON.parse(cachedRaw) as CachedCatalog;
    if (!parsed.catalog || !Array.isArray(parsed.catalog.statEntries) || !Array.isArray(parsed.catalog.judgeEntries)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedCatalog(catalog: PokemonCatalog): void {
  try {
    const payload: CachedCatalog = {
      fetchedAt: Date.now(),
      catalog
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore cache write failures.
  }
}

async function fetchPokemonCatalog(): Promise<PokemonCatalog> {
  const response = await fetch(MASTERFILE_URL, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch masterfile: ${response.status}`);
  }
  const masterfile = (await response.json()) as Masterfile;
  const catalog = buildPokemonCatalog(masterfile);
  writeCachedCatalog(catalog);
  return catalog;
}

export async function loadPokemonCatalog(
  onRefresh?: (catalog: PokemonCatalog) => void
): Promise<{ catalog: PokemonCatalog; source: "cache" | "network" }> {
  const cached = readCachedCatalog();
  if (cached) {
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) {
      void fetchPokemonCatalog()
        .then((catalog) => {
          onRefresh?.(catalog);
        })
        .catch(() => {
          // Keep using cached data silently if the refresh fails.
        });
    }
    return {
      catalog: cached.catalog,
      source: "cache"
    };
  }
  const catalog = await fetchPokemonCatalog();
  return {
    catalog,
    source: "network"
  };
}
