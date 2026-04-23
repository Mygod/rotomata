import { loadMasterfile, type Masterfile, type MasterfilePokemon, type MasterfileStats, type MasterfileTempEvolution } from "./masterfile";
import { calculateCpMultiplier, type BaseStats } from "./parity";

const REGULAR_LEVELS = [40, 50, 51] as const;
const MEGA_ONLY_LEVELS = [52, 53, 55] as const;
const FUNCTIONALLY_PERFECT_LEVELS = [...REGULAR_LEVELS, ...MEGA_ONLY_LEVELS] as const;
const TEMP_EVOLUTION_NAMES = ["Unset", "Mega", "Mega X", "Mega Y", "Primal", "Mega Z"];
const TEMP_EVOLUTION_PROTO_NAMES: Record<string, string> = {
  TEMP_EVOLUTION_MEGA: "Mega",
  TEMP_EVOLUTION_MEGA_X: "Mega X",
  TEMP_EVOLUTION_MEGA_Y: "Mega Y",
  TEMP_EVOLUTION_PRIMAL: "Primal"
};

export interface FunctionallyPerfectEntry {
  label: string;
  stats: string;
  href: string;
}

export interface FunctionallyPerfectSection {
  level: number;
  heading: string;
  entries: FunctionallyPerfectEntry[];
}

interface TempEvolutionCandidate {
  label: string;
  stats: BaseStats;
  tempEvolutionSortId: number;
}

interface BaseCandidate {
  pokedexId: number;
  formId: number;
  label: string;
  stats: BaseStats;
  tempEvolutions: TempEvolutionCandidate[];
}

interface CandidateEntry {
  pokedexId: number;
  formId: number;
  tempEvolutionSortId: number;
  label: string;
  stats: BaseStats;
}

interface SortableFunctionallyPerfectEntry extends FunctionallyPerfectEntry {
  pokedexId: number;
  formId: number;
  tempEvolutionSortId: number;
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

function formatStats(stats: BaseStats): string {
  return `${stats.attack}/${stats.defense}/${stats.stamina}`;
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

function resolveTempEvolutions(
  pokemon: MasterfilePokemon,
  formId: number,
  baseLabel: string
): TempEvolutionCandidate[] {
  const form = formId ? pokemon.forms?.[String(formId)] : undefined;
  const tempEvolutions = form?.tempEvolutions ?? pokemon.tempEvolutions ?? {};
  const result: TempEvolutionCandidate[] = [];
  for (const [tempEvolutionId, tempEvolution] of Object.entries(tempEvolutions)) {
    const stats = resolveStats(tempEvolution) ?? resolveStats(pokemon.tempEvolutions?.[tempEvolutionId]);
    if (stats === null) {
      continue;
    }
    result.push({
      label: `${baseLabel} (${formatTempEvolutionLabel(tempEvolutionId, tempEvolution)})`,
      stats,
      tempEvolutionSortId: resolveTempEvolutionSortId(tempEvolutionId, tempEvolution)
    });
  }
  return result;
}

function buildBaseCandidates(masterfile: Masterfile): BaseCandidate[] {
  const result: BaseCandidate[] = [];
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
          label: pokemonName,
          stats,
          tempEvolutions: resolveTempEvolutions(pokemon, 0, pokemonName)
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
        label,
        stats,
        tempEvolutions: resolveTempEvolutions(pokemon, numericFormId, label)
      });
    }
  }
  return result;
}

function isFunctionallyPerfect(stats: BaseStats, level: number): boolean {
  const multiplier = calculateCpMultiplier(level);
  const perfectHp = Math.max(10, Math.floor((stats.stamina + 15) * multiplier));
  const candidateHp = Math.max(10, Math.floor((stats.stamina + 14) * multiplier));
  return candidateHp === perfectHp;
}

function regularCandidates(candidate: BaseCandidate): CandidateEntry[] {
  return [
    {
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: 0,
      label: candidate.label,
      stats: candidate.stats
    },
    ...candidate.tempEvolutions
      .filter((tempEvolution) => tempEvolution.stats.stamina !== candidate.stats.stamina)
      .map((tempEvolution) => ({
        pokedexId: candidate.pokedexId,
        formId: candidate.formId,
        tempEvolutionSortId: tempEvolution.tempEvolutionSortId,
        label: tempEvolution.label,
        stats: tempEvolution.stats
      }))
  ];
}

function megaOnlyCandidates(candidate: BaseCandidate): CandidateEntry[] {
  if (!candidate.tempEvolutions.length) {
    return [];
  }
  const staminaChangingTempEvolutions = candidate.tempEvolutions.filter(
    (tempEvolution) => tempEvolution.stats.stamina !== candidate.stats.stamina
  );
  if (staminaChangingTempEvolutions.length) {
    return staminaChangingTempEvolutions.map((tempEvolution) => ({
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: tempEvolution.tempEvolutionSortId,
      label: tempEvolution.label,
      stats: tempEvolution.stats
    }));
  }
  return [
    {
      pokedexId: candidate.pokedexId,
      formId: candidate.formId,
      tempEvolutionSortId: 0,
      label: candidate.label,
      stats: candidate.stats
    }
  ];
}

function addEntry(
  entries: SortableFunctionallyPerfectEntry[],
  seen: Set<string>,
  candidate: CandidateEntry,
  judgePath: string
): void {
  const stats = formatStats(candidate.stats);
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
    href: buildFunctionallyPerfectJudgeHref(stats, judgePath)
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
        if (isFunctionallyPerfect(entry.stats, level)) {
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
      entries: entries.map(({ label, stats, href }) => ({
        label,
        stats,
        href
      }))
    };
  });
}

export async function loadFunctionallyPerfectSections(): Promise<FunctionallyPerfectSection[]> {
  return buildFunctionallyPerfectSections(await loadMasterfile());
}
