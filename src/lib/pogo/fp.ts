import { loadMasterfile, type Masterfile, type MasterfilePokemon, type MasterfileStats, type MasterfileTempEvolution } from "./masterfile";
import { calculateCpMultiplier, type BaseStats } from "./parity";

const REGULAR_LEVELS = [40, 50, 51] as const;
const MEGA_ONLY_LEVELS = [52, 53, 55] as const;
const FUNCTIONALLY_PERFECT_LEVELS = [50, 51, 52, 53, 55, 40] as const;
const TEMP_EVOLUTION_NAMES = ["Unset", "Mega", "Mega X", "Mega Y", "Primal", "Mega Z"];
const TEMP_EVOLUTION_PROTO_NAMES: Record<string, string> = {
  TEMP_EVOLUTION_MEGA: "Mega",
  TEMP_EVOLUTION_MEGA_X: "Mega X",
  TEMP_EVOLUTION_MEGA_Y: "Mega Y",
  TEMP_EVOLUTION_PRIMAL: "Primal"
};
const HIGHLIGHTED_POKEMON_NAMES = new Set(
  (
    "Gengar,Snorlax,Feraligatr,Walrein,Staraptor,Togekiss,Mamoswine,Porygon Z,Gigalith,Excadrill,Audino,Chandelure,Mandibuzz,Hydreigon,Volcarona,Reuniclus,Annihilape," +
    "Ditto,Tyranitar,Swampert,Honchkrow,Rhyperior,Rillaboom," +
    "Charizard,Golurk,Florges,Slitherwing,Sandyshocks,Ironbundle,Wochien,Screamtail,Brutebonnet,Ironthorns,Ironvaliant,Koraidon,Miraidon,Walking-wake"
  )
    .split(",")
    .map((name) => normalizeName(name))
);

export interface FunctionallyPerfectEntry {
  label: string;
  stats: string;
  href: string;
  highlighted: boolean;
}

export interface FunctionallyPerfectSection {
  level: number;
  heading: string;
  entries: FunctionallyPerfectEntry[];
}

interface TempEvolutionCandidate {
  label: string;
  stamina: number;
  statsList: BaseStats[];
  tempEvolutionSortId: number;
}

interface BaseCandidate {
  pokedexId: number;
  formId: number;
  label: string;
  stamina: number;
  statsList: BaseStats[];
  highlighted: boolean;
  tempEvolutions: TempEvolutionCandidate[];
}

interface CandidateEntry {
  pokedexId: number;
  formId: number;
  tempEvolutionSortId: number;
  label: string;
  stamina: number;
  statsList: BaseStats[];
  highlighted: boolean;
}

interface SortableFunctionallyPerfectEntry extends FunctionallyPerfectEntry {
  pokedexId: number;
  formId: number;
  tempEvolutionSortId: number;
}

interface RawTempEvolutionCandidate {
  stats: BaseStats;
  tempEvolutionName: string;
  tempEvolutionSortId: number;
}

interface RawBaseCandidate {
  pokedexId: number;
  formId: number;
  pokemonName: string;
  formName: string | null;
  stats: BaseStats;
  highlighted: boolean;
  tempEvolutions: RawTempEvolutionCandidate[];
}

function resolveStats(carrier: { stats?: MasterfileStats; attack?: number; defense?: number; stamina?: number } | undefined): BaseStats | null {
  const stats = carrier?.stats ?? carrier;
  if (!(stats?.attack && stats.defense && stats.stamina)) {
    return null;
  }
  return {
    attack: stats.attack,
    defense: stats.defense,
    stamina: stats.stamina
  };
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatStats(stats: BaseStats): string {
  return `${stats.attack}/${stats.defense}/${stats.stamina}`;
}

function formatStatsList(statsList: BaseStats[]): string {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const stats of statsList) {
    const value = formatStats(stats);
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    values.push(value);
  }
  return values.join(",");
}

function formatFormLabel(pokemonName: string, formName: string | undefined, isDefaultForm: boolean): string {
  if (isDefaultForm || !formName || formName === "Normal") {
    return pokemonName;
  }
  return `${pokemonName} (${formName})`;
}

function formatTempEvolutionLabel(tempEvolutionId: string, tempEvolution: MasterfileTempEvolution): string {
  const id = tempEvolution.tempEvoId ?? tempEvolutionId;
  if (typeof id === "number") {
    return TEMP_EVOLUTION_NAMES[id] ?? `Mega ${id}`;
  }
  const numericId = Number(id);
  if (!Number.isNaN(numericId)) {
    return TEMP_EVOLUTION_NAMES[numericId] ?? `Mega ${numericId}`;
  }
  return TEMP_EVOLUTION_PROTO_NAMES[id] ?? id.replace(/^TEMP_EVOLUTION_/, "").replaceAll("_", " ");
}

function resolveTempEvolutionSortId(tempEvolutionId: string, tempEvolution: MasterfileTempEvolution): number {
  const id = tempEvolution.tempEvoId ?? tempEvolutionId;
  if (typeof id === "number") {
    return id;
  }
  const numericId = Number(id);
  if (!Number.isNaN(numericId)) {
    return numericId;
  }
  return Object.keys(TEMP_EVOLUTION_PROTO_NAMES).indexOf(id) + 1 || Number.MAX_SAFE_INTEGER;
}

function resolveFormStats(pokemon: MasterfilePokemon, formId: number): BaseStats | null {
  if (!formId) {
    return resolveStats(pokemon);
  }
  return resolveStats(pokemon.forms?.[String(formId)]) ?? resolveStats(pokemon);
}

function hasEvolutions(pokemon: MasterfilePokemon, formId: number): boolean {
  if (!formId) {
    return Boolean(Object.keys(pokemon.evolutions ?? {}).length);
  }
  return Boolean(Object.keys(pokemon.forms?.[String(formId)]?.evolutions ?? {}).length);
}

function isHighlightedCandidate(pokemon: MasterfilePokemon, pokemonName: string, formId: number): boolean {
  return Boolean(
    HIGHLIGHTED_POKEMON_NAMES.has(normalizeName(pokemonName)) ||
    ((pokemon.legendary || pokemon.mythic || pokemon.ultraBeast) && !hasEvolutions(pokemon, formId))
  );
}

function resolveTempEvolutions(
  pokemon: MasterfilePokemon,
  formId: number,
): RawTempEvolutionCandidate[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  const tempEvolutions = form?.tempEvolutions ?? pokemon.tempEvolutions ?? {};
  const result: RawTempEvolutionCandidate[] = [];
  for (const [tempEvolutionId, tempEvolution] of Object.entries(tempEvolutions)) {
    const stats = resolveStats(tempEvolution) ?? resolveStats(pokemon.tempEvolutions?.[tempEvolutionId]);
    if (stats === null) {
      continue;
    }
    result.push({
      stats,
      tempEvolutionName: formatTempEvolutionLabel(tempEvolutionId, tempEvolution),
      tempEvolutionSortId: resolveTempEvolutionSortId(tempEvolutionId, tempEvolution)
    });
  }
  return result;
}

function collapseFormLabel(pokemonName: string, candidates: RawBaseCandidate[]): string {
  if (candidates.some((candidate) => candidate.formName === null)) {
    return pokemonName;
  }
  const formNames = Array.from(new Set(candidates.map((candidate) => candidate.formName).filter(Boolean)));
  return `${pokemonName} (${formNames.join(" / ")})`;
}

function collapseTempEvolutions(baseLabel: string, candidates: RawBaseCandidate[]): TempEvolutionCandidate[] {
  const grouped = new Map<string, RawTempEvolutionCandidate[]>();
  for (const candidate of candidates) {
    for (const tempEvolution of candidate.tempEvolutions) {
      const key = `${tempEvolution.tempEvolutionSortId}:${formatStats(tempEvolution.stats)}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.push(tempEvolution);
      } else {
        grouped.set(key, [tempEvolution]);
      }
    }
  }
  return Array.from(grouped.values())
    .map((group) => ({
      label: `${baseLabel} (${group[0].tempEvolutionName})`,
      stamina: group[0].stats.stamina,
      statsList: group.map((candidate) => candidate.stats),
      tempEvolutionSortId: group[0].tempEvolutionSortId
    }))
    .sort(
      (a, b) =>
        a.tempEvolutionSortId - b.tempEvolutionSortId ||
        a.label.localeCompare(b.label)
    );
}

function collapseBaseCandidates(candidates: RawBaseCandidate[]): BaseCandidate[] {
  const grouped = new Map<string, RawBaseCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.pokedexId}:${formatStats(candidate.stats)}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.push(candidate);
    } else {
      grouped.set(key, [candidate]);
    }
  }
  return Array.from(grouped.values())
    .map((group) => {
      group.sort((a, b) => a.formId - b.formId);
      const representative = group[0];
      const label = collapseFormLabel(representative.pokemonName, group);
      return {
        pokedexId: representative.pokedexId,
        formId: representative.formId,
        label,
        stamina: representative.stats.stamina,
        statsList: group.map((candidate) => candidate.stats),
        highlighted: group.some((candidate) => candidate.highlighted),
        tempEvolutions: collapseTempEvolutions(label, group)
      };
    })
    .sort((a, b) => a.pokedexId - b.pokedexId || a.formId - b.formId || a.label.localeCompare(b.label));
}

function buildBaseCandidates(masterfile: Masterfile): BaseCandidate[] {
  const result: RawBaseCandidate[] = [];
  for (const [pokemonId, pokemon] of Object.entries(masterfile.pokemon)) {
    const pokemonName = pokemon.name ?? `Pokemon ${pokemonId}`;
    const forms = pokemon.forms ?? {};
    const formEntries = Object.entries(forms);
    if (!formEntries.length) {
      const stats = resolveStats(pokemon);
      if (stats !== null) {
        result.push({
          pokedexId: Number(pokemonId),
          formId: 0,
          pokemonName,
          formName: null,
          stats,
          highlighted: isHighlightedCandidate(pokemon, pokemonName, 0),
          tempEvolutions: resolveTempEvolutions(pokemon, 0)
        });
      }
      continue;
    }
    const defaultFormId = pokemon.defaultFormId ?? 0;
    for (const [formId, form] of formEntries) {
      const numericFormId = Number(formId);
      if (form.isCostume) {
        continue;
      }
      const isDefaultForm = numericFormId === defaultFormId;
      if (!isDefaultForm && !resolveStats(form) && !Object.keys(form.tempEvolutions ?? {}).length) {
        continue;
      }
      const stats = resolveFormStats(pokemon, numericFormId);
      if (stats === null) {
        continue;
      }
      const label = formatFormLabel(pokemonName, form.name, isDefaultForm);
      result.push({
        pokedexId: Number(pokemonId),
        formId: numericFormId,
        pokemonName,
        formName: label === pokemonName ? null : form.name ?? label,
        stats,
        highlighted: isHighlightedCandidate(pokemon, pokemonName, numericFormId),
        tempEvolutions: resolveTempEvolutions(pokemon, numericFormId)
      });
    }
  }
  return collapseBaseCandidates(result);
}

function isFunctionallyPerfect(stamina: number, level: number): boolean {
  const multiplier = calculateCpMultiplier(level);
  const perfectHp = Math.max(10, Math.floor((stamina + 15) * multiplier));
  const candidateHp = Math.max(10, Math.floor((stamina + 14) * multiplier));
  return candidateHp === perfectHp;
}

function regularCandidates(candidate: BaseCandidate): CandidateEntry[] {
  return [
    {
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: 0,
      label: candidate.label,
      stamina: candidate.stamina,
      statsList: candidate.statsList,
      highlighted: candidate.highlighted
    },
    ...candidate.tempEvolutions
      .filter((tempEvolution) => tempEvolution.stamina !== candidate.stamina)
      .map((tempEvolution) => ({
        pokedexId: candidate.pokedexId,
        formId: candidate.formId,
        tempEvolutionSortId: tempEvolution.tempEvolutionSortId,
        label: tempEvolution.label,
        stamina: tempEvolution.stamina,
        statsList: tempEvolution.statsList,
        highlighted: candidate.highlighted
      }))
  ];
}

function megaOnlyCandidates(candidate: BaseCandidate): CandidateEntry[] {
  if (!candidate.tempEvolutions.length) {
    return [];
  }
  const staminaChangingTempEvolutions = candidate.tempEvolutions.filter(
    (tempEvolution) => tempEvolution.stamina !== candidate.stamina
  );
  if (staminaChangingTempEvolutions.length) {
    return staminaChangingTempEvolutions.map((tempEvolution) => ({
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: tempEvolution.tempEvolutionSortId,
      label: tempEvolution.label,
      stamina: tempEvolution.stamina,
      statsList: tempEvolution.statsList,
      highlighted: candidate.highlighted
    }));
  }
  return [
    {
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: 0,
      label: candidate.label,
      stamina: candidate.stamina,
      statsList: candidate.statsList,
      highlighted: candidate.highlighted
    }
  ];
}

function addEntry(
  entries: SortableFunctionallyPerfectEntry[],
  seen: Set<string>,
  candidate: CandidateEntry,
  judgePath: string
): void {
  const stats = formatStatsList(candidate.statsList);
  const key = `${candidate.label}|${stats}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  entries.push({
    pokedexId: candidate.pokedexId,
    formId: candidate.formId,
    tempEvolutionSortId: candidate.tempEvolutionSortId,
    label: candidate.label,
    stats,
    href: buildFunctionallyPerfectJudgeHref(stats, judgePath),
    highlighted: candidate.highlighted
  });
}

export function buildFunctionallyPerfectJudgeHref(stats: string, judgePath = "/judge"): string {
  const params = new URLSearchParams({
    stats,
    atk: "15",
    def: "15",
    sta: "14",
    cpcap: "50000",
    lvcap: "50,51,52,53,55"
  });
  return `${judgePath}?${params.toString()}`;
}

export function buildFunctionallyPerfectSections(
  masterfile: Masterfile,
  judgePath = "/judge"
): FunctionallyPerfectSection[] {
  const baseCandidates = buildBaseCandidates(masterfile);
  return FUNCTIONALLY_PERFECT_LEVELS.map((level) => {
    const entries: SortableFunctionallyPerfectEntry[] = [];
    const seen = new Set<string>();
    const useMegaOnlyCandidates = MEGA_ONLY_LEVELS.includes(level as typeof MEGA_ONLY_LEVELS[number]);
    for (const candidate of baseCandidates) {
      const candidates = useMegaOnlyCandidates ? megaOnlyCandidates(candidate) : regularCandidates(candidate);
      for (const entry of candidates) {
        if (isFunctionallyPerfect(entry.stamina, level)) {
          addEntry(entries, seen, entry, judgePath);
        }
      }
    }
    entries.sort(
      (a, b) =>
        a.pokedexId - b.pokedexId ||
        a.formId - b.formId ||
        a.tempEvolutionSortId - b.tempEvolutionSortId ||
        a.label.localeCompare(b.label) ||
        a.stats.localeCompare(b.stats)
    );
    return {
      level,
      heading: `Lv${level}`,
      entries: entries.map(({ label, stats, href, highlighted }) => ({
        label,
        stats,
        href,
        highlighted
      }))
    };
  });
}

export async function loadFunctionallyPerfectSections(): Promise<FunctionallyPerfectSection[]> {
  return buildFunctionallyPerfectSections(await loadMasterfile());
}
