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
npm install
npm run build
```

The build first runs the existing generator, then replaces article/Page prose with the enhanced Markdown output. Generated files are written to `dist/`.
