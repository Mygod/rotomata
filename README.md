# Rotomata

Rotomata is a static Astro site for Pokemon GO tryhard tools. It is intended for deployment on Cloudflare Pages Free at `rotomata.mygod.be`.

## Current routes

- `/`
- `/judge`
- `/pvpstat`

## Development

```sh
npm install
npm test
npm run build
npm run dev
```

## Deployment

Cloudflare Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`

The Pokemon picker data is fetched at runtime from WatWowMap's upstream masterfile and cached in the browser. Manual base-stat entry still works if the upstream fetch is unavailable.
