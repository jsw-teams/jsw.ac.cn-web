# Inkstone Notes 2.0

Inkstone Notes is a technical publishing theme redesigned from the visual language of `jsw-teams/pagekiln` while preserving the existing Siteforge-style static publishing workflow.

## What changed

- Warm paper / petrol / clay visual system inspired by Pagekiln's default theme.
- Standard Markdown rendering powered by `markdown-it` for posts and Pages content.
- Fixes hard line breaks, nested Markdown structures, fenced-code language metadata, task lists, tables, links, and common Markdown edge cases that the previous hand-written renderer flattened.
- Code blocks include a language label and one-click copy button, with Clipboard API and legacy fallback support.
- Existing search, privacy consent, analytics gating, mascot assets, archives, tags/categories and filing footer are retained.

## Build

```bash
npm run build
```

`npm run build` installs the pinned Markdown dependencies when needed, runs the existing generator, replaces article/Page prose with the enhanced Markdown output, and copies the final static site to `public/`.

## ESA deployment settings

The repository is adapted to the current ESA build configuration:

- Production branch: `main`
- Root directory: `./`
- Install command: `npm run build`
- Build command: `echo skip`
- Static assets directory: `/public`
- Node.js: `22.x`

The intermediate generator output remains in `dist/`; `public/` is the deployment output consumed by ESA.
