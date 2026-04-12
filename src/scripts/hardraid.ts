import { loadHardRaidEntries, type HardRaidEntry } from "../lib/pogo/hardraid";

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("hardraid-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function render(entries: HardRaidEntry[]): void {
  const tbody = document.getElementById("result") as HTMLTableSectionElement | null;
  if (!tbody) {
    return;
  }
  tbody.replaceChildren();
  for (const entry of entries) {
    const row = tbody.insertRow();
    row.insertCell().textContent = entry.pokemon;
    row.insertCell().textContent = entry.form;
    row.insertCell().textContent = entry.tier;
    row.insertCell().textContent = String(Math.ceil(entry.attack));
    row.insertCell().textContent = String(Math.ceil(entry.defense));
    row.insertCell().textContent = String(Math.ceil(entry.hp));
    row.insertCell().textContent = String(Math.ceil(entry.bulk));
  }
}

export function initHardRaidPage(): void {
  const run = (): void => {
    setStatus("Loading Pokemon data for the table…");
    void loadHardRaidEntries((entries) => {
      render(entries);
      setStatus("Pokemon data refreshed from upstream.");
    })
      .then((loaded) => {
        render(loaded.entries);
        setStatus(
          loaded.source === "cache"
            ? "Using cached Pokemon data. A background refresh will run when needed."
            : "Pokemon data loaded from upstream."
        );
      })
      .catch(() => {
        setStatus("Pokemon data unavailable.", true);
      });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run, { once: true });
  } else {
    run();
  }
}
