import { describe, expect, it } from "vitest";

import {
  CP_MULTIPLIERS,
  type BaseStats,
  renderJudgeHtml,
  renderPvpStatHtml
} from "../src/lib/pogo/parity";
import { buildPokemonCatalog, normalizeMasterfile } from "../src/lib/pogo/pokedex";

function referenceCalculateCpMultiplier(level: number): number {
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

function referenceCalculateCP(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  level: number
): number {
  const multiplier = referenceCalculateCpMultiplier(level);
  const a = stats.attack + attack;
  const d = stats.defense + defense;
  const s = stats.stamina + stamina;
  const cp = Math.floor((multiplier * multiplier * a * Math.sqrt(d * s)) / 10);
  return cp < 10 ? 10 : cp;
}

function referenceCalculateStats(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  level: number
): { atk: number; def: number; sta: number; lv: number } {
  const multiplier = referenceCalculateCpMultiplier(level);
  const hp = Math.floor((stamina + stats.stamina) * multiplier);
  return {
    atk: (attack + stats.attack) * multiplier,
    def: (defense + stats.defense) * multiplier,
    sta: hp < 10 ? 10 : hp,
    lv: level
  };
}

function referenceCalculatePvPStat(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  cap: number,
  lvCap: number
): ({ atk: number; def: number; sta: number; lv: number; cp: number } & Record<string, unknown>) | null {
  let bestCP = referenceCalculateCP(stats, attack, defense, stamina, 1);
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
    const cp = referenceCalculateCP(stats, attack, defense, stamina, mid);
    if (cp <= cap) {
      lowest = mid;
      bestCP = cp;
    } else {
      highest = mid - 0.5;
    }
  }
  const result = referenceCalculateStats(stats, attack, defense, stamina, lowest);
  return {
    ...result,
    cp: bestCP
  };
}

function referenceFindMinLevel(
  stats: BaseStats,
  attack: number,
  defense: number,
  stamina: number,
  target: number,
  lvCap: number
): number {
  let bestCP = referenceCalculateCP(stats, attack, defense, stamina, lvCap);
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
    const cp = referenceCalculateCP(stats, attack, defense, stamina, mid);
    if (cp >= target) {
      highest = mid;
      bestCP = cp;
    } else {
      lowest = mid + 0.5;
    }
  }
  return referenceCalculateCP(stats, attack, defense, stamina, highest) === target ? highest : 0;
}

function referenceDiffFloat(value: number, precision = 2): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(precision)}`;
}

function referenceStrictlyDominates(
  currentStat: { atk: number; def: number; sta: number },
  mine: { atk: number; def: number; sta: number }
): boolean {
  return (
    currentStat.atk >= mine.atk &&
    currentStat.def >= mine.def &&
    currentStat.sta >= mine.sta &&
    (currentStat.atk !== mine.atk || currentStat.def !== mine.def || currentStat.sta !== mine.sta)
  );
}

function referenceCalculateStyle(
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

function referenceRenderPvpStatHtml(input: {
  stats: BaseStats;
  cpCap: number;
  lvCap: number;
  ivFloor: number;
  ivAtk: number;
  ivDef: number;
  ivSta: number;
}): string {
  const mine = referenceCalculatePvPStat(
    input.stats,
    input.ivAtk,
    input.ivDef,
    input.ivSta,
    input.cpCap,
    input.lvCap
  );
  if (mine === null) {
    return "You are overleveled even at level 1";
  }
  const myProduct = mine.atk * mine.def * mine.sta;
  let maxA = 0;
  let maxD = 0;
  let maxS = 0;
  let bestProduct: number | null = null;
  const allStats: Array<Record<string, unknown>> = [];
  const strictlyDominated: string[] = [];
  for (let a = input.ivFloor; a <= 15; a += 1) {
    for (let d = input.ivFloor; d <= 15; d += 1) {
      for (let s = input.ivFloor; s <= 15; s += 1) {
        const currentStat = referenceCalculatePvPStat(input.stats, a, d, s, input.cpCap, input.lvCap);
        if (currentStat === null) {
          continue;
        }
        currentStat.product = currentStat.atk * currentStat.def * currentStat.sta;
        if (bestProduct === null || currentStat.product > bestProduct) {
          bestProduct = currentStat.product as number;
        }
        for (const other of allStats) {
          if (referenceStrictlyDominates(other as never, currentStat)) {
            currentStat.rank = null;
            break;
          } else if (referenceStrictlyDominates(currentStat, other as never)) {
            other.rank = null;
          }
        }
        currentStat.a = a;
        currentStat.d = d;
        currentStat.s = s;
        allStats.push(currentStat);
        if ((currentStat.atk as number) > maxA) {
          maxA = currentStat.atk as number;
        }
        if ((currentStat.def as number) > maxD) {
          maxD = currentStat.def as number;
        }
        if ((currentStat.sta as number) > maxS) {
          maxS = currentStat.sta as number;
        }
      }
    }
  }
  allStats.sort(
    (a, b) =>
      (b.product as number) - (a.product as number) ||
      (b.atk as number) - (a.atk as number) ||
      (a.sta as number) - (b.sta as number)
  );
  let lastStat: Record<string, unknown> | undefined;
  let nextRank = 1;
  let myRank: number | string = "?";
  let betterAs = 0;
  let betterDs = 0;
  let betterSs = 0;
  for (const stat of allStats) {
    if (stat.rank !== null) {
      if ((stat.atk as number) > mine.atk) {
        betterAs += 1;
      }
      if ((stat.def as number) > mine.def) {
        betterDs += 1;
      }
      if ((stat.sta as number) > mine.sta) {
        betterSs += 1;
      }
      if (referenceStrictlyDominates(stat as never, mine)) {
        strictlyDominated.push(
          `${stat.a}/${stat.d}/${stat.s} (L${stat.lv} ${referenceDiffFloat((stat.atk as number) - mine.atk)}/${referenceDiffFloat((stat.def as number) - mine.def)}/${referenceDiffFloat((stat.sta as number) - mine.sta, 0)})`
        );
      }
      if (
        lastStat === undefined ||
        (stat.product as number) < (lastStat.product as number) ||
        ((stat.product as number) === (lastStat.product as number) &&
          (stat.atk as number) < (lastStat.atk as number))
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
    if ((stat.atk as number) === mine.atk && (stat.def as number) === mine.def && (stat.sta as number) === mine.sta) {
      myRank = stat.rank as number | string;
    }
  }
  const competitors = nextRank - 1;
  const minA = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || (stat.atk as number) > value ? value : (stat.atk as number)),
    maxA
  );
  const minD = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || (stat.def as number) > value ? value : (stat.def as number)),
    maxD
  );
  const minS = allStats.reduce(
    (value, stat) => (typeof stat.rank !== "number" || (stat.sta as number) > value ? value : (stat.sta as number)),
    maxS
  );
  const maxAds = 10000 / Math.max(maxA, maxD, maxS);
  const worstProduct = allStats.reduce(
    (value, stat) =>
      typeof stat.rank !== "number" || (stat.product as number) > value ? value : (stat.product as number),
    bestProduct as number
  );
  let result = `<div>Lv${mine.lv} CP${mine.cp} Rank+${myRank}/${lastStat?.rank}</div>`;
  result += `<div${referenceCalculateStyle("9DB7F5", "6890F0", "445E9C", minA, mine.atk, 100 / maxA, maxAds)}>Attack: ${minA.toFixed(2)}/${mine.atk.toFixed(2)}/${maxA.toFixed(2)}</div> ${betterAs}/${competitors} (${((betterAs / competitors) * 100).toFixed(2)}%) viable combination(s) have higher attack than you`;
  result += `<div${referenceCalculateStyle("A7DB8D", "78C850", "4E8234", minD, mine.def, 100 / maxD, maxAds)}>Defense: ${minD.toFixed(2)}/${mine.def.toFixed(2)}/${maxD.toFixed(2)}</div> ${betterDs}/${competitors} (${((betterDs / competitors) * 100).toFixed(2)}%) viable combination(s) have higher defense than you`;
  result += `<div${referenceCalculateStyle("FF5959", "FF0000", "A60000", minS, mine.sta, 100 / maxS, maxAds)}>HP: ${minS}/${mine.sta}/${maxS}</div> ${betterSs}/${competitors} (${((betterSs / competitors) * 100).toFixed(2)}%) viable combination(s) have higher HP than you`;
  result += `<div${referenceCalculateStyle("FA92B2", "F85888", "A13959", worstProduct, myProduct, 100 / (bestProduct as number))}>Stat product: ${worstProduct.toFixed(0)}/${myProduct.toFixed(0)}/${(bestProduct as number).toFixed(0)}</div>`;
  result += strictlyDominated.length
    ? `<span class="bad">You are strictly beaten by ${strictlyDominated.length} viable combination(s)</span>: ${strictlyDominated.join(", ")}`
    : '<span class="good">Your Pokemon might be the very best like no one ever was</span>';
  return result;
}

function referenceRenderJudgeHtml(input: {
  statsList: BaseStats[];
  cpCaps: number[];
  lvCaps: number[];
  ivFloor: number;
  ivAtk: number;
  ivDef: number;
  ivSta: number;
  currentCp: number;
}, pvpStatUrl: URL): string {
  const lvCapMax = Math.max(...input.lvCaps);
  let inferredLevel = "Unable to infer current level<br />";
  let currentLevel = lvCapMax + 1;
  input.statsList.forEach((stats) => {
    const level = referenceFindMinLevel(stats, input.ivAtk, input.ivDef, input.ivSta, input.currentCp, lvCapMax);
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
        referenceCalculateCP(stats, 15, 15, 15, input.lvCaps[input.lvCaps.length - 1]) <= cpCap
      ) {
        return;
      }
      if (referenceCalculateCP(stats, input.ivAtk, input.ivDef, input.ivSta, currentLevel) > cpCap) {
        return;
      }
      input.lvCaps.some((lvCap) => {
        const mine = referenceCalculatePvPStat(stats, input.ivAtk, input.ivDef, input.ivSta, cpCap, lvCap);
        if (mine === null || mine.lv < currentLevel) {
          return false;
        }
        const allStats: Array<Record<string, unknown>> = [];
        for (let a = input.ivFloor; a <= 15; a += 1) {
          for (let d = input.ivFloor; d <= 15; d += 1) {
            for (let s = input.ivFloor; s <= 15; s += 1) {
              const currentStat = referenceCalculatePvPStat(stats, a, d, s, cpCap, lvCap);
              if (currentStat === null) {
                continue;
              }
              if (referenceStrictlyDominates(currentStat, mine)) {
                return false;
              }
              if (
                allStats.some((other) => {
                  if (referenceStrictlyDominates(other as never, currentStat)) {
                    return true;
                  }
                  if (referenceStrictlyDominates(currentStat, other as never)) {
                    other.rank = null;
                  }
                  return false;
                })
              ) {
                continue;
              }
              currentStat.product = currentStat.atk * currentStat.def * currentStat.sta;
              currentStat.a = a;
              currentStat.d = d;
              currentStat.s = s;
              allStats.push(currentStat);
            }
          }
        }
        allStats.sort(
          (a, b) =>
            (b.product as number) - (a.product as number) ||
            (b.atk as number) - (a.atk as number) ||
            (a.sta as number) - (b.sta as number)
        );
        let lastStat: Record<string, unknown> | undefined;
        let nextRank = 1;
        let myRank: number | string = "?";
        for (const stat of allStats) {
          if (stat.rank !== null) {
            if (
              lastStat === undefined ||
              (stat.product as number) < (lastStat.product as number) ||
              ((stat.product as number) === (lastStat.product as number) &&
                (stat.atk as number) < (lastStat.atk as number))
            ) {
              lastStat = stat;
              stat.rank = nextRank;
            } else {
              stat.rank = lastStat.rank;
            }
            nextRank += 1;
            if (
              (stat.atk as number) === mine.atk &&
              (stat.def as number) === mine.def &&
              (stat.sta as number) === mine.sta
            ) {
              myRank = stat.rank as number | string;
            }
          } else if (
            (stat.atk as number) === mine.atk &&
            (stat.def as number) === mine.def &&
            (stat.sta as number) === mine.sta
          ) {
            return false;
          }
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
        const lvCapDisplay = referenceCalculateCP(stats, 0, 0, 0, lvCap + 0.5) > cpCap ? "" : `/${lvCap}`;
        result += `<a href="${url.toString()}" target="_blank" rel="noreferrer">${stats.attack}/${stats.defense}/${stats.stamina} @ ${mine.cp}/${cpCap}CP Lv${mine.lv}${lvCapDisplay} Rank+${myRank}/${lastStat?.rank}</a><br />`;
        return !lvCapDisplay;
      });
    });
  });
  return inferredLevel + (result || '<span class="bad">Wow what a trash Pokemon plz trade/transfer</span>');
}

describe("CodePen parity helpers", () => {
  it("matches the original PvP stat page for a representative spread", () => {
    const input = {
      stats: { attack: 141, defense: 201, stamina: 181 },
      cpCap: 1500,
      lvCap: 50,
      ivFloor: 0,
      ivAtk: 2,
      ivDef: 4,
      ivSta: 7
    };
    expect(renderPvpStatHtml(input)).toBe(referenceRenderPvpStatHtml(input));
  });

  it("matches the original judge page for a representative spread", () => {
    const stats = { attack: 141, defense: 201, stamina: 181 };
    const input = {
      statsList: [stats],
      cpCaps: [1500, 2500, 50000],
      lvCaps: [50, 51, 60],
      ivFloor: 0,
      ivAtk: 2,
      ivDef: 4,
      ivSta: 7,
      currentCp: referenceCalculateCP(stats, 2, 4, 7, 20)
    };
    const url = new URL("https://rotomata.mygod.be/pvpstat");
    expect(renderJudgeHtml(input, url)).toBe(referenceRenderJudgeHtml(input, url));
  });

  it("normalizes masterfile data into the same picker shape as pokedex.js", () => {
    const entries = normalizeMasterfile({
      pokemon: {
        "3": {
          name: "Venusaur",
          attack: 198,
          defense: 189,
          stamina: 190,
          forms: {
            "169": {
              name: "Clone",
              attack: 199,
              defense: 188,
              stamina: 190
            }
          },
          temp_evolutions: {
            "1": {
              attack: 241,
              defense: 246,
              stamina: 190
            }
          }
        }
      }
    });
    expect(entries).toEqual([
      { id: 3, name: "Venusaur", at: 198, df: 189, st: 190 },
      { id: 3, name: "Venusaur (Clone)", at: 199, df: 188, st: 190 },
      { id: 3, name: "Venusaur (Mega)", at: 241, df: 246, st: 190 }
    ]);
  });

  it("builds a Pokemon-aware judge picker and expands evolution families", () => {
    const catalog = buildPokemonCatalog({
      pokemon: {
        "4": {
          name: "Charmander",
          default_form_id: 172,
          attack: 116,
          defense: 93,
          stamina: 118,
          forms: {
            "172": {
              name: "Normal",
              evolutions: [{ pokemon: 5, form: 175 }]
            }
          },
          evolutions: [{ pokemon: 5, form: 175 }]
        },
        "5": {
          name: "Charmeleon",
          default_form_id: 175,
          attack: 158,
          defense: 126,
          stamina: 151,
          forms: {
            "175": {
              name: "Normal",
              evolutions: [{ pokemon: 6, form: 178 }]
            }
          },
          evolutions: [{ pokemon: 6, form: 178 }]
        },
        "6": {
          name: "Charizard",
          default_form_id: 178,
          attack: 223,
          defense: 173,
          stamina: 186,
          forms: {
            "178": {
              name: "Normal",
              temp_evolutions: {
                "2": {},
                "3": {}
              }
            }
          },
          temp_evolutions: {
            "2": {
              attack: 273,
              defense: 213,
              stamina: 186
            },
            "3": {
              attack: 319,
              defense: 212,
              stamina: 186
            }
          }
        },
        "155": {
          name: "Cyndaquil",
          default_form_id: 924,
          attack: 116,
          defense: 93,
          stamina: 118,
          forms: {
            "924": {
              name: "Normal"
            }
          }
        }
      }
    });
    expect(catalog.judgeEntries.map((entry) => entry.value)).toEqual([
      "#4: Charmander",
      "#5: Charmeleon",
      "#6: Charizard",
      "#155: Cyndaquil"
    ]);
    expect(catalog.judgeEntries[0].stats).toBe("116/93/118");
    expect(catalog.judgeEntries[0].familyStats).toEqual([
      "116/93/118",
      "158/126/151",
      "223/173/186",
      "273/213/186",
      "319/212/186"
    ]);
    expect(catalog.judgeEntries[3].familyStats).toEqual(["116/93/118"]);
  });
});
