import { loadFunctionallyPerfectSections, type FunctionallyPerfectSection } from "../lib/pogo/fp";

function setStatus(message: string, isError = false): void {
  const status = document.getElementById("fp-data-status");
  if (!status) {
    return;
  }
  status.textContent = message;
  status.classList.toggle("bad", isError);
}

function render(sections: FunctionallyPerfectSection[]): void {
  const container = document.getElementById("fp-sections");
  if (!container) {
    return;
  }
  container.replaceChildren();
  for (const section of sections) {
    const sectionElement = document.createElement("section");
    sectionElement.className = "fp-section";

    const heading = document.createElement("h2");
    heading.textContent = section.heading;
    sectionElement.append(heading);

    if (!section.entries.length) {
      const empty = document.createElement("p");
      empty.className = "fp-empty";
      empty.textContent = "None";
      sectionElement.append(empty);
      container.append(sectionElement);
      continue;
    }

    const list = document.createElement("ul");
    list.className = "fp-list";
    for (const entry of section.entries) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = entry.href;
      if (entry.highlighted) {
        link.classList.add("fp-link-highlight");
      }
      link.textContent = entry.label;
      link.title = `${entry.stats} in Judge`;
      item.append(link);
      list.append(item);
    }
    sectionElement.append(list);
    container.append(sectionElement);
  }
}

export function initFunctionallyPerfectPage(): void {
  const run = (): void => {
    setStatus("Loading Pokemon data for the list…");
    void loadFunctionallyPerfectSections()
      .then((sections) => {
        render(sections);
        setStatus("Pokemon data loaded.");
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
