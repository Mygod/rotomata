export interface BaseStats {
  attack: number;
  defense: number;
  stamina: number;
}

export interface CalculatedStats {
  atk: number;
  def: number;
  sta: number;
  lv: number;
  cp: number;
}

export interface PvpStatInput {
  stats: BaseStats;
  cpCap: number;
  lvCap: number;
  ivFloor: number;
  ivAtk: number;
  ivDef: number;
  ivSta: number;
}

export interface JudgeInput {
  statsList: BaseStats[];
  cpCaps: number[];
  lvCaps: number[];
  ivFloor: number;
  ivAtk: number;
  ivDef: number;
  ivSta: number;
  currentCp: number;
}

interface RankedStat extends CalculatedStats {
  a: number;
  d: number;
  s: number;
  product: number;
  rank?: number | string | null;
}

interface PvpStatAnalysis {
  mine: RankedStat;
  myRank: number | string;
  maxRank: number;
  betterAs: number;
  betterDs: number;
  betterSs: number;
  competitors: number;
  strictlyDominated: string[];
  minA: number;
  maxA: number;
  minD: number;
  maxD: number;
  minS: number;
  maxS: number;
  maxAds: number;
  myProduct: number;
  worstProduct: number;
  bestProduct: number;
}

interface JudgeEntry {
  stats: BaseStats;
  mine: RankedStat;
  myRank: number | string;
  maxRank: number;
  cpCap: number;
  lvCapDisplay: string;
}

interface JudgeRankTable {
  viableStats: RankedStat[];
  rankByIv: Map<string, number>;
  maxRank: number;
}

interface JudgeRankCacheEntry {
  table: JudgeRankTable;
  lastAccessedAt: number;
}

const JUDGE_RANK_CACHE_TTL_MS = 10 * 60 * 1000;
const judgeRankCache = new Map<string, JudgeRankCacheEntry>();
let judgeRankCacheBuildCount = 0;

export const CP_MULTIPLIERS: Record<string, number> = {
  "1": 0.0939999967813492,
  "1.5": 0.135137432089339,
  "2": 0.166397869586945,
  "2.5": 0.192650913155325,
  "3": 0.215732470154762,
  "3.5": 0.236572651424822,
  "4": 0.255720049142838,
  "4.5": 0.273530372106572,
  "5": 0.290249884128571,
  "5.5": 0.306057381389863,
  "6": 0.321087598800659,
  "6.5": 0.335445031996451,
  "7": 0.349212676286697,
  "7.5": 0.362457736609939,
  "8": 0.375235587358475,
  "8.5": 0.387592407713878,
  "9": 0.399567276239395,
  "9.5": 0.4111935532161,
  "10": 0.422500014305115,
  "10.5": 0.432926420512509,
  "11": 0.443107545375824,
  "11.5": 0.453059948165049,
  "12": 0.46279838681221,
  "12.5": 0.472336085311278,
  "13": 0.481684952974319,
  "13.5": 0.490855807179549,
  "14": 0.499858438968658,
  "14.5": 0.5087017489616,
  "15": 0.517393946647644,
  "15.5": 0.525942516110322,
  "16": 0.534354329109192,
  "16.5": 0.542635753803599,
  "17": 0.550792694091797,
  "17.5": 0.558830584490385,
  "18": 0.566754519939423,
  "18.5": 0.57456912814537,
  "19": 0.582278907299042,
  "19.5": 0.589887907888945,
  "20": 0.597400009632111,
  "20.5": 0.604823648665171,
  "21": 0.61215728521347,
  "21.5": 0.619404107958234,
  "22": 0.626567125320435,
  "22.5": 0.633649178748576,
  "23": 0.6406529545784,
  "23.5": 0.647580971386554,
  "24": 0.654435634613037,
  "24.5": 0.661219265805859,
  "25": 0.667934000492095,
  "25.5": 0.674581885647492,
  "26": 0.681164920330048,
  "26.5": 0.687684901255373,
  "27": 0.694143652915955,
  "27.5": 0.700542901033063,
  "28": 0.706884205341339,
  "28.5": 0.713169074873823,
  "29": 0.719399094581604,
  "29.5": 0.725575586915154,
  "30": 0.731700003147125,
  "30.5": 0.734741038550429,
  "31": 0.737769484519958,
  "31.5": 0.740785579737136,
  "32": 0.743789434432983,
  "32.5": 0.746781197247765,
  "33": 0.749761044979095,
  "33.5": 0.752729099732281,
  "34": 0.75568550825119,
  "34.5": 0.758630370209851,
  "35": 0.761563837528229,
  "35.5": 0.76448604959218,
  "36": 0.767397165298462,
  "36.5": 0.770297293677362,
  "37": 0.773186504840851,
  "37.5": 0.776064947064992,
  "38": 0.778932750225067,
  "38.5": 0.781790050767666,
  "39": 0.784636974334717,
  "39.5": 0.787473608513275
};

export function calculateCpMultiplier(level: number): number {
  if (level < 40) {
    return CP_MULTIPLIERS[String(level)];
  }
  const baseLevel = Math.floor(level);
  const baseCpm = Math.fround(0.5903 + baseLevel * 0.005);
  if (baseLevel === level) {
    return baseCpm;
  }
  const nextCpm = Math.fround(0.5903 + (baseLevel + 1) * 0.005);
  return Math.sqrt((baseCpm * baseCpm + nextCpm * nextCpm) / 2);
}

export function calculateCP(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  level: number
): number {
  const multiplier = calculateCpMultiplier(level);
  const a = stats.attack + attack;
  const d = stats.defense + defense;
  const s = stats.stamina + stamina;
  const cp = Math.floor((multiplier * multiplier * a * Math.sqrt(d * s)) / 10);
  return cp < 10 ? 10 : cp;
}

export function calculateStats(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  level: number
): CalculatedStats {
  const multiplier = calculateCpMultiplier(level);
  const hp = Math.floor((stamina + stats.stamina) * multiplier);
  return {
    atk: (attack + stats.attack) * multiplier,
    def: (defense + stats.defense) * multiplier,
    sta: hp < 10 ? 10 : hp,
    lv: level,
    cp: calculateCP(stats, attack, defense, stamina, level)
  };
}

export function calculatePvPStat(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  cap: number,
  lvCap: number
): CalculatedStats | null {
  let bestCP = calculateCP(stats, attack, defense, stamina, 1);
  if (!(bestCP <= cap)) {
    return null;
  }
  let lowest = 1;
  let highest = lvCap;
  for (
    let mid = Math.ceil(lowest + highest) / 2;
    lowest < highest;
    mid = Math.ceil(lowest + highest) / 2
  ) {
    const cp = calculateCP(stats, attack, defense, stamina, mid);
    if (cp <= cap) {
      lowest = mid;
      bestCP = cp;
    } else {
      highest = mid - 0.5;
    }
  }
  const result = calculateStats(stats, attack, defense, stamina, lowest);
  result.cp = bestCP;
  return result;
}

export function findMinLevel(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  target: number,
  lvCap: number
): number {
  let bestCP = calculateCP(stats, attack, defense, stamina, lvCap);
  if (!(bestCP >= target)) {
    return 0;
  }
  let lowest = 1;
  let highest = lvCap;
  for (
    let mid = Math.floor(lowest + highest) / 2;
    lowest < highest;
    mid = Math.floor(lowest + highest) / 2
  ) {
    const cp = calculateCP(stats, attack, defense, stamina, mid);
    if (cp >= target) {
      highest = mid;
      bestCP = cp;
    } else {
      lowest = mid + 0.5;
    }
  }
  return calculateCP(stats, attack, defense, stamina, highest) === target ? highest : 0;
}

export function diffFloat(value: number, precision = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(precision)}`;
}

export function strictlyDominates(currentStat: CalculatedStats, mine: CalculatedStats): boolean {
  return (
    currentStat.atk >= mine.atk &&
    currentStat.def >= mine.def &&
    currentStat.sta >= mine.sta &&
    (currentStat.atk !== mine.atk || currentStat.def !== mine.def || currentStat.sta !== mine.sta)
  );
}

function calculateStyle(
  minColor: string,
  mineColor: string,
  trashColor: string,
  min: number,
  mine: number,
  r: number,
  maxAds?: number
): string {
  let colorLeft: string;
  let colorRight: string;
  let rLeft: number;
  let rRight: number;
  let result = ' class="bar';
  if (min <= mine) {
    colorLeft = minColor;
    colorRight = mineColor;
    rLeft = min * r;
    rRight = mine * r;
  } else {
    result += " bad";
    colorLeft = trashColor;
    colorRight = minColor;
    rLeft = mine * r;
    rRight = min * r;
  }
  result += `" style="background:linear-gradient(to right,#${colorLeft} ${rLeft}%,#${colorRight} ${rLeft}% ${rRight}%,white 0)`;
  if (maxAds) {
    result += `;width:${maxAds / r}%`;
  }
  return `${result}"`;
}

function formatStatsKey(stats: BaseStats): string {
  return `${stats.attack}/${stats.defense}/${stats.stamina}`;
}

function formatIvKey(attack: number, defense: number, stamina: number): string {
  return `${attack}/${defense}/${stamina}`;
}

function formatJudgeRankCacheKey(stats: BaseStats, ivFloor: number, cpCap: number, lvCap: number): string {
  return `${formatStatsKey(stats)}|${cpCap}|${lvCap}|${ivFloor}`;
}

function pruneJudgeRankCache(activeKeys?: ReadonlySet<string>): void {
  const now = Date.now();
  for (const [key, entry] of judgeRankCache) {
    if (now - entry.lastAccessedAt > JUDGE_RANK_CACHE_TTL_MS || (activeKeys && !activeKeys.has(key))) {
      judgeRankCache.delete(key);
    }
  }
}

function buildJudgeRankTable(stats: BaseStats, ivFloor: number, cpCap: number, lvCap: number): JudgeRankTable {
  const viableStats: RankedStat[] = [];
  for (let a = ivFloor; a <= 15; a += 1) {
    for (let d = ivFloor; d <= 15; d += 1) {
      for (let s = ivFloor; s <= 15; s += 1) {
        const currentStat = calculatePvPStat(stats, a, d, s, cpCap, lvCap);
        if (currentStat === null) {
          continue;
        }
        const rankedStat: RankedStat = {
          ...currentStat,
          a,
          d,
          s,
          product: currentStat.atk * currentStat.def * currentStat.sta
        };
        let dominated = false;
        for (let index = viableStats.length - 1; index >= 0; index -= 1) {
          const other = viableStats[index];
          if (strictlyDominates(other, rankedStat)) {
            dominated = true;
            break;
          }
          if (strictlyDominates(rankedStat, other)) {
            viableStats.splice(index, 1);
          }
        }
        if (!dominated) {
          viableStats.push(rankedStat);
        }
      }
    }
  }
  viableStats.sort((a, b) => b.product - a.product || b.atk - a.atk || a.sta - b.sta);
  let lastStat: RankedStat | undefined;
  let nextRank = 1;
  const rankByIv = new Map<string, number>();
  for (const stat of viableStats) {
    if (
      lastStat === undefined ||
      stat.product < lastStat.product ||
      (stat.product === lastStat.product && stat.atk < lastStat.atk)
    ) {
      lastStat = stat;
      stat.rank = nextRank;
    } else {
      stat.rank = lastStat.rank;
    }
    nextRank += 1;
    rankByIv.set(formatIvKey(stat.a, stat.d, stat.s), stat.rank as number);
  }
  return {
    viableStats,
    rankByIv,
    maxRank: (lastStat?.rank as number | undefined) ?? 0
  };
}

function getJudgeRankTable(stats: BaseStats, ivFloor: number, cpCap: number, lvCap: number): JudgeRankTable {
  pruneJudgeRankCache();
  const key = formatJudgeRankCacheKey(stats, ivFloor, cpCap, lvCap);
  const existing = judgeRankCache.get(key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing.table;
  }
  const table = buildJudgeRankTable(stats, ivFloor, cpCap, lvCap);
  judgeRankCacheBuildCount += 1;
  judgeRankCache.set(key, {
    table,
    lastAccessedAt: Date.now()
  });
  return table;
}

function retainJudgeRankCache(input: JudgeInput): void {
  const activeKeys = new Set<string>();
  const uniqueStats = new Map<string, BaseStats>();
  for (const stats of input.statsList) {
    uniqueStats.set(formatStatsKey(stats), stats);
  }
  const uniqueCpCaps = Array.from(new Set(input.cpCaps));
  const uniqueLvCaps = Array.from(new Set(input.lvCaps));
  for (const stats of uniqueStats.values()) {
    for (const cpCap of uniqueCpCaps) {
      for (const lvCap of uniqueLvCaps) {
        activeKeys.add(formatJudgeRankCacheKey(stats, input.ivFloor, cpCap, lvCap));
      }
    }
  }
  pruneJudgeRankCache(activeKeys);
}

export function clearJudgeRankCacheForTests(): void {
  judgeRankCache.clear();
  judgeRankCacheBuildCount = 0;
}

export function getJudgeRankCacheKeysForTests(): string[] {
  return Array.from(judgeRankCache.keys()).sort();
}

export function getJudgeRankCacheBuildCountForTests(): number {
  return judgeRankCacheBuildCount;
}

function parseRankedStats(
  stats: BaseStats,
  ivFloor: number,
  cpCap: number,
  lvCap: number
): RankedStat[] {
  const allStats: RankedStat[] = [];
  for (let a = ivFloor; a <= 15; a += 1) {
    for (let d = ivFloor; d <= 15; d += 1) {
      for (let s = ivFloor; s <= 15; s += 1) {
        const currentStat = calculatePvPStat(stats, a, d, s, cpCap, lvCap);
        if (currentStat === null) {
          continue;
        }
        const rankedStat: RankedStat = {
          ...currentStat,
          a,
          d,
          s,
          product: currentStat.atk * currentStat.def * currentStat.sta
        };
        for (const other of allStats) {
          if (strictlyDominates(other, rankedStat)) {
            rankedStat.rank = null;
            break;
          } else if (strictlyDominates(rankedStat, other)) {
            other.rank = null;
          }
        }
        allStats.push(rankedStat);
      }
    }
  }
  allStats.sort((a, b) => b.product - a.product || b.atk - a.atk || a.sta - b.sta);
  return allStats;
}

function analyzePvpStat(input: PvpStatInput): PvpStatAnalysis | null {
  const mineBase = calculatePvPStat(
    input.stats,
    input.ivAtk,
    input.ivDef,
    input.ivSta,
    input.cpCap,
    input.lvCap
  );
  if (mineBase === null) {
    return null;
  }
  const mine: RankedStat = {
    ...mineBase,
    a: input.ivAtk,
    d: input.ivDef,
    s: input.ivSta,
    product: mineBase.atk * mineBase.def * mineBase.sta
  };
  let maxA = 0;
  let maxD = 0;
  let maxS = 0;
  let bestProduct = 0;
  const allStats = parseRankedStats(input.stats, input.ivFloor, input.cpCap, input.lvCap);
  for (const stat of allStats) {
    if (stat.atk > maxA) {
      maxA = stat.atk;
    }
    if (stat.def > maxD) {
      maxD = stat.def;
    }
    if (stat.sta > maxS) {
      maxS = stat.sta;
    }
    if (stat.product > bestProduct) {
      bestProduct = stat.product;
    }
  }
  let lastStat: RankedStat | undefined;
  let nextRank = 1;
  let myRank: number | string = "?";
  let betterAs = 0;
  let betterDs = 0;
  let betterSs = 0;
  const strictlyDominated: string[] = [];
  for (const stat of allStats) {
    if (stat.rank !== null) {
      if (stat.atk > mine.atk) {
        betterAs += 1;
      }
      if (stat.def > mine.def) {
        betterDs += 1;
      }
      if (stat.sta > mine.sta) {
        betterSs += 1;
      }
      if (strictlyDominates(stat, mine)) {
        strictlyDominated.push(
          `${stat.a}/${stat.d}/${stat.s} (L${stat.lv} ${diffFloat(stat.atk - mine.atk)}/${diffFloat(
            stat.def - mine.def
          )}/${diffFloat(stat.sta - mine.sta, 0)})`
        );
      }
      if (
        lastStat === undefined ||
        stat.product < lastStat.product ||
        (stat.product === lastStat.product && stat.atk < lastStat.atk)
      ) {
        lastStat = stat;
        stat.rank = nextRank;
      } else {
        stat.rank = lastStat.rank;
      }
      nextRank += 1;
    } else {
      stat.rank = `${lastStat?.rank ?? "?"}+`;
    }
    if (stat.atk === mine.atk && stat.def === mine.def && stat.sta === mine.sta) {
      myRank = stat.rank ?? "?";
    }
  }
  if (lastStat === undefined) {
    return null;
  }
  const competitors = nextRank - 1;
  const minA = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || stat.atk > value ? value : stat.atk),
    maxA
  );
  const minD = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || stat.def > value ? value : stat.def),
    maxD
  );
  const minS = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || stat.sta > value ? value : stat.sta),
    maxS
  );
  const maxAds = 10000 / Math.max(maxA, maxD, maxS);
  const worstProduct = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || stat.product > value ? value : stat.product),
    bestProduct
  );
  return {
    mine,
    myRank,
    maxRank: lastStat.rank as number,
    betterAs,
    betterDs,
    betterSs,
    competitors,
    strictlyDominated,
    minA,
    maxA,
    minD,
    maxD,
    minS,
    maxS,
    maxAds,
    myProduct: mine.product,
    worstProduct,
    bestProduct
  };
}

function createJudgeEntry(
  stats: BaseStats,
  cpCap: number,
  lvCap: number,
  currentLevel: number,
  ivFloor: number,
  ivAtk: number,
  ivDef: number,
  ivSta: number
): JudgeEntry | null {
  const mineBase = calculatePvPStat(stats, ivAtk, ivDef, ivSta, cpCap, lvCap);
  if (mineBase === null || mineBase.lv < currentLevel) {
    return null;
  }
  const mine: RankedStat = {
    ...mineBase,
    a: ivAtk,
    d: ivDef,
    s: ivSta,
    product: mineBase.atk * mineBase.def * mineBase.sta
  };
  const table = getJudgeRankTable(stats, ivFloor, cpCap, lvCap);
  if (table.maxRank <= 0) {
    return null;
  }
  for (const stat of table.viableStats) {
    if (strictlyDominates(stat, mine)) {
      return null;
    }
  }
  const myRank = table.rankByIv.get(formatIvKey(ivAtk, ivDef, ivSta)) ?? "?";
  const lvCapDisplay = calculateCP(stats, 0, 0, 0, lvCap + 0.5) > cpCap ? "" : `/${lvCap}`;
  return {
    stats,
    mine,
    myRank,
    maxRank: table.maxRank,
    cpCap,
    lvCapDisplay
  };
}

export function renderPvpStatHtml(input: PvpStatInput): string {
  const analysis = analyzePvpStat(input);
  if (analysis === null) {
    return "You are overleveled even at level 1";
  }
  let result = `<div>Lv${analysis.mine.lv} CP${analysis.mine.cp} Rank+${analysis.myRank}/${analysis.maxRank}</div>`;
  result += `<div${calculateStyle("9DB7F5", "6890F0", "445E9C", analysis.minA, analysis.mine.atk, 100 / analysis.maxA, analysis.maxAds)}>Attack: ${analysis.minA.toFixed(2)}/${analysis.mine.atk.toFixed(2)}/${analysis.maxA.toFixed(2)}</div> ${analysis.betterAs}/${analysis.competitors} (${((analysis.betterAs / analysis.competitors) * 100).toFixed(2)}%) viable combination(s) have higher attack than you`;
  result += `<div${calculateStyle("A7DB8D", "78C850", "4E8234", analysis.minD, analysis.mine.def, 100 / analysis.maxD, analysis.maxAds)}>Defense: ${analysis.minD.toFixed(2)}/${analysis.mine.def.toFixed(2)}/${analysis.maxD.toFixed(2)}</div> ${analysis.betterDs}/${analysis.competitors} (${((analysis.betterDs / analysis.competitors) * 100).toFixed(2)}%) viable combination(s) have higher defense than you`;
  result += `<div${calculateStyle("FF5959", "FF0000", "A60000", analysis.minS, analysis.mine.sta, 100 / analysis.maxS, analysis.maxAds)}>HP: ${analysis.minS}/${analysis.mine.sta}/${analysis.maxS}</div> ${analysis.betterSs}/${analysis.competitors} (${((analysis.betterSs / analysis.competitors) * 100).toFixed(2)}%) viable combination(s) have higher HP than you`;
  result += `<div${calculateStyle("FA92B2", "F85888", "A13959", analysis.worstProduct, analysis.myProduct, 100 / analysis.bestProduct)}>Stat product: ${analysis.worstProduct.toFixed(0)}/${analysis.myProduct.toFixed(0)}/${analysis.bestProduct.toFixed(0)}</div>`;
  result += analysis.strictlyDominated.length
    ? `<span class="bad">You are strictly beaten by ${analysis.strictlyDominated.length} viable combination(s)</span>: ${analysis.strictlyDominated.join(", ")}`
    : '<span class="good">Your Pokemon might be the very best like no one ever was</span>';
  return result;
}

export function renderJudgeHtml(input: JudgeInput, pvpStatUrl: URL): string {
  retainJudgeRankCache(input);
  const lvCapMax = Math.max(...input.lvCaps);
  let inferredLevel = "Unable to infer current level<br />";
  let currentLevel = lvCapMax + 1;
  input.statsList.forEach((stats) => {
    const level = findMinLevel(stats, input.ivAtk, input.ivDef, input.ivSta, input.currentCp, lvCapMax);
    if (!level || level > currentLevel) {
      return;
    }
    inferredLevel = `<span class="good">Inferred Lv${level} with ${stats.attack}/${stats.defense}/${stats.stamina}</span><br />`;
    currentLevel = level;
  });
  if (currentLevel > lvCapMax) {
    currentLevel = 1;
  }
  let result = "";
  input.statsList.forEach((stats) => {
    input.cpCaps.forEach((cpCap) => {
      if (
        cpCap < input.cpCaps[input.cpCaps.length - 1] &&
        calculateCP(stats, 15, 15, 15, input.lvCaps[input.lvCaps.length - 1]) <= cpCap
      ) {
        return;
      }
      if (calculateCP(stats, input.ivAtk, input.ivDef, input.ivSta, currentLevel) > cpCap) {
        return;
      }
      input.lvCaps.some((lvCap) => {
        const entry = createJudgeEntry(
          stats,
          cpCap,
          lvCap,
          currentLevel,
          input.ivFloor,
          input.ivAtk,
          input.ivDef,
          input.ivSta
        );
        if (entry === null) {
          return false;
        }
        const url = new URL(pvpStatUrl.toString());
        url.searchParams.set("stats", `${stats.attack}/${stats.defense}/${stats.stamina}`);
        url.searchParams.set("cpcap", String(cpCap));
        if (input.ivFloor) {
          url.searchParams.set("ivfloor", String(input.ivFloor));
        }
        url.searchParams.set("atk", String(input.ivAtk));
        url.searchParams.set("def", String(input.ivDef));
        url.searchParams.set("sta", String(input.ivSta));
        url.searchParams.set("lvcap", String(lvCap));
        result += `<a href="${url.toString()}" target="_blank" rel="noreferrer">${stats.attack}/${stats.defense}/${stats.stamina} @ ${entry.mine.cp}/${cpCap}CP Lv${entry.mine.lv}${entry.lvCapDisplay} Rank+${entry.myRank}/${entry.maxRank}</a><br />`;
        return !entry.lvCapDisplay;
      });
    });
  });
  return inferredLevel + (result || '<span class="bad">Wow what a trash Pokemon plz trade/transfer</span>');
}

export function parseStatsTriple(value: string): BaseStats {
  const statsArray = value.split("/", 3).map((entry) => parseInt(entry, 10));
  return {
    attack: statsArray[0],
    defense: statsArray[1],
    stamina: statsArray[2]
  };
}

export function parseStatsList(value: string): BaseStats[] {
  return value.split(",").map((entry) => parseStatsTriple(entry));
}
