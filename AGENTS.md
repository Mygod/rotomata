# Repository Guidelines

## Project Structure & Module Organization
- `src/pages/`: Astro routes for the public tools (`/judge`, `/pvpstat`, `/pvpbp`, `/pvpdps`, `/spinap`, `/hardraid`) and the homepage.
- `src/scripts/`: browser-side page controllers that wire form events, URL sync, and rendering.
- `src/lib/pogo/`: shared Pokemon GO logic and data adapters. Keep ranking/math logic here, not in page scripts.
- `src/layouts/` and `src/styles/`: shared page shell and global CSS.
- `tests/`: Vitest suites. `parity.test.ts` covers CodePen-port behavior; `pvpdps.test.ts` covers PvP DPS specifics.
- `public/`: static assets such as favicon and social images.

## Build, Test, and Development Commands
- `npm run dev`: start the Astro dev server.
- `npm run build`: produce the static site in `dist/`; use this before pushing.
- `npm run preview`: preview the built site locally.
- `npm test`: run Vitest once.

Examples:
```bash
npm run dev
npm test
npm run build
```

## Coding Style & Naming Conventions
- Use TypeScript/ES modules and keep existing semicolon-heavy style.
- Match current formatting: concise functions, explicit interfaces, and descriptive helper names.
- Use `camelCase` for variables/functions, `PascalCase` for interfaces/types, and kebab-free route filenames such as `pvpstat.astro`.
- Keep UI logic in `src/scripts/*`; move reusable math/data logic into `src/lib/pogo/*`.
- There is no formatter configured in this repo, so preserve the surrounding file style when editing.

## Testing Guidelines
- Add or update Vitest coverage for any behavior change in shared logic.
- Prefer parity-style assertions when touching CodePen-derived logic.
- Keep test names descriptive, e.g. `it("matches the original judge page for a representative spread", ...)`.
- Run `npm test` and `npm run build` before committing.

## Commit & Pull Request Guidelines
- Recent history favors short imperative subjects, often feature-focused, e.g. `PvP DPS`, `Weakness presets`, `Judge go brrr`.
- Keep commits scoped to one logical change.
- PRs should include:
  - a short summary of user-visible changes
  - affected routes/tools
  - screenshots for UI changes
  - confirmation that `npm test` and `npm run build` passed

## Data & Configuration Notes
- The site is static and relies on runtime masterfile fetches; avoid introducing server-only assumptions.
- If you change masterfile shape expectations, update both the loader in `src/lib/pogo/masterfile.ts` and the relevant tests.
