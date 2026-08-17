# Inkstone v2

Inkstone v2 is the active technical-notes theme for `jsw-teams/siteforge-inkstone-theme`, redesigned with the editorial visual language of Pagekiln as reference.

The active theme is `themes/inkstone-v2`.

## Rendering

`npm run build` installs the pinned runtime dependencies and runs the single builder at `scripts/build.mjs`.

The builder:

- parses `config.yml` and Markdown frontmatter with `yaml`;
- renders Posts and Pages through the same `markdown-it` pipeline;
- keeps CommonMark behavior as the baseline while adding a small CJK strong-emphasis compatibility pass for common Chinese forms such as `**说明：**正文`;
- runs a build-time regression check to ensure that CJK emphasis compatibility remains working;
- keeps Page descriptions in metadata instead of duplicating them above Page Markdown;
- renders fenced code blocks as an Inkstone component with language labels and a styled copy control;
- generates archives, categories, tags, search, RSS, sitemap, robots and `404.html`;
- writes the deployable site directly to `public/`.

There is no separate `build-v2.mjs`; `scripts/build.mjs` is the only site builder.

## Current ESA settings

- Production branch: `main`
- Root directory: `./`
- Install command: `npm run build`
- Build command: `echo skip`
- Static resource directory: `/public`
- Node.js: `22.x`
