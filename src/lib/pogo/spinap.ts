export interface SpinapInput {
  balls: number;
  lv25: boolean;
  candyxl: boolean;
  spinap: boolean;
  beastBall: boolean;
  medalValue: number;
  tradedist: number;
  megaLevel: number;
  candyEventThrow: number;
  thr: number;
  bcr: number;
  xlBase: number;
  curve: boolean;
  rich: boolean;
  candyTransfer: number;
  candyGrazz: number;
}

export interface SpinapResult {
  recommendation: string;
  detailsHtml: string;
  medalDisplay: string;
  tradedistDisplay: string;
  megaDisplay: string;
  eventCandyThrowDisplay: string;
}

const TRADE_DISTANCE_LABELS = ["N/A", "10km-", "10--100km", "100km+"];
const EVENT_CANDY_THROW_LABELS = ["None/No event", "Nice", "Great", "Excellent"];

export function analyzeSpinap(input: SpinapInput): SpinapResult {
  const medal = 1 + input.medalValue * 0.05;
  const candyBase = input.candyGrazz + input.candyEventThrow;
  let candyBonus = input.candyTransfer + input.tradedist + [0, 1, 1, 2][input.megaLevel];
  if (input.candyxl) {
    candyBonus +=
      (3 + input.candyEventThrow) * ((input.lv25 ? 15 : 10) + [0, 0, 10, 25][input.megaLevel]);
    candyBonus += input.lv25 ? (input.rich ? 50 - 3 * 2 : 37.5) : 25;
    candyBonus += input.xlBase * 100;
    candyBonus += [0, 10, 25, 100][input.tradedist];
  }
  const candyPinap = Math.floor((input.spinap ? 2.3334 : 2) * candyBase) + candyBonus;
  const candyGrazz = candyBase + candyBonus;
  const ball = 1;
  const pinap = input.spinap ? 1.8 : 1;
  const grazz = 2.5;
  const cpmultiplier = input.lv25 ? 0.667934 : 0.5974;
  const curve = input.curve ? 1.7 : 1;
  let x = 0;
  let p = 0;
  let grazzCount = 0;
  let pinapStart = -1;
  let detailsHtml = "";
  for (let i = 1; i <= input.balls; i += 1) {
    const rm = input.beastBall ? 20 : 1.05 ** (input.balls - i);
    const probPinap =
      1 - (1 - input.bcr / 2 / cpmultiplier) ** (ball * curve * pinap * input.thr * medal * rm);
    const probGrazz =
      1 - (1 - input.bcr / 2 / cpmultiplier) ** (ball * curve * grazz * input.thr * medal * rm);
    const xPinap = probPinap * candyPinap + (1 - probPinap) * x;
    const xGrazz = probGrazz * candyGrazz + (1 - probGrazz) * x;
    if (xGrazz >= xPinap) {
      p += (1 - p) * probGrazz;
      detailsHtml += `Ball ${i}: grazz ~ ${xGrazz} candies;\t catch probability ~ ${p}; grazz use ~ ${1 + grazzCount * (1 - probGrazz)}<br />`;
      x = xGrazz;
      grazzCount = 1 + grazzCount * (1 - probGrazz);
    } else {
      p += (1 - p) * probPinap;
      detailsHtml += `Ball ${i}: pinap ~ ${xPinap} candies;\t catch probability ~ ${p}; grazz use ~ ${grazzCount * (1 - probPinap)}<br />`;
      x = xPinap;
      grazzCount = grazzCount * (1 - probPinap);
      if (pinapStart < 0) {
        pinapStart = i - 1;
      }
    }
  }
  return {
    recommendation: pinapStart >= 0 ? `for last ${pinapStart} balls` : "at all times",
    detailsHtml,
    medalDisplay: String(input.medalValue * 0.5),
    tradedistDisplay: TRADE_DISTANCE_LABELS[input.tradedist] ?? "",
    megaDisplay: String(input.megaLevel),
    eventCandyThrowDisplay: EVENT_CANDY_THROW_LABELS[input.candyEventThrow] ?? ""
  };
}
