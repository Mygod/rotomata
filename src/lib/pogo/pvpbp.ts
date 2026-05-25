import {
  buildRankedIvRow,
  buildRankedIvTable,
  insertFromSet,
  type RankedIvRow
} from "./rankedIv";
import type { BaseStats } from "./parity";

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

export type PvpbpRow = RankedIvRow;

export interface PvpbpResult {
  rows: PvpbpRow[];
  atkOptions: string[];
  defOptions: string[];
  staOptions: string[];
  returnedCount: number;
  totalCount: number;
}

export function buildPvpbpResult(input: PvpbpInput, detailBaseUrl: URL): PvpbpResult {
  const table = buildRankedIvTable(input.stats, input.cpCap, input.lvCap, input.ivFloor);
  const allStats = table.allStats;
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
    rows.push(buildRankedIvRow(stat, {
      stats: input.stats,
      statsString: input.statsString,
      cpCap: input.cpCap,
      lvCap: input.lvCap,
      ivFloor: input.ivFloor,
      detailBaseUrl,
      best: table.best,
      worst: table.worst
    }));
  }

  return {
    rows,
    atkOptions: insertFromSet(atks),
    defOptions: insertFromSet(defs),
    staOptions: insertFromSet(stas),
    returnedCount: rows.length,
    totalCount: table.totalCount
  };
}
