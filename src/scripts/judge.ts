import { loadPokedex, type PokedexEntry } from "../lib/pogo/pokedex";
import { calculateCP, findMinLevel, parseStatsList, renderJudgeHtml } from "../lib/pogo/parity";

function populatePokedex(entries: PokedexEntry[]): void {
  const pokelist = document.getElementById("pokelist") as HTMLDataListElement | null;
  if (!pokelist) {
    return;
  }
  pokelist.replaceChildren();
  for (const poke of entries) {
    const option = document.createElement("option");
    option.innerText = `#${poke.id}: ${poke.name}`;
    option.value = `${poke.at}/${poke.df}/${poke.st}`;
    pokelist.append(option);
  }
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("judge-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function work(): void {
  const result = document.getElementById("result");
  const statsInput = document.getElementById("stats") as HTMLInputElement;
  const cpCapsInput = document.getElementById("cpcap") as HTMLInputElement;
  const lvCapsInput = document.getElementById("lvcap") as HTMLInputElement;
  const ivFloorInput = document.getElementById("ivfloor") as HTMLInputElement;
  const atkInput = document.getElementById("atk") as HTMLInputElement;
  const defInput = document.getElementById("def") as HTMLInputElement;
  const staInput = document.getElementById("sta") as HTMLInputElement;
  const cpInput = document.getElementById("cp") as HTMLInputElement;
  if (!result) {
    return;
  }
  const pvpStatUrl = new URL("/pvpstat", window.location.origin);
  result.innerHTML = renderJudgeHtml(
    {
      statsList: parseStatsList(statsInput.value),
      cpCaps: cpCapsInput.value.split(",").map(Number),
      lvCaps: lvCapsInput.value.split(",").map(Number),
      ivFloor: parseInt(ivFloorInput.value, 10),
      ivAtk: parseInt(atkInput.value, 10),
      ivDef: parseInt(defInput.value, 10),
      ivSta: parseInt(staInput.value, 10),
      currentCp: parseInt(cpInput.value, 10)
    },
    pvpStatUrl
  );
}

async function hydratePokedex(): Promise<void> {
  setStatus("Loading Pokemon data for the picker…");
  try {
    const loaded = await loadPokedex((entries) => {
      populatePokedex(entries);
      setStatus("Pokemon data refreshed from upstream.");
    });
    populatePokedex(loaded.entries);
    setStatus(
      loaded.source === "cache"
        ? "Using cached Pokemon data. A background refresh will run when needed."
        : "Pokemon data loaded from upstream."
    );
  } catch {
    setStatus("Pokemon list unavailable. Manual base stats still work.", true);
  }
}

export function initJudgePage(): void {
  const run = (): void => {
    const forms = document.getElementsByTagName("form");
    const pickerInput = document.getElementById("statspicker") as HTMLInputElement;
    const statsInput = document.getElementById("stats") as HTMLInputElement;
    const addStatsButton = document.getElementById("addstats");
    const purifyButton = document.getElementById("purify");
    const lvCapsInput = document.getElementById("lvcap") as HTMLInputElement;
    const ivAtkInput = document.getElementById("atk") as HTMLInputElement;
    const ivDefInput = document.getElementById("def") as HTMLInputElement;
    const ivStaInput = document.getElementById("sta") as HTMLInputElement;
    const cpInput = document.getElementById("cp") as HTMLInputElement;
    const params = new URLSearchParams(window.location.search);

    for (const input of forms[1].getElementsByTagName("input")) {
      const value = params.get(input.id);
      if (value !== null) {
        input.value = value;
      }
      input.addEventListener("change", work);
    }

    addStatsButton?.addEventListener("click", () => {
      statsInput.value += `${statsInput.value ? "," : ""}${pickerInput.value}`;
      work();
    });

    purifyButton?.addEventListener("click", () => {
      const statsArray = parseStatsList(statsInput.value);
      const lvCapArray = lvCapsInput.value.split(",").map(Number);
      let ivAtk = parseInt(ivAtkInput.value, 10);
      let ivDef = parseInt(ivDefInput.value, 10);
      let ivSta = parseInt(ivStaInput.value, 10);
      const currentCp = parseInt(cpInput.value, 10);
      const lvCapMax = Math.max(...lvCapArray);
      let currentLevel: number | undefined;
      let currentStats = statsArray[0];
      for (const stats of statsArray) {
        const level = Number.isNaN(currentCp)
          ? 0
          : findMinLevel(stats, ivAtk, ivDef, ivSta, currentCp, lvCapMax);
        if (!level) {
          continue;
        }
        currentStats = stats;
        currentLevel = level;
        break;
      }
      ivAtkInput.value = String((ivAtk = Math.min(15, ivAtk + 2)));
      ivDefInput.value = String((ivDef = Math.min(15, ivDef + 2)));
      ivStaInput.value = String((ivSta = Math.min(15, ivSta + 2)));
      if (currentLevel && currentStats) {
        cpInput.value = String(calculateCP(currentStats, ivAtk, ivDef, ivSta, Math.max(25, currentLevel)));
      }
      work();
    });

    void hydratePokedex();
    work();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
