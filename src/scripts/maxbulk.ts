import { loadMasterfile, type Masterfile } from "../lib/pogo/masterfile";
import {
  buildMaxBulkRows,
  formatMaxBulkRow,
  listMaxBattleTypeNames,
  type MaxBulkRow
} from "../lib/pogo/maxbattle";

const PAGE_SIZE = 50;
const NO_TYPE_VALUE = "";
const ADVENTURE_EFFECTS_PARAM = "adventureeffects";

function isTruthyParam(value: string | null): boolean {
  return value !== "0" && value !== "false";
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("maxbulk-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function populateTypeSelect(masterfile: Masterfile): void {
  const select = document.getElementById("type") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  const currentValue = select.dataset.initialValue ?? select.value ?? NO_TYPE_VALUE;
  select.replaceChildren();
  const noneOption = document.createElement("option");
  noneOption.value = NO_TYPE_VALUE;
  noneOption.textContent = "None";
  select.append(noneOption);
  for (const typeName of listMaxBattleTypeNames(masterfile)) {
    const option = document.createElement("option");
    option.value = typeName;
    option.textContent = typeName;
    select.append(option);
  }
  if (Array.from(select.options).some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else {
    select.value = NO_TYPE_VALUE;
  }
  delete select.dataset.initialValue;
}

function updateUrl(): void {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  const value = (document.getElementById("type") as HTMLSelectElement | null)?.value ?? NO_TYPE_VALUE;
  if (value.trim()) {
    params.set("type", value);
  }
  const adventureEffectsEnabled =
    (document.getElementById("adventureeffects") as HTMLInputElement | null)?.checked ?? true;
  if (!adventureEffectsEnabled) {
    params.set(ADVENTURE_EFFECTS_PARAM, "0");
  }
  url.search = params.toString();
  history.replaceState(null, "", url);
}

function renderRows(rows: MaxBulkRow[], visibleCount: number): void {
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
  if (!tbody) {
    return;
  }
  tbody.innerHTML = rows
    .slice(0, visibleCount)
    .map((row) => {
      const display = formatMaxBulkRow(row);
      return `<tr><td>${display.pokemon}</td><td>${display.form}</td><td>${display.level}</td><td>${display.cp}</td><td>${display.bulk}</td><td>${display.tdo}</td><td>${display.fast}</td><td>${display.gmax}</td></tr>`;
    })
    .join("");
  if (!showMoreButton) {
    return;
  }
  showMoreButton.hidden = visibleCount >= rows.length;
}

export function initMaxBulkPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    let masterfile: Masterfile | null = null;
    let rows: MaxBulkRow[] = [];
    let visibleCount = PAGE_SIZE;

    const sync = (): void => {
      if (!masterfile) {
        return;
      }
      updateUrl();
      visibleCount = PAGE_SIZE;
      rows = buildMaxBulkRows(masterfile, {
        type: (document.getElementById("type") as HTMLSelectElement | null)?.value ?? NO_TYPE_VALUE,
        adventureEffects:
          (document.getElementById("adventureeffects") as HTMLInputElement | null)?.checked ?? true
      });
      renderRows(rows, visibleCount);
    };

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      sync();
    });

    const typeSelect = document.getElementById("type") as HTMLSelectElement | null;
    if (typeSelect) {
      typeSelect.dataset.initialValue = params.get("type") ?? NO_TYPE_VALUE;
      typeSelect.addEventListener("change", () => {
        sync();
      });
    }
    const adventureEffectsCheckbox = document.getElementById("adventureeffects") as HTMLInputElement | null;
    if (adventureEffectsCheckbox) {
      const value = params.get(ADVENTURE_EFFECTS_PARAM);
      adventureEffectsCheckbox.checked = value === null ? true : isTruthyParam(value);
      adventureEffectsCheckbox.addEventListener("change", () => {
        sync();
      });
    }

    const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
    showMoreButton?.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderRows(rows, visibleCount);
    });

    setStatus("Loading Pokemon data for the table…");
    void loadMasterfile()
      .then((loadedMasterfile) => {
        masterfile = loadedMasterfile;
        populateTypeSelect(loadedMasterfile);
        sync();
        setStatus("Pokemon data loaded.");
      })
      .catch(() => {
        setStatus("Pokemon data unavailable. Results cannot be generated.", true);
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
