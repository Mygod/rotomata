import { loadMasterfile, type Masterfile } from "../lib/pogo/masterfile";
import {
  buildPvpdpsRows,
  formatPvpdpsRow,
  listDoubleWeaknessPresets,
  listPvpdpsTypeNames,
  type DoubleWeaknessPreset,
  type PvpdpsRow
} from "../lib/pogo/pvpdps";

const PAGE_SIZE = 50;
const NO_TYPE_VALUE = "None";
const NO_PRESET_VALUE = "None";

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("pvpdps-data-status");
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
  for (const typeName of listPvpdpsTypeNames(masterfile)) {
    const option = document.createElement("option");
    option.textContent = typeName;
    option.value = typeName;
    select.append(option);
  }
  if (Array.from(select.options).some((option) => option.value === currentValue)) {
    select.value = currentValue;
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
  updateQueryParam(params, "cpcap", (document.getElementById("cpcap") as HTMLInputElement).value);
  updateQueryParam(params, "type1", (document.getElementById("type1") as HTMLSelectElement).value);
  updateQueryParam(params, "type2", (document.getElementById("type2") as HTMLSelectElement).value);
  if ((document.getElementById("charged") as HTMLInputElement).checked) {
    params.set("charged", "1");
  }
  url.search = params.toString();
  history.replaceState(null, "", url);
}

function renderRows(masterfile: Masterfile, rows: PvpdpsRow[], visibleCount: number): void {
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
  const chargedColumn = document.getElementById("charged-column") as HTMLTableCellElement | null;
  const showCharged = (document.getElementById("charged") as HTMLInputElement | null)?.checked ?? false;
  if (!tbody) {
    return;
  }
  if (chargedColumn) {
    chargedColumn.hidden = !showCharged;
  }
  tbody.innerHTML = rows
    .slice(0, visibleCount)
    .map((row, index) => {
      const display = formatPvpdpsRow(masterfile, row);
      return `<tr><td>${index + 1}</td><td>${display.pokemon}</td><td>${display.form}</td><td>${display.alignment}</td><td>${display.iv}</td><td>${display.level}</td><td>${display.cp}</td><td>${display.quick}</td>${showCharged ? `<td>${display.charged}</td>` : ""}<td>${display.dps}</td><td>${display.tdo}</td></tr>`;
    })
    .join("");
  if (!showMoreButton) {
    return;
  }
  showMoreButton.hidden = visibleCount >= rows.length;
}

export function initPvpdpsPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    let masterfile: Masterfile | null = null;
    let presets: DoubleWeaknessPreset[] = [];
    let rows: PvpdpsRow[] = [];
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

    const recomputeRows = (): void => {
      if (!masterfile) {
        return;
      }
      rows = buildPvpdpsRows(masterfile, {
        cpCap: parseInt((document.getElementById("cpcap") as HTMLInputElement).value, 10),
        type1: (document.getElementById("type1") as HTMLSelectElement).value,
        type2: (document.getElementById("type2") as HTMLSelectElement).value,
        charged: (document.getElementById("charged") as HTMLInputElement).checked
      });
      renderRows(masterfile, rows, visibleCount);
    };

    const sync = (shouldUpdateUrl = true): void => {
      if (shouldUpdateUrl) {
        updateUrl();
      }
      visibleCount = PAGE_SIZE;
      recomputeRows();
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
      if (input.type === "checkbox") {
        input.addEventListener("change", () => {
          sync();
        });
        continue;
      }
      input.addEventListener("change", () => {
        sync();
      });
    }
    for (const select of form.getElementsByTagName("select")) {
      if (select.id === "doubleweakness") {
        select.dataset.initialValue = NO_PRESET_VALUE;
        select.addEventListener("change", () => {
          const preset = presets.find((item) => item.value === select.value);
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
        continue;
      }
      const value = params.get(select.id);
      select.dataset.initialValue = value ?? NO_TYPE_VALUE;
      select.addEventListener("change", () => {
        syncDoubleWeaknessSelect();
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
        recomputeRows();
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
