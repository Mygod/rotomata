import { loadPokemonCatalog, type PokedexEntry } from "../lib/pogo/pokedex";
import { parseStatsTriple } from "../lib/pogo/parity";
import { buildPvpbpResult } from "../lib/pogo/pvpbp";

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

function populateList(id: string, values: string[]): void {
  const list = document.getElementById(id) as HTMLDataListElement | null;
  if (!list) {
    return;
  }
  list.replaceChildren();
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    list.append(option);
  }
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("pvpbp-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function work(): void {
  const statsInput = document.getElementById("stats") as HTMLInputElement;
  const cpCapInput = document.getElementById("cpcap") as HTMLInputElement;
  const lvCapInput = document.getElementById("lvcap") as HTMLInputElement;
  const ivFloorInput = document.getElementById("ivfloor") as HTMLInputElement;
  const suboptimalInput = document.getElementById("suboptimal") as HTMLInputElement;
  const minCpInput = document.getElementById("mincp") as HTMLInputElement;
  const maxLvInput = document.getElementById("maxlv") as HTMLInputElement;
  const minIvInput = document.getElementById("miniv") as HTMLInputElement;
  const atkInput = document.getElementById("atk") as HTMLInputElement;
  const defInput = document.getElementById("def") as HTMLInputElement;
  const staInput = document.getElementById("sta") as HTMLInputElement;
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  if (!tbody) {
    return;
  }
  const result = buildPvpbpResult(
    {
      stats: parseStatsTriple(statsInput.value),
      statsString: statsInput.value,
      cpCap: parseInt(cpCapInput.value, 10),
      lvCap: parseFloat(lvCapInput.value),
      ivFloor: parseInt(ivFloorInput.value, 10),
      suboptimal: suboptimalInput.checked,
      minCp: parseInt(minCpInput.value, 10) || 0,
      maxLevel: parseFloat(maxLvInput.value) || Infinity,
      minIv: parseInt(minIvInput.value, 10),
      floorAtk: parseFloat(atkInput.value),
      floorDef: parseFloat(defInput.value),
      floorSta: parseInt(staInput.value, 10)
    },
    new URL("/pvpstat", window.location.origin)
  );
  tbody.innerHTML = result.rows
    .map(
      (row) =>
        `<tr><td><a href="${row.detailHref}" target="_blank" rel="noreferrer">${row.iv}</a></td><td>${row.level}</td><td>${row.cp}</td><td>${row.attack}</td><td>${row.defense}</td><td>${row.hp}</td><td>${row.statProduct}</td><td>${row.no}</td><td>${row.rank}</td><td>${row.nspp}</td><td>${row.cp20}</td><td>${row.cp25}</td></tr>`
    )
    .join("");
  populateList("atklist", result.atkOptions);
  populateList("deflist", result.defOptions);
  populateList("stalist", result.staOptions);
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

export function initPvpbpPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    for (const input of form.getElementsByTagName("input")) {
      const value = params.get(input.id);
      if (value !== null) {
        if (input.type === "checkbox") {
          input.checked = true;
        } else {
          input.value = value;
        }
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
