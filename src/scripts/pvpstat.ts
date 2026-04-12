import { loadPokemonCatalog, type PokedexEntry } from "../lib/pogo/pokedex";
import { parseStatsTriple, renderPvpStatHtml } from "../lib/pogo/parity";

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
  const status = document.getElementById("pvpstat-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function work(): void {
  const result = document.getElementById("result");
  const statsInput = document.getElementById("stats") as HTMLInputElement;
  const cpCapInput = document.getElementById("cpcap") as HTMLInputElement;
  const lvCapInput = document.getElementById("lvcap") as HTMLInputElement;
  const ivFloorInput = document.getElementById("ivfloor") as HTMLInputElement;
  const atkInput = document.getElementById("atk") as HTMLInputElement;
  const defInput = document.getElementById("def") as HTMLInputElement;
  const staInput = document.getElementById("sta") as HTMLInputElement;
  if (!result) {
    return;
  }
  result.innerHTML = renderPvpStatHtml({
    stats: parseStatsTriple(statsInput.value),
    cpCap: parseInt(cpCapInput.value, 10),
    lvCap: parseFloat(lvCapInput.value),
    ivFloor: parseInt(ivFloorInput.value, 10),
    ivAtk: parseInt(atkInput.value, 10),
    ivDef: parseInt(defInput.value, 10),
    ivSta: parseInt(staInput.value, 10)
  });
}

async function hydratePokedex(): Promise<void> {
  setStatus("Loading Pokemon data for the picker…");
  try {
    const loaded = await loadPokemonCatalog((catalog) => {
      populatePokedex(catalog.statEntries);
      setStatus("Pokemon data refreshed from upstream.");
    });
    populatePokedex(loaded.catalog.statEntries);
    setStatus(
      loaded.source === "cache"
        ? "Using cached Pokemon data. A background refresh will run when needed."
        : "Pokemon data loaded from upstream."
    );
  } catch {
    setStatus("Pokemon list unavailable. Manual base stats still work.", true);
  }
}

export function initPvpStatPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    for (const input of form.getElementsByTagName("input")) {
      const value = params.get(input.id);
      if (value !== null) {
        input.value = value;
      }
      input.addEventListener("change", work);
    }
    void hydratePokedex();
    work();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
