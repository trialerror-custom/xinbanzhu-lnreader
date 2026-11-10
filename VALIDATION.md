# Validation — 1.1.0 — 10 November 2026

Working repository: `D:\Professional\LN-reader-custom\xinbanzhu-lnreader`.
Remote: `https://github.com/trialerror-custom/xinbanzhu-lnreader.git`.
Target app: **LNReader 2.1.4**. The original 1.0.0 was confirmed working by the
user; the new 1.1.0 features have not yet been tested on Android.

## Local changes identified

The original project was moved into the nested `xinbanzhu-lnreader` folder,
initialized as a separate repository, and pushed as commit `39fbbce` (Initial
Push). There were no uncommitted changes in that repository before this update.
The outer directory still has its earlier Git metadata; it was left untouched.
All implementation changes apply to the nested repository. The existing Pages
workflow is preserved. No commit, push, or deployment was performed for 1.1.0.

## Completed checks

- Strict TypeScript check with ES5 target, formatting check, and CommonJS build
  against the 2.1.4 module-loader contract, including its filter-input enum.
- 24 behavioral tests covering existing chapter extraction/translation plus title
  translation in Browse/search/details, independent switches, metadata caching,
  provider separation, failure recovery, stable paths, server filter URLs and
  pagination, unsupported combinations, malformed feeds, and shared Google pacing.
- 13 live checks: catalogue and pagination; status/length and pagination;
  category; tag plus status; most-viewed/newly-listed collections; 70 ordered
  chapter links; public chapter extraction; locked chapter error; ID and keyword
  search; neutral Google translation; neutral title translation and cache reuse.
- Live list/filter queries returned 20 novels per tested page. The public sample
  chapter returned 33 paragraphs and 1,874 HTML characters after cleanup.
- A live test initially encountered Google HTTP 429 when a title request followed
  another request immediately. The plugin now shares a 1.25-second request interval
  across titles, bodies, and paragraph-recovery requests, and delays subsequent
  attempts after a 429. The final live title/cache check passed.
- LNReader 2.1.4's chapter upsert updates names using the existing novel ID and
  chapter path while keeping reading-progress fields separate. This supports
  refreshing existing chapter names without inventing new chapter identities.

Live checks use translation Off for actual source pages and neutral sample text
for Google. They do not send novel chapter bodies or private credentials to a
translation service. The report is saved in `work/live-report.json` after
`npm run check:plugin`.

## Remaining limits

- Microsoft API construction, response handling, and local cap are mocked; no
  live Microsoft key was supplied.
- Android installation, filter controls, and display/refresh of translated names
  require a device check after publication.
- Google is unofficial; pacing reduces request bursts but cannot guarantee
  availability. Metadata failures retain originals and are retried on refresh;
  chapter-body failures still throw an error.
- Only public source chapters are supported. Categories, tags, and ranking pages
  follow the site's separate collection routes rather than unsupported combined
  filters. Status and length work within the selected route.
- The local build uses the existing Pages base URL, but 1.1.0 is not published yet.

## Development environment

Used Codex's bundled Node.js/Git and a workspace-local npm CLI because the host's
PATH did not expose them. Dependencies were restored with `npm ci`. The only
lockfile changes are the project version bump; dependency versions are unchanged.
