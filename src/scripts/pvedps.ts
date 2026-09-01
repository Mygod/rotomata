import { loadMasterfile, type Masterfile } from "../lib/pogo/masterfile";
import {
  buildPvedpsRows,
  formatPvedpsRow,
  isPvedpsMode,
  isPvedpsWeather,
  listPvedpsTypeNames,
  listPvedpsWeaknessPresets,
  PvedpsMasterfileError,
  type DoubleWeaknessPreset,
  type PvedpsMode,
  type PvedpsRow,
  type PvedpsWeather
} from "../lib/pogo/pvedps";

const PAGE_SIZE = 50;
const NO_TYPE_VALUE = "None";
const NO_PRESET_VALUE = "None";
const DEFAULT_MODE: PvedpsMode = "party2";
const DEFAULT_WEATHER: PvedpsWeather = "none";

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("pvedps-data-status");
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
  for (const typeName of listPvedpsTypeNames(masterfile)) {
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

function populateWeaknessSelect(presets: DoubleWeaknessPreset[]): void {
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
  select.value = Array.from(select.options).some((option) => option.value === currentValue)
    ? currentValue
    : NO_PRESET_VALUE;
  delete select.dataset.initialValue;
}

function updateTypeQueryParam(params: URLSearchParams, key: string, value: string): void {
  if (value.trim() && value !== NO_TYPE_VALUE) {
    params.set(key, value);
  }
}

function updateUrl(): void {
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  params.set("mode", (document.getElementById("mode") as HTMLSelectElement).value);
  const weather = (document.getElementById("weather") as HTMLSelectElement).value;
  if (weather !== DEFAULT_WEATHER) {
    params.set("weather", weather);
  }
  updateTypeQueryParam(params, "type1", (document.getElementById("type1") as HTMLSelectElement).value);
  updateTypeQueryParam(params, "type2", (document.getElementById("type2") as HTMLSelectElement).value);
  url.search = params.toString();
  history.replaceState(null, "", url);
}

function renderRows(masterfile: Masterfile, rows: PvedpsRow[], visibleCount: number): void {
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
  if (!tbody) {
    return;
  }
  tbody.innerHTML = rows
    .slice(0, visibleCount)
    .map((row, index) => {
      const display = formatPvedpsRow(masterfile, row);
      return `<tr><td>${index + 1}</td><td>${display.pokemon}</td><td>${display.form}</td><td>${display.alignment}</td><td>${display.availability}</td><td>${display.level}</td><td>${display.cp}</td><td>${display.quick}</td><td>${display.charged}</td><td>${display.dps}</td><td>${display.tdo}</td></tr>`;
    })
    .join("");
  if (showMoreButton) {
    showMoreButton.hidden = visibleCount >= rows.length;
  }
}

export function initPvedpsPage(): void {
  const run = (): void => {
    const form = document.getElementsByTagName("form")[0];
    const params = new URLSearchParams(window.location.search);
    let masterfile: Masterfile | null = null;
    let presets: DoubleWeaknessPreset[] = [];
    let rows: PvedpsRow[] = [];
    let visibleCount = PAGE_SIZE;

    const getTypeSelect = (id: string): HTMLSelectElement =>
      document.getElementById(id) as HTMLSelectElement;

    const syncWeaknessSelect = (): void => {
      const presetSelect = document.getElementById("doubleweakness") as HTMLSelectElement | null;
      if (!presetSelect) {
        return;
      }
      const type1 = getTypeSelect("type1").value;
      const type2 = getTypeSelect("type2").value;
      const matches = presets.filter(
        (preset) => preset.defenderType1 === type1 && preset.defenderType2 === type2
      );
      if (!matches.some((preset) => preset.value === presetSelect.value)) {
        presetSelect.value = matches.length === 1 ? matches[0].value : NO_PRESET_VALUE;
      }
    };

    const recomputeRows = (): void => {
      if (!masterfile) {
        return;
      }
      const modeValue = (document.getElementById("mode") as HTMLSelectElement).value;
      const mode = isPvedpsMode(modeValue) ? modeValue : DEFAULT_MODE;
      const weatherValue = (document.getElementById("weather") as HTMLSelectElement).value;
      const weather = isPvedpsWeather(weatherValue) ? weatherValue : DEFAULT_WEATHER;
      rows = buildPvedpsRows(masterfile, {
        mode,
        weather,
        type1: getTypeSelect("type1").value,
        type2: getTypeSelect("type2").value
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

    const modeSelect = document.getElementById("mode") as HTMLSelectElement;
    const requestedMode = params.get("mode");
    modeSelect.value = isPvedpsMode(requestedMode) ? requestedMode : DEFAULT_MODE;
    modeSelect.addEventListener("change", () => sync());

    const weatherSelect = document.getElementById("weather") as HTMLSelectElement;
    const requestedWeather = params.get("weather");
    weatherSelect.value = isPvedpsWeather(requestedWeather)
      ? requestedWeather
      : DEFAULT_WEATHER;
    weatherSelect.addEventListener("change", () => sync());

    for (const id of ["type1", "type2"]) {
      const select = getTypeSelect(id);
      select.dataset.initialValue = params.get(id) ?? NO_TYPE_VALUE;
      select.addEventListener("change", () => {
        syncWeaknessSelect();
        sync();
      });
    }

    const weaknessSelect = document.getElementById("doubleweakness") as HTMLSelectElement;
    weaknessSelect.dataset.initialValue = NO_PRESET_VALUE;
    weaknessSelect.addEventListener("change", () => {
      const preset = presets.find((item) => item.value === weaknessSelect.value);
      getTypeSelect("type1").value = preset?.defenderType1 ?? NO_TYPE_VALUE;
      getTypeSelect("type2").value = preset?.defenderType2 ?? NO_TYPE_VALUE;
      sync();
    });

    const showMoreButton = document.getElementById("show-more") as HTMLButtonElement | null;
    showMoreButton?.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      if (masterfile) {
        renderRows(masterfile, rows, visibleCount);
      }
    });

    setStatus("Loading Pokemon data for the table…");
    void loadMasterfile()
      .then((loadedMasterfile) => {
        masterfile = loadedMasterfile;
        presets = listPvedpsWeaknessPresets(loadedMasterfile);
        populateTypeSelect(loadedMasterfile, "type1");
        populateTypeSelect(loadedMasterfile, "type2");
        populateWeaknessSelect(presets);
        syncWeaknessSelect();
        recomputeRows();
        setStatus("Pokemon data loaded.");
      })
      .catch((error: unknown) => {
        masterfile = null;
        const message =
          error instanceof PvedpsMasterfileError
            ? "PvE rankings need a newer masterfile with energy and Mega special-move data."
            : "Pokemon data unavailable. Results cannot be generated.";
        setStatus(message, true);
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
