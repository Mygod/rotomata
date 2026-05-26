import { loadMasterfile, type Masterfile, type MasterfileEvolutionRef, type MasterfilePokemon, type MasterfileStats, type MasterfileTempEvolution, type MasterfileTypeRef } from "./masterfile";

export interface HardRaidEntry {
  pokemon: string;
  form: string;
  tier: string;
  attack: number;
  defense: number;
  hp: number;
  bulk: number;
}

const BOSS_CPM = [0.5974, 0.73, 0.79];
const BOSS_HP = [600 / 180, 1800 / 180, 3600 / 180, 9000 / 180, 9000 / 300, 15000 / 300, 20000 / 300, 22500 / 300];
const SUPER_MEGA_EFFECTIVE_HP = (25000 - 20000 + 20000 * 4) / 300;
const SUPER_MEGA_ATTACK_MULTIPLIER = 1.8;
const TEMP_EVOLUTION_NAMES: Record<string, string> = {
  "1": "Mega",
  "2": "Mega X",
  "3": "Mega Y",
  "4": "Primal",
  "5": "Mega Z"
};
const ENABLE_T4 = false;
const LEGENDARY_OVERRIDES = new Set([1009, 1010, 1014, 1015, 1016, 1017, 1020, 1021, 1022, 1023, 1024, 1025]);

interface PushRaidEntryOptions {
  formName?: string;
  isTempEvo?: boolean;
  isSuperMega?: boolean;
}

function resolveStats(carrier: { stats?: MasterfileStats } | undefined, fallback: MasterfilePokemon): MasterfileStats | null {
  return carrier?.stats ?? fallback.stats ?? null;
}

function resolveTypes(
  carrier: { types?: Record<string, MasterfileTypeRef> } | undefined,
  fallback: MasterfilePokemon
): Record<string, MasterfileTypeRef> | undefined {
  return carrier?.types ?? fallback.types;
}

function hasDoubleWeaknesses(masterfile: Masterfile, types: Record<string, MasterfileTypeRef> | undefined): boolean {
  const typeEntries = Object.values(types ?? {});
  if (typeEntries.length < 2) {
    return false;
  }
  const firstWeaknesses = new Set(
    (masterfile.types[String(typeEntries[0].typeId)]?.weaknesses ?? []).map((entry) => entry.typeId)
  );
  return (masterfile.types[String(typeEntries[1].typeId)]?.weaknesses ?? []).some((entry) =>
    firstWeaknesses.has(entry.typeId)
  );
}

function resolveEvolutionRefs(
  carrier: { evolutions?: Record<string, MasterfileEvolutionRef> } | undefined
): MasterfileEvolutionRef[] {
  return Object.values(carrier?.evolutions ?? {});
}

function isAlmostFinal(masterfile: Masterfile, evolutions: Record<string, MasterfileEvolutionRef> | undefined): boolean {
  return (
    ENABLE_T4 &&
    Boolean(evolutions) &&
    Object.values(evolutions ?? {}).every((evolution) => {
      let target: { evolutions?: Record<string, MasterfileEvolutionRef> } | undefined =
        masterfile.pokemon[String(evolution.pokemon)];
      if (evolution.form) {
        target = (target as MasterfilePokemon | undefined)?.forms?.[String(evolution.form)];
      }
      return !target?.evolutions;
    })
  );
}

function pushRaidEntry(
  entries: HardRaidEntry[],
  masterfile: Masterfile,
  pokemon: MasterfilePokemon,
  carrier?: { name?: string; stats?: MasterfileStats; types?: Record<string, MasterfileTypeRef>; evolutions?: Record<string, MasterfileEvolutionRef> },
  options: PushRaidEntryOptions = {}
): void {
  const source = carrier ?? pokemon;
  const stats = resolveStats(source, pokemon);
  if (!stats) {
    return;
  }
  const formName = options.formName ?? "";
  const isTempEvo = options.isTempEvo || formName === "Ultra";
  let hp: number;
  let cpm: number;
  let tier: string;
  let attackMultiplier = 1;
  if (options.isSuperMega) {
    [hp, cpm, tier] = [SUPER_MEGA_EFFECTIVE_HP, BOSS_CPM[2], "T7"];
    attackMultiplier = SUPER_MEGA_ATTACK_MULTIPLIER;
  } else if (pokemon.legendary || pokemon.mythic || pokemon.ultraBeast) {
    [hp, cpm, tier] = isTempEvo ? [BOSS_HP[7], BOSS_CPM[2], "T6"] : [BOSS_HP[5], BOSS_CPM[2], "T5"];
  } else if (isTempEvo) {
    [hp, cpm, tier] = [BOSS_HP[4], BOSS_CPM[2], "Mega"];
  } else if (isAlmostFinal(masterfile, source.evolutions)) {
    [hp, cpm, tier] = [BOSS_HP[3], 1, "T4"];
  } else {
    [hp, cpm, tier] = [BOSS_HP[2], BOSS_CPM[1], "T3"];
  }
  if (hasDoubleWeaknesses(masterfile, resolveTypes(source, pokemon))) {
    cpm /= 1.6;
  }
  const defense = stats.defense * cpm + 15;
  entries.push({
    pokemon: pokemon.name,
    form: formName,
    tier,
    attack: (stats.attack * cpm + 15) * attackMultiplier,
    defense,
    hp,
    bulk: defense * hp
  });
}

export function buildHardRaidEntries(masterfile: Masterfile): HardRaidEntry[] {
  const results: HardRaidEntry[] = [];
  for (const pokemon of Object.values(masterfile.pokemon)) {
    const pokemonWithOverrides = {
      ...pokemon,
      legendary: pokemon.legendary || LEGENDARY_OVERRIDES.has(pokemon.pokedexId)
    };
    pushRaidEntry(results, masterfile, pokemonWithOverrides);
    for (const form of Object.values(pokemon.forms ?? {})) {
      if (form.stats || form.types) {
        pushRaidEntry(results, masterfile, pokemonWithOverrides, form, { formName: form.name ?? "" });
      }
    }
    for (const tempEvolution of Object.values(pokemon.tempEvolutions ?? {})) {
      const tempEvolutionId = String(tempEvolution.tempEvoId ?? "");
      if (tempEvolutionId && !tempEvolutionId.endsWith("Gmax")) {
        const formName = TEMP_EVOLUTION_NAMES[tempEvolutionId] ?? "";
        pushRaidEntry(results, masterfile, pokemonWithOverrides, tempEvolution, { formName, isTempEvo: true });
        pushRaidEntry(results, masterfile, pokemonWithOverrides, tempEvolution, {
          formName,
          isTempEvo: true,
          isSuperMega: true
        });
      }
    }
  }
  results.sort((a, b) => b.bulk - a.bulk);
  const salamenceIndex = results.findIndex((entry) => entry.pokemon === "Salamence" && entry.tier !== "T7");
  return salamenceIndex >= 0 ? results.slice(0, salamenceIndex + 1) : results;
}

export async function loadHardRaidEntries(
): Promise<HardRaidEntry[]> {
  return buildHardRaidEntries(await loadMasterfile());
}
