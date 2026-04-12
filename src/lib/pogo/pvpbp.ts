import { calculateCP, calculatePvPStat, strictlyDominates, type BaseStats, type CalculatedStats } from "./parity";

export interface PvpbpInput {
  stats: BaseStats;
  statsString: string;
  cpCap: number;
  lvCap: number;
  ivFloor: number;
  suboptimal: boolean;
  minCp: number;
  maxLevel: number;
  minIv: number;
  floorAtk: number;
  floorDef: number;
  floorSta: number;
}

interface PvpbpStat extends CalculatedStats {
  a: number;
  d: number;
  s: number;
  product: number;
  rank?: number | string | null;
  no?: number;
}

export interface PvpbpRow {
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

export interface PvpbpResult {
  rows: PvpbpRow[];
  atkOptions: string[];
  defOptions: string[];
  staOptions: string[];
  returnedCount: number;
  totalCount: number;
}

function insertFromSet(values: Set<number>): string[] {
  return Array.from(values).sort().map(String);
}

function calculateCpWithCap(stats: BaseStats, a: number, d: number, s: number, lv: number, cap: number): string {
  const result = calculateCP(stats, a, d, s, lv);
  return result > cap ? "" : String(result);
}

export function buildPvpbpResult(input: PvpbpInput, detailBaseUrl: URL): PvpbpResult {
  const allStats: PvpbpStat[] = [];
  for (let a = input.ivFloor; a <= 15; a += 1) {
    for (let d = input.ivFloor; d <= 15; d += 1) {
      for (let s = input.ivFloor; s <= 15; s += 1) {
        const currentStat = calculatePvPStat(input.stats, a, d, s, input.cpCap, input.lvCap);
        if (currentStat === null) {
          continue;
        }
        const rankedStat: PvpbpStat = {
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
      rows: [],
      atkOptions: [],
      defOptions: [],
      staOptions: [],
      returnedCount: 0,
      totalCount: 0
    };
  }

  let lastStat: PvpbpStat | undefined;
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

  const best = allStats[0].product;
  const worst = lastStat?.product ?? best;
  const atks = new Set<number>();
  const defs = new Set<number>();
  const stas = new Set<number>();
  const rows: PvpbpRow[] = [];
  for (const stat of allStats) {
    if (
      (!input.suboptimal && typeof stat.rank !== "number") ||
      stat.cp < input.minCp ||
      stat.lv > input.maxLevel ||
      stat.a < input.minIv ||
      stat.d < input.minIv ||
      stat.s < input.minIv ||
      (!(input.floorAtk <= 0) && stat.atk < input.floorAtk) ||
      (!(input.floorDef <= 0) && stat.def < input.floorDef) ||
      (!(input.floorSta <= 0) && stat.sta < input.floorSta)
    ) {
      continue;
    }
    atks.add(stat.atk);
    defs.add(stat.def);
    stas.add(stat.sta);
    const url = new URL(detailBaseUrl.toString());
    url.searchParams.set("stats", input.statsString);
    url.searchParams.set("cpcap", String(input.cpCap));
    if (input.ivFloor) {
      url.searchParams.set("ivfloor", String(input.ivFloor));
    }
    url.searchParams.set("atk", String(stat.a));
    url.searchParams.set("def", String(stat.d));
    url.searchParams.set("sta", String(stat.s));
    url.searchParams.set("lvcap", String(input.lvCap));
    rows.push({
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
        best === worst
          ? stat.product === best
            ? "100.00%"
            : "-∞"
          : `${(((stat.product - worst) / (best - worst)) * 100).toFixed(2)}%`,
      cp20: calculateCpWithCap(input.stats, stat.a, stat.d, stat.s, 20, input.cpCap),
      cp25: calculateCpWithCap(input.stats, stat.a, stat.d, stat.s, 25, input.cpCap)
    });
  }

  return {
    rows,
    atkOptions: insertFromSet(atks),
    defOptions: insertFromSet(defs),
    staOptions: insertFromSet(stas),
    returnedCount: rows.length,
    totalCount: allStats.length
  };
}
