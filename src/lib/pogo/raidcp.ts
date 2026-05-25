import { calculateStats, type BaseStats } from "./parity";
import { buildRankedIvRow, buildRankedIvTable, type RankedIvRow, type RankedIvStat } from "./rankedIv";

export type RaidCpHpMode = "full" | "functional" | "any";

export interface RaidCpTarget {
  fullAttack: boolean;
  fullDefense: boolean;
  hpMode: RaidCpHpMode;
}

export interface RaidCpInput {
  stats: BaseStats;
  statsString: string;
  ivFloor: number;
  naturalTarget: RaidCpTarget;
  includePurified: boolean;
  purifiedTarget: RaidCpTarget;
}

export interface RaidCpResult {
  rows: RankedIvRow[];
  returnedCount: number;
  totalCount: number;
}

export type RaidCpRow = RankedIvRow;

const RAID_CP_CAP = 50000;
const RAID_LEVEL_CAP = 50;
const RAID_CATCH_LEVELS = [20, 25] as const;

function purifyIv(iv: number): number {
  return Math.min(15, iv + 2);
}

function isFunctionallyPerfectHp(stats: BaseStats, hpIv: number): boolean {
  if (hpIv >= 15) {
    return true;
  }
  if (hpIv !== 14) {
    return false;
  }
  return RAID_CATCH_LEVELS.some(
    (level) =>
      calculateStats(stats, 0, 0, 14, level).sta === calculateStats(stats, 0, 0, 15, level).sta
  );
}

function matchesHpTarget(stats: BaseStats, hpIv: number, hpMode: RaidCpHpMode): boolean {
  switch (hpMode) {
    case "full":
      return hpIv === 15;
    case "functional":
      return isFunctionallyPerfectHp(stats, hpIv);
    case "any":
      return true;
  }
}

function matchesTarget(stats: BaseStats, atkIv: number, defIv: number, hpIv: number, target: RaidCpTarget): boolean {
  return (
    (!target.fullAttack || atkIv === 15) &&
    (!target.fullDefense || defIv === 15) &&
    matchesHpTarget(stats, hpIv, target.hpMode)
  );
}

function matchesPurifiedTarget(stats: BaseStats, stat: RankedIvStat, target: RaidCpTarget): boolean {
  return matchesTarget(stats, purifyIv(stat.a), purifyIv(stat.d), purifyIv(stat.s), target);
}

export function buildRaidCpResult(input: RaidCpInput, detailBaseUrl: URL): RaidCpResult {
  const table = buildRankedIvTable(input.stats, RAID_CP_CAP, RAID_LEVEL_CAP, input.ivFloor);
  const rows: RankedIvRow[] = [];
  for (const stat of table.allStats) {
    if (
      !matchesTarget(input.stats, stat.a, stat.d, stat.s, input.naturalTarget) &&
      (!input.includePurified || !matchesPurifiedTarget(input.stats, stat, input.purifiedTarget))
    ) {
      continue;
    }
    rows.push(buildRankedIvRow(stat, {
      stats: input.stats,
      statsString: input.statsString,
      cpCap: RAID_CP_CAP,
      lvCap: RAID_LEVEL_CAP,
      ivFloor: input.ivFloor,
      detailBaseUrl,
      best: table.best,
      worst: table.worst
    }));
  }
  return {
    rows,
    returnedCount: rows.length,
    totalCount: table.totalCount
  };
}
