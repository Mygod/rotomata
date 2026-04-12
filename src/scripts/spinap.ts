import { analyzeSpinap } from "../lib/pogo/spinap";

function work(): void {
  const result = analyzeSpinap({
    balls: parseInt((document.getElementById("balls") as HTMLInputElement).value, 10),
    lv25: (document.getElementById("lv25") as HTMLInputElement).checked,
    candyxl: (document.getElementById("candyxl") as HTMLInputElement).checked,
    spinap: (document.getElementById("spinap") as HTMLInputElement).checked,
    beastBall: (document.getElementById("beastball") as HTMLInputElement).checked,
    medalValue: parseInt((document.getElementById("medal") as HTMLInputElement).value, 10),
    tradedist: parseInt((document.getElementById("tradedist") as HTMLInputElement).value, 10),
    megaLevel: parseInt((document.getElementById("mega") as HTMLInputElement).value, 10),
    candyEventThrow: parseInt((document.getElementById("event-candythrow") as HTMLInputElement).value, 10),
    thr: parseFloat((document.getElementById("thr") as HTMLInputElement).value),
    bcr: parseFloat((document.getElementById("bcr") as HTMLInputElement).value),
    xlBase: parseInt((document.getElementById("xlBase") as HTMLInputElement).value, 10),
    curve: (document.getElementById("curve") as HTMLInputElement).checked,
    rich: (document.getElementById("rich") as HTMLInputElement).checked,
    candyTransfer: parseFloat((document.getElementById("candyTransfer") as HTMLInputElement).value),
    candyGrazz: parseInt((document.getElementById("candyGrazz") as HTMLInputElement).value, 10)
  });
  const recommendation = document.getElementById("result");
  const details = document.getElementById("details");
  if (recommendation) {
    recommendation.textContent = result.recommendation;
  }
  if (details) {
    details.innerHTML = result.detailsHtml;
  }
  (document.getElementById("tradedist-display") as HTMLElement).innerText = result.tradedistDisplay;
  (document.getElementById("mega-display") as HTMLElement).innerText = result.megaDisplay;
  (document.getElementById("medal-display") as HTMLElement).innerText = result.medalDisplay;
  (document.getElementById("event-candythrow-display") as HTMLElement).innerText =
    result.eventCandyThrowDisplay;
}

export function initSpinapPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    for (const input of form.getElementsByTagName("input")) {
      input.addEventListener("change", work);
    }
    work();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
