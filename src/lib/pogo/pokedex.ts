import { loadMasterfile, type Masterfile, type MasterfileEvolutionRef, type MasterfileFormChange, type MasterfilePokemon, type MasterfileStats, type MasterfileTempEvolution } from "./masterfile";

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

interface JudgeCatalogNode {
  key: string;
  pokemonId: number;
  formId: number;
  value: string;
  stats: string;
  megaStats: string[];
  evolutions: string[];
  formChanges: string[];
}

const TEMP_EVOLUTION_NAMES = ["Unset", "Mega", "Mega X", "Mega Y", "Primal", "Mega Z"];

function getKey(pokemonId: number, formId = 0): string {
  return `${pokemonId}:${formId}`;
}

function formatPokemonLabel(pokemonId: number, name: string): string {
  return `#${pokemonId}: ${name}`;
}

function resolveStats(carrier: { stats?: MasterfileStats; attack?: number; defense?: number; stamina?: number } | undefined): string | null {
  const stats = carrier?.stats ?? carrier;
  if (!(stats?.attack && stats.defense && stats.stamina)) {
    return null;
  }
  return `${stats.attack}/${stats.defense}/${stats.stamina}`;
}

function pushEntry(
  entries: PokedexEntry[],
  pokemonId: string,
  pokemonName: string,
  statsCarrier: { stats?: MasterfileStats; attack?: number; defense?: number; stamina?: number },
  name: string | null
): void {
  const statsValue = resolveStats(statsCarrier);
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

function evolutionRefs(evolutions: Record<string, MasterfileEvolutionRef> | undefined): MasterfileEvolutionRef[] {
  return Object.values(evolutions ?? {});
}

function formChangeTargetFormIds(formChanges: MasterfileFormChange[] | undefined): number[] {
  const targetFormIds = new Set<number>();
  for (const formChange of formChanges ?? []) {
    for (const formId of formChange.availableForms ?? []) {
      targetFormIds.add(formId);
    }
    for (const attribute of formChange.formChangeBonusAttributes ?? []) {
      if (attribute.targetForm !== undefined) {
        targetFormIds.add(attribute.targetForm);
      }
    }
  }
  return Array.from(targetFormIds);
}

export function normalizeMasterfile(masterfile: Masterfile): PokedexEntry[] {
  const entries: PokedexEntry[] = [];
  for (const [pokemonId, pokemon] of Object.entries(masterfile.pokemon)) {
    const pokemonName = pokemon.name ?? `Pokemon ${pokemonId}`;
    pushEntry(entries, pokemonId, pokemonName, pokemon, null);
    for (const form of Object.values(pokemon.forms ?? {})) {
      pushEntry(entries, pokemonId, pokemonName, form, form.name ?? "undefined");
    }
    for (const [tempEvolutionId, tempEvolution] of Object.entries(pokemon.tempEvolutions ?? {})) {
      pushEntry(
        entries,
        pokemonId,
        pokemonName,
        tempEvolution,
        TEMP_EVOLUTION_NAMES[Number(tempEvolutionId)] ?? "undefined"
      );
    }
  }
  return entries;
}

function isJudgePickerForm(
  form: {
    isCostume?: boolean;
    stats?: MasterfileStats;
    attack?: number;
    defense?: number;
    stamina?: number;
    formChanges?: MasterfileFormChange[];
    evolutions?: Record<string, MasterfileEvolutionRef>;
    tempEvolutions?: Record<string, MasterfileTempEvolution>;
  },
  isDefaultForm: boolean
): boolean {
  if (form.isCostume) {
    return false;
  }
  if (isDefaultForm) {
    return true;
  }
  return Boolean(
    resolveStats(form) ||
    formChangeTargetFormIds(form.formChanges).length ||
    evolutionRefs(form.evolutions).length ||
    Object.keys(form.tempEvolutions ?? {}).length
  );
}

function getFormLabel(
  pokemonName: string,
  form: { name?: string } | undefined,
  isDefaultForm: boolean
): string {
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
  const tempEvolutions = form?.tempEvolutions ?? pokemon.tempEvolutions ?? {};
  const result: string[] = [];
  for (const [tempEvolutionId, tempEvolution] of Object.entries(tempEvolutions)) {
    const stats =
      resolveStats(tempEvolution) ?? resolveStats(pokemon.tempEvolutions?.[tempEvolutionId]);
    if (stats !== null) {
      result.push(stats);
    }
  }
  return result;
}

function resolveEvolutionRefs(pokemon: MasterfilePokemon, formId: number): MasterfileEvolutionRef[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  return evolutionRefs(form?.evolutions ?? pokemon.evolutions);
}

function resolveFormChangeTargetKeys(masterfile: Masterfile, pokemon: MasterfilePokemon, formId: number): string[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  const isDefaultForm = formId === (pokemon.defaultFormId ?? 0);
  const formChanges = form?.formChanges ?? (isDefaultForm ? pokemon.formChanges : undefined);
  return formChangeTargetFormIds(formChanges).map((targetFormId) =>
    resolveEntryKey(masterfile, pokemon.pokedexId, targetFormId)
  );
}

function resolveEntryKey(masterfile: Masterfile, pokemonId: number, formId = 0): string {
  const pokemon = masterfile.pokemon[String(pokemonId)];
  const defaultFormId = pokemon?.defaultFormId ?? 0;
  return getKey(pokemonId, formId || defaultFormId);
}

function buildJudgeNodes(masterfile: Masterfile): JudgeCatalogNode[] {
  const nodes: JudgeCatalogNode[] = [];
  for (const [pokemonId, pokemon] of Object.entries(masterfile.pokemon)) {
    const numericId = Number(pokemonId);
    const pokemonName = pokemon.name ?? `Pokemon ${pokemonId}`;
    const defaultFormId = pokemon.defaultFormId ?? 0;
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
          evolutions: [],
          formChanges: []
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
        evolutions: [],
        formChanges: []
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
    for (const formChangeKey of resolveFormChangeTargetKeys(masterfile, pokemon, node.formId)) {
      if (nodeByKey[formChangeKey] && !node.formChanges.includes(formChangeKey)) {
        node.formChanges.push(formChangeKey);
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
  for (const formChangeKey of node.formChanges) {
    collectFamilyStats(formChangeKey, nodeByKey, visitedNodes, seenStats, result);
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

export async function loadPokemonCatalog(
): Promise<PokemonCatalog> {
  return buildPokemonCatalog(await loadMasterfile());
}
