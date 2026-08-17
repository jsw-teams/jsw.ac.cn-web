# Inkstone v2

Inkstone v2 is a new, independent technical-notes theme for `jsw-teams/siteforge-inkstone-theme`, redesigned from scratch with the editorial visual language of Pagekiln as reference.

It does **not** extend the legacy `inkstone-notes` theme. The active theme is `themes/inkstone-v2`.

## Rendering

`npm run build` installs the pinned runtime dependencies and runs `scripts/build-v2.mjs`.

The v2 builder:

- parses `config.yml` and Markdown frontmatter with `yaml`;
- renders Posts and Pages through the same `markdown-it` pipeline;
- keeps Page descriptions in metadata instead of duplicating them above Page Markdown;
- renders fenced code blocks as an Inkstone component with language labels and a styled copy control;
- generates archives, categories, tags, search, RSS, sitemap, robots and `404.html`;
- writes the deployable site directly to `public/`, matching the current ESA static-resource directory.

## Current ESA settings

- Production branch: `main`
- Root directory: `./`
- Install command: `npm run build`
- Build command: `echo skip`
- Static resource directory: `/public`
- Node.js: `22.x`
