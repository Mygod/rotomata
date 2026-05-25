import { calculateCP, calculatePvPStat, strictlyDominates, type BaseStats, type CalculatedStats } from "./parity";

export interface RankedIvStat extends CalculatedStats {
  a: number;
  d: number;
  s: number;
  product: number;
  rank?: number | string | null;
  no?: number;
}

export interface RankedIvRow {
  detailHref: string;
  iv: string;
  level: string;
  cp: string;
  attack: string;
  defense: string;
  hp: string;
  statProduct: string;
  no: string;
  rank: string;
  nspp: string;
  cp20: string;
  cp25: string;
}

export interface RankedIvTable {
  allStats: RankedIvStat[];
  best: number;
  worst: number;
  totalCount: number;
}

export interface RankedIvRowContext {
  stats: BaseStats;
  statsString: string;
  cpCap: number;
  lvCap: number;
  ivFloor: number;
  detailBaseUrl: URL;
  best: number;
  worst: number;
}

export function insertFromSet(values: Set<number>): string[] {
  return Array.from(values).sort().map(String);
}

function calculateCpWithCap(stats: BaseStats, a: number, d: number, s: number, lv: number, cap: number): string {
  const result = calculateCP(stats, a, d, s, lv);
  return result > cap ? "" : String(result);
}

export function buildRankedIvTable(stats: BaseStats, cpCap: number, lvCap: number, ivFloor: number): RankedIvTable {
  const allStats: RankedIvStat[] = [];
  for (let a = ivFloor; a <= 15; a += 1) {
    for (let d = ivFloor; d <= 15; d += 1) {
      for (let s = ivFloor; s <= 15; s += 1) {
        const currentStat = calculatePvPStat(stats, a, d, s, cpCap, lvCap);
        if (currentStat === null) {
          continue;
        }
        const rankedStat: RankedIvStat = {
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
          }
          if (strictlyDominates(rankedStat, other)) {
            other.rank = null;
          }
        }
        allStats.push(rankedStat);
      }
    }
  }
  allStats.sort((a, b) => b.product - a.product || b.atk - a.atk || a.sta - b.sta);
  if (!allStats.length) {
    return {
      allStats,
      best: 0,
      worst: 0,
      totalCount: 0
    };
  }

  let lastStat: RankedIvStat | undefined;
  let nextRank = 1;
  let no = 0;
  for (const stat of allStats) {
    if (stat.rank !== null) {
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
    stat.no = ++no;
  }

  return {
    allStats,
    best: allStats[0].product,
    worst: lastStat?.product ?? allStats[0].product,
    totalCount: allStats.length
  };
}

export function buildRankedIvRow(stat: RankedIvStat, context: RankedIvRowContext): RankedIvRow {
  const url = new URL(context.detailBaseUrl.toString());
  url.searchParams.set("stats", context.statsString);
  url.searchParams.set("cpcap", String(context.cpCap));
  if (context.ivFloor) {
    url.searchParams.set("ivfloor", String(context.ivFloor));
  }
  url.searchParams.set("atk", String(stat.a));
  url.searchParams.set("def", String(stat.d));
  url.searchParams.set("sta", String(stat.s));
  url.searchParams.set("lvcap", String(context.lvCap));
  return {
    detailHref: url.toString(),
    iv: `${stat.a}/${stat.d}/${stat.s}`,
    level: String(stat.lv),
    cp: String(stat.cp),
    attack: stat.atk.toFixed(2),
    defense: stat.def.toFixed(2),
    hp: String(stat.sta),
    statProduct: stat.product.toFixed(0),
    no: String(stat.no),
    rank: stat.rank === null ? "" : String(stat.rank),
    nspp:
      context.best === context.worst
        ? stat.product === context.best
          ? "100.00%"
          : "-∞"
        : `${(((stat.product - context.worst) / (context.best - context.worst)) * 100).toFixed(2)}%`,
    cp20: calculateCpWithCap(context.stats, stat.a, stat.d, stat.s, 20, context.cpCap),
    cp25: calculateCpWithCap(context.stats, stat.a, stat.d, stat.s, 25, context.cpCap)
  };
}
