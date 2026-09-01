import type { PvedpsWeather } from "./pvedps";

export type MegaCombatTier = "A" | "A-" | "B+" | "B" | "B-" | "C+";
export type MegaCoverageTier = "D+" | "D" | "E" | "F";

export interface MegaCombatTierEvidence {
  baselineOutrightAndCatchAligned: boolean;
  weatherOutrightAndCatchAligned: boolean;
  baselineCatchAligned: boolean;
  weatherCatchAligned: boolean;
  baselineOutright: boolean;
  weatherOutright: boolean;
}

export interface MegaWeatherCombatEvidence {
  outrightAndCatchAligned: boolean;
  catchAligned: boolean;
  outright: boolean;
}

export interface MegaCoverageTierEvidence {
  auraTypeCount: number;
  hasExactDuplicate: boolean;
  hasHigherTierExactDuplicate: boolean;
  hasHigherTierStrictSuperset: boolean;
}

export type MegaWeatherTierAudit = Map<string, MegaWeatherCombatEvidence>;

export const MEGA_TIER_LEADER_TOLERANCE = 0.01;

/** Treat strategies within 1% of the nominal DPS leader as scenario-dependent co-leaders. */
export function isWithinMegaTierLeaderTolerance(
  candidateDps: number,
  leaderDps: number
): boolean {
  return candidateDps >= leaderDps * (1 - MEGA_TIER_LEADER_TOLERANCE);
}

export function isMegaTierTypeFloor(typeName: string): boolean {
  return typeName !== "None" && typeName !== "Normal";
}

/** Apply the evidence-only combat tier rules from strongest to weakest. */
export function classifyMegaCombatTier(
  evidence: MegaCombatTierEvidence
): MegaCombatTier | undefined {
  if (evidence.baselineOutrightAndCatchAligned) return "A";
  if (evidence.weatherOutrightAndCatchAligned) return "A-";
  if (evidence.baselineCatchAligned) return "B+";
  if (evidence.weatherCatchAligned) return "B";
  if (evidence.baselineOutright) return "B-";
  if (evidence.weatherOutright) return "C+";
  return undefined;
}

/** Apply backline containment before exact-duplicate coverage rules. */
export function classifyMegaCoverageTier(
  evidence: MegaCoverageTierEvidence
): MegaCoverageTier {
  if (evidence.auraTypeCount < 2 || evidence.hasHigherTierStrictSuperset) return "F";
  if (evidence.hasExactDuplicate) return evidence.hasHigherTierExactDuplicate ? "E" : "D";
  return "D+";
}

export function parseMegaWeatherTierSummary(
  weather: PvedpsWeather,
  output: string
): MegaWeatherTierAudit {
  const lines = output.split(/\r?\n/);
  const header = "weather\tcandidate\tstatus\tbossCount\tbosses\tminMarginPercent\tmaxMarginPercent";
  const headerIndex = lines.indexOf(header);
  if (headerIndex < 0) {
    throw new Error(`Unexpected ${weather} audit summary header: ${JSON.stringify(lines[0])}`);
  }
  const result: MegaWeatherTierAudit = new Map();
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line) continue;
    const [reportedWeather, candidate, label] = line.split("\t");
    if (reportedWeather !== weather || !candidate || !label) {
      throw new Error(`Malformed ${weather} audit summary row: ${line}`);
    }
    const combined = label === "Duo leader + catch-aligned";
    const catchAligned = combined || label === "Catch-aligned duo leader";
    const outright = combined || label === "Duo leader";
    if (!catchAligned && !outright) {
      throw new Error(`Unknown ${weather} audit status: ${label}`);
    }
    const existing = result.get(candidate) ?? {
      outrightAndCatchAligned: false,
      catchAligned: false,
      outright: false
    };
    existing.outrightAndCatchAligned ||= combined;
    existing.catchAligned ||= catchAligned;
    existing.outright ||= outright;
    result.set(candidate, existing);
  }
  return result;
}
