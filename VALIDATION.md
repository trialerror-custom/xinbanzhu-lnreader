# Validation — 1.3.0 — 10 November 2026

Working repository: `D:\Professional\LN-reader-custom\xinbanzhu-lnreader`.
Target app: **LNReader 2.1.4**. Version 1.2.0 was published as `a78f435`.
The working tree was clean before implementing this update. Existing plugin ID,
source paths, setting keys, and the Pages workflow are preserved. Version 1.3.0
publishes through the existing workflow on pushes to `main`.

## Completed checks

- Strict TypeScript check, Prettier check, and bundled CommonJS/ES5 build using
  only external modules available in LNReader 2.1.4.
- 48 behavioral tests: the original chapter/title/description/cover behavior plus
  5/10/20-item Browse batches across source boundaries and a partial final page;
  no skipped/duplicate novels; raw-buffer reuse and refresh; filter isolation;
  processing only the returned batch; source page-size validation; bounded
  server/network retries; no retry for authentication/aborts or long Retry-After;
  Microsoft per-attempt quota reservation and cap enforcement; independent cover
  caching; targeted cache clears preserving credentials, usage and unrelated data;
  clearing caches while requests are still in flight.
- 16 live checks for source listing/pagination, smaller batch continuity, filters,
  novel/chapter extraction, locked chapters, search, neutral Google translation,
  metadata caching, description translation, and encrypted cover decoding.
- Live default Browse batches contain 10 novels. Four 5-item batches recover the
  same 20 unique novels, in order, as one full source page. Keyword search retains
  the source's normal 20-item page. The public sample chapter still has 33
  paragraphs and 1,874 HTML characters; the decoded cover is a JPEG.
- Inspected LNReader 2.1.4's `useBrowseSource` hook: requests are serialized, and
  only an empty successful result ends pagination. A batch smaller than 20 does
  not terminate the list. The app can request more items early to fill the screen.

Live checks use translation Off for source pages and neutral samples for Google.
The retry cases use mocked responses, so validation does not intentionally trigger
real rate limits or use a Microsoft key. Results are in `work/live-report.json`.

## Behavior and limits

- Browse buffering is in memory, bounded to eight raw source pages. Unused halves
  do not expire while buffered. Refreshing page 1 invalidates all buffered pages
  for that filter selection. The website can still reorder its catalogue between
  separate source-page fetches, as with ordinary website pagination.
- Change batch size only with a Browse refresh. Keyword search uses the source's
  normal pagination. This plugin has no viewport/scroll-position callback.
- Cache clearing runs on the next source request, resets its setting switch, and
  deletes only recognized plugin-cache entries. In-flight results may be displayed
  but cannot refill a cache cleared after their request began. Downloaded chapters,
  persisted library metadata, credentials, and usage counters are not reset.
- Retrying is limited to one extra attempt for temporary network failures or
  HTTP 429/500/502/503/504. Long Retry-After values skip automatic retry. Every
  Microsoft attempt reserves quota before sending. No provider fallback is used.
- Existing chapter-name translation remains enabled unless the user turns it off.
  Google remains unofficial; Microsoft live access is untested without a user key.
- Android interaction with the new settings still requires a device check.

## Development environment

Used Codex's bundled Node.js/Git and the workspace-local npm CLI. No dependencies
were changed for 1.3.0; the lockfile only changes the project version. Existing
bundled AES decoding and its third-party license are retained.
