# Validation — 10 November 2026

Implemented in `D:\Professional\LN-reader-custom` for LNReader **2.1.4**.

## Completed checks

- TypeScript strict type check with ES5 target.
- Prettier formatting check.
- CommonJS bundle build and initialization through the 2.1.4-style loader.
- 14 automated behavioral tests: settings; paragraph extraction and cleanup;
  locked and empty chapters; Google credential separation and cache behavior;
  translation HTTP failures; concurrent request deduplication; Microsoft request
  key/region/body; monthly cap; output HTML escaping; long Unicode paragraphs;
  cache eviction; source URL validation; chapter deduplication and ordering.
- Live source browsing: 20 novels on each of pages 1 and 2, with different first
  novel IDs (`30869` and `30849`).
- Live novel details: 70 ordered chapter links for novel ID `27340`.
- Live public chapter: 33 extracted paragraphs, 1,874 output HTML characters,
  with no scripts or iframes.
- Live locked chapter: chapter 70 returns the plugin's access error.
- Live search: numeric ID resolves correctly; Chinese keyword returns 20 novels.
- Live unofficial Google endpoint: two neutral Chinese sentences produced two
  English paragraphs. No novel text was sent to the service during validation.

The machine-readable live report is in `work/live-report.json` after running
`npm run check:plugin`. Counts and source responses may change over time.

## Not verified

- Microsoft live API calls: no user API key was supplied. Request construction,
  response handling, and local quota limits use mocked tests.
- Installation, dropdown interaction, and reader rendering on an Android device.
- GitHub Actions and Pages deployment: workflow supplied; no remote repository or
  site was created. The default build uses `http://127.0.0.1:8080` for PC preview.
- Private or unlocked chapters: this version supports public chapters only.

Both Browse and Latest currently use the source catalogue order. Novel titles,
synopses, and chapter titles remain in Chinese; chapter bodies are translated.

## Development environment

The host's PATH did not contain Node.js, npm, or Git. Checks used Codex's bundled
Node.js/Git and a workspace-local npm CLI. Dependencies were installed normally
from the registry and recorded in `package-lock.json`. On another PC, install
Node.js 22+ and use the commands in `README.md`.
