import { loadMasterfile, type Masterfile } from "../lib/pogo/masterfile";
import {
  buildMaxDpsRows,
  formatMaxDpsRow,
  listMaxBattleTypeNames,
  type MaxDpsRow
} from "../lib/pogo/maxbattle";
import {
  listDoubleWeaknessPresets,
  type DoubleWeaknessPreset
} from "../lib/pogo/pvpdps";

const PAGE_SIZE = 50;
const NO_TYPE_VALUE = "None";
const NO_PRESET_VALUE = "None";
const ADVENTURE_EFFECTS_PARAM = "adventureeffects";

function isTruthyParam(value: string | null): boolean {
  return value !== "0" && value !== "false";
}

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("maxdps-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function populateTypeSelect(masterfile: Masterfile, id: string): void {
  const select = document.getElementById(id) as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  const currentValue = (select.dataset.initialValue ?? select.value) || NO_TYPE_VALUE;
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

function populateDoubleWeaknessSelect(presets: DoubleWeaknessPreset[]): void {
  const select = document.getElementById("doubleweakness") as HTMLSelectElement | null;
  if (!select) {
    return;
  }
  const currentValue = (select.dataset.initialValue ?? select.value) || NO_PRESET_VALUE;
  select.replaceChildren();
  const noneOption = document.createElement("option");
  noneOption.value = NO_PRESET_VALUE;
  noneOption.textContent = NO_PRESET_VALUE;
  select.append(noneOption);
  for (const preset of presets) {
    const option = document.createElement("option");
    option.value = preset.value;
    option.textContent = preset.label;
    select.append(option);
  }
  if (Array.from(select.options).some((option) => option.value === currentValue)) {
    select.value = currentValue;
  } else {
    select.value = NO_PRESET_VALUE;
  }
  delete select.dataset.initialValue;
}

function updateQueryParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim() && value !== NO_TYPE_VALUE) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}

function updateUrl(): void {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  updateQueryParam(params, "type1", (document.getElementById("type1") as HTMLSelectElement).value);
  updateQueryParam(params, "type2", (document.getElementById("type2") as HTMLSelectElement).value);
  const adventureEffectsEnabled =
    (document.getElementById("adventureeffects") as HTMLInputElement | null)?.checked ?? true;
  if (!adventureEffectsEnabled) {
    params.set(ADVENTURE_EFFECTS_PARAM, "0");
  }
  url.search = params.toString();
  history.replaceState(null, "", url);
}

function renderRows(masterfile: Masterfile, rows: MaxDpsRow[], visibleCount: number): void {
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
  if (!tbody) {
    return;
  }
  tbody.innerHTML = rows
    .slice(0, visibleCount)
    .map((row, index) => {
      const display = formatMaxDpsRow(masterfile, row);
      return `<tr><td>${index + 1}</td><td>${display.pokemon}</td><td>${display.form}</td><td>${display.level}</td><td>${display.cp}</td><td>${display.move}</td><td>${display.dps}</td><td>${display.tdo}</td></tr>`;
    })
    .join("");
  if (!showMoreButton) {
    return;
  }
  showMoreButton.hidden = visibleCount >= rows.length;
}

export function initMaxDpsPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    let masterfile: Masterfile | null = null;
    let presets: DoubleWeaknessPreset[] = [];
    let rows: MaxDpsRow[] = [];
    let visibleCount = PAGE_SIZE;

    const getTypeSelect = (id: string): HTMLSelectElement =>
      document.getElementById(id) as HTMLSelectElement;

    const syncDoubleWeaknessSelect = (): void => {
      const presetSelect = document.getElementById("doubleweakness") as HTMLSelectElement | null;
      if (!presetSelect) {
        return;
      }
      const type1 = getTypeSelect("type1").value;
      const type2 = getTypeSelect("type2").value;
      const matches = presets.filter(
        (preset) => preset.defenderType1 === type1 && preset.defenderType2 === type2
      );
      if (matches.some((preset) => preset.value === presetSelect.value)) {
        return;
      }
      presetSelect.value = matches.length === 1 ? matches[0].value : NO_PRESET_VALUE;
    };

    const sync = (): void => {
      if (!masterfile) {
        return;
      }
      updateUrl();
      visibleCount = PAGE_SIZE;
      rows = buildMaxDpsRows(masterfile, {
        type1: (document.getElementById("type1") as HTMLSelectElement | null)?.value ?? NO_TYPE_VALUE,
        type2: (document.getElementById("type2") as HTMLSelectElement | null)?.value ?? NO_TYPE_VALUE,
        adventureEffects:
          (document.getElementById("adventureeffects") as HTMLInputElement | null)?.checked ?? true
      });
      renderRows(masterfile, rows, visibleCount);
    };

    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      sync();
    });

    for (const id of ["type1", "type2"]) {
      const typeSelect = document.getElementById(id) as HTMLSelectElement | null;
      if (!typeSelect) {
        continue;
      }
      typeSelect.dataset.initialValue = params.get(id) ?? NO_TYPE_VALUE;
      typeSelect.addEventListener("change", () => {
        syncDoubleWeaknessSelect();
        sync();
      });
    }
    const presetSelect = document.getElementById("doubleweakness") as HTMLSelectElement | null;
    if (presetSelect) {
      presetSelect.dataset.initialValue = NO_PRESET_VALUE;
      presetSelect.addEventListener("change", () => {
        const preset = presets.find((item) => item.value === presetSelect.value);
        const type1Select = getTypeSelect("type1");
        const type2Select = getTypeSelect("type2");
        if (!preset) {
          type1Select.value = NO_TYPE_VALUE;
          type2Select.value = NO_TYPE_VALUE;
        } else {
          type1Select.value = preset.defenderType1;
          type2Select.value = preset.defenderType2;
        }
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
      if (!masterfile) {
        return;
      }
      renderRows(masterfile, rows, visibleCount);
    });

    setStatus("Loading Pokemon data for the table…");
    void loadMasterfile()
      .then((loadedMasterfile) => {
        masterfile = loadedMasterfile;
        presets = listDoubleWeaknessPresets(loadedMasterfile);
        populateTypeSelect(loadedMasterfile, "type1");
        populateTypeSelect(loadedMasterfile, "type2");
        populateDoubleWeaknessSelect(presets);
        syncDoubleWeaknessSelect();
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
