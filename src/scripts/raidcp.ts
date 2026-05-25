import { loadPokemonCatalog, type PokedexEntry } from "../lib/pogo/pokedex";
import { parseStatsTriple } from "../lib/pogo/parity";
import { buildRaidCpResult, type RaidCpHpMode } from "../lib/pogo/raidcp";

const CHECKBOX_DEFAULTS: Record<string, boolean> = {
  fullatk: false,
  fulldef: false,
  purify: false,
  purifyatk: true,
  purifydef: true
};
const SELECT_DEFAULTS: Record<string, string> = {
  hpmode: "any",
  purifyhpmode: "full"
};

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
  const status = document.getElementById("raidcp-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function updateTextParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim()) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function updateCheckboxParam(params: URLSearchParams, key: string): void {
  const input = document.getElementById(key) as HTMLInputElement;
  if (input.checked === CHECKBOX_DEFAULTS[key]) {
    return;
  }
  params.set(key, input.checked ? "1" : "0");
}

function updateSelectParam(params: URLSearchParams, key: string): void {
  const select = document.getElementById(key) as HTMLSelectElement;
  if (select.value === SELECT_DEFAULTS[key]) {
    return;
  }
  params.set(key, select.value);
}

function updateUrl(): void {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  updateTextParam(params, "stats", (document.getElementById("stats") as HTMLInputElement).value);
  updateTextParam(params, "ivfloor", (document.getElementById("ivfloor") as HTMLInputElement).value);
  updateCheckboxParam(params, "fullatk");
  updateCheckboxParam(params, "fulldef");
  updateSelectParam(params, "hpmode");
  updateCheckboxParam(params, "purify");
  updateCheckboxParam(params, "purifyatk");
  updateCheckboxParam(params, "purifydef");
  updateSelectParam(params, "purifyhpmode");
  url.search = params.toString();
  history.replaceState(null, "", url);
}

function syncPurifyControls(): void {
  const includePurified = (document.getElementById("purify") as HTMLInputElement).checked;
  for (const id of ["purifyatk", "purifydef", "purifyhpmode"]) {
    (document.getElementById(id) as HTMLInputElement | HTMLSelectElement).disabled = !includePurified;
  }
}

function work(): void {
  const statsInput = document.getElementById("stats") as HTMLInputElement;
  const ivFloorInput = document.getElementById("ivfloor") as HTMLInputElement;
  const fullAttackInput = document.getElementById("fullatk") as HTMLInputElement;
  const fullDefenseInput = document.getElementById("fulldef") as HTMLInputElement;
  const hpModeSelect = document.getElementById("hpmode") as HTMLSelectElement;
  const purifyInput = document.getElementById("purify") as HTMLInputElement;
  const purifyAttackInput = document.getElementById("purifyatk") as HTMLInputElement;
  const purifyDefenseInput = document.getElementById("purifydef") as HTMLInputElement;
  const purifyHpModeSelect = document.getElementById("purifyhpmode") as HTMLSelectElement;
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  if (!tbody) {
    return;
  }
  const result = buildRaidCpResult(
    {
      stats: parseStatsTriple(statsInput.value),
      statsString: statsInput.value,
      ivFloor: parseInt(ivFloorInput.value, 10),
      naturalTarget: {
        fullAttack: fullAttackInput.checked,
        fullDefense: fullDefenseInput.checked,
        hpMode: hpModeSelect.value as RaidCpHpMode
      },
      includePurified: purifyInput.checked,
      purifiedTarget: {
        fullAttack: purifyAttackInput.checked,
        fullDefense: purifyDefenseInput.checked,
        hpMode: purifyHpModeSelect.value as RaidCpHpMode
      }
    },
    new URL("/pvpstat", window.location.origin)
  );
  tbody.innerHTML = result.rows
    .map(
      (row) =>
        `<tr><td><a href="${row.detailHref}" target="_blank" rel="noreferrer">${row.iv}</a></td><td>${row.level}</td><td>${row.cp}</td><td>${row.attack}</td><td>${row.defense}</td><td>${row.hp}</td><td>${row.statProduct}</td><td>${row.no}</td><td>${row.cp20}</td><td>${row.cp25}</td></tr>`
    )
    .join("");
}

async function hydratePokedex(): Promise<void> {
  setStatus("Loading Pokemon data for the picker…");
  try {
    const catalog = await loadPokemonCatalog();
    populatePokedex(catalog.statEntries);
    setStatus("Pokemon data loaded.");
  } catch {
    setStatus("Pokemon list unavailable. Manual base stats still work.", true);
  }
}

export function initRaidCpPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    const sync = (shouldUpdateUrl = true): void => {
      syncPurifyControls();
      work();
      if (shouldUpdateUrl) {
        updateUrl();
      }
    };
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      sync();
    });
    for (const input of form.getElementsByTagName("input")) {
      const value = params.get(input.id);
      if (value !== null) {
        if (input.type === "checkbox") {
          input.checked = value !== "0" && value !== "false";
        } else {
          input.value = value;
        }
      }
      input.addEventListener("change", () => {
        sync();
      });
    }
    for (const select of form.getElementsByTagName("select")) {
      const value = params.get(select.id);
      if (value !== null) {
        select.value = value;
      }
      select.addEventListener("change", () => {
        sync();
      });
    }
    void hydratePokedex();
    sync(false);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
