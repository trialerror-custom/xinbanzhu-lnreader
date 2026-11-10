# Personal LNReader source: 18mh — English

A small custom repository for **LNReader 2.1.4**. The source retrieves public
18mh.net novel chapters and optionally translates Chinese to English before
passing them to the reader. Version **1.3.0** translates novel titles,
chapter names and descriptions, decodes cover thumbnails, and supports the site's browse filters. No app modification or
translation backend is needed.

## Plugin settings

In LNReader, open the installed plugin's settings:

**New in 1.3.0:** smaller Browse batches, separate cover/text cache controls,
cache-clearing switches, bounded translation retries, and configurable Google
spacing. Existing translation choices, IDs, and source paths are preserved.

| Setting                                   | Value                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------- |
| Translation provider                      | Google Translate (unofficial), Microsoft Translator, or Off                         |
| Microsoft API key                         | Your own Translator resource key; leave blank for Google                            |
| Microsoft resource region                 | The region shown in the Azure resource                                              |
| Microsoft monthly character cap           | Defaults to 1,900,000 on this device                                                |
| Cache translated text                     | Enabled by default; retains the latest 100 chapters and up to 5,000 metadata values |
| Translate novel titles                    | Enabled by default for Browse, search, and novel details                            |
| Translate chapter names                   | Enabled by default when loading a novel's chapter list                              |
| Novels per Browse batch                   | 5, 10, or 20; defaults to 10                                                        |
| Cache decoded covers                      | Enabled independently of text caching                                               |
| Clear text / cover cache                  | One-shot switches; run on the next source request                                   |
| Retry temporary translation failures once | Enabled by default                                                                  |
| Google request spacing                    | 1.25, 2, or 3 seconds; defaults to 1.25                                             |

Descriptions and thumbnails still default to on. Provider Off leaves descriptions
in Chinese; covers work independently and do not use a translation API or proxy.

## Faster browsing and cache maintenance

Browse uses the source's 20-item pages but returns only the chosen 5/10/20-item
batch. Remaining raw items stay in a memory buffer; their titles and
covers are processed only when LNReader requests that batch. Numbering maps across
source pages without discarding items, including the last partial page. Filters
have separate buffers. Refreshing the first Browse page discards that selection's
buffered pages and refetches the source. The buffer holds up to eight source pages
while the plugin remains loaded; unused items do not expire on a timer. Search retains
the source's normal page size. Refresh Browse after changing the batch size.

This is request-based batching, not viewport tracking. LNReader may request more
items early to fill the screen. It has been checked against 2.1.4's Browse hook,
which continues until an empty response rather than requiring 20 results.

For large chapter lists, optionally turn off **Translate chapter names** to avoid
translating every name when opening novel details. This release does not change
that existing preference. Full-chapter translation and downloads behave as before.

**Cache translated text** and **Cache decoded covers** can be disabled separately.
Disabling a cache bypasses it without deleting stored entries. To remove stored
results, enable the relevant **Clear ... cache on next source request** switch,
then refresh Browse, search, a novel, or a chapter. The switch resets after the
operation; reopen plugin settings to see the reset. Clearing the text cache removes
both providers' chapter/title/description results. Clearing covers removes decoded
image entries. Requests already running may still finish, but do not refill the
cleared cache. API keys, region, provider choice, Microsoft usage counter, reading
progress, and LNReader's downloaded files are preserved. Clearing these caches
does not change names/descriptions already saved in the library; refresh a novel
to fetch its metadata again.

Transient network failures and HTTP 429/500/502/503/504 responses get at most one
retry, with a delay. Authentication errors, invalid requests, malformed response
data, explicit aborts, and local quota errors are not retried. Retry-After is
respected; if it asks for more than ten seconds, the automatic retry is skipped.
Google requests share the selected spacing across metadata and chapter bodies.
Each Microsoft attempt reserves its character count, including retries, so the
local cap remains conservative. Retries never switch providers. The F0 resource
is still required for Microsoft's free tier.

Google is selected by default and needs no account or API key. This uses an
unofficial endpoint that can throttle, block, or change. Microsoft requires an
Azure **F0** Translator resource. Selecting Microsoft in the plugin does not create
an Azure account, select a pricing tier, or guarantee that an existing key is free.
The plugin never automatically switches providers.

Microsoft's local character counter reserves characters before each request and
resets by UTC calendar month. It does not track other apps/devices, detect your
Azure tier, or provide an account-wide billing limit. Failed requests remain
counted conservatively. Use F0 at the provider to keep translation within its free
allowance. No credentials belong in this repository, workflow, or build files.

Plugin text settings are stored in LNReader's ordinary plugin storage, without
encryption in the 2.1.4 implementation inspected for this project. Your key is sent
only to Microsoft's fixed HTTPS endpoint. Google receives chapter text, but no
Microsoft credentials.

## Install using GitHub Pages (recommended)

1. Create a GitHub repository and upload this folder's source files, including the
   hidden `.github` folder, `package-lock.json`, and `assets/icon.png`. Do not upload
   `node_modules`, `work`, or `dist`. Use the `main` branch.
2. In the repository's **Settings → Pages → Build and deployment**, choose
   **GitHub Actions** as the source. GitHub Pages availability depends on your
   account and repository visibility; a public source-only repository is suitable.
3. Run **Actions → Publish personal plugin repository → Run workflow** (or push a
   new commit). The workflow checks, builds, tests, and deploys the plugin.
4. Take the site URL displayed by the successful deployment and append
   `/plugins.min.json`, for example:
   `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/plugins.min.json`.
5. In LNReader, add that URL as a plugin repository. Install **18mh — English**.
   Set provider options in the plugin settings, then open the source in Browse.

The working repository is in `D:\Professional\LN-reader-custom\xinbanzhu-lnreader`,
with remote `https://github.com/trialerror-custom/xinbanzhu-lnreader.git`. The
existing published repository URL stays the same. The existing workflow builds,
tests, and deploys releases pushed to `main`.

## Upgrade to 1.3.0

Publish the updated source through the existing workflow, refresh the repository
in LNReader, and update **18mh — English** to **1.3.0**. Its ID and setting keys
are unchanged, preserving the existing source association and saved settings.
The title, description, and cover switches default to on for existing installations.

Refresh a novel's details/chapter list to fetch translated names for existing
entries, translate its description, and replace an old encrypted cover URL with
a decoded cover. Reload Browse/search to fetch thumbnails there. Novel paths,
chapter paths, and chapter numbers stay unchanged. Reading
progress and downloaded chapter bodies are not modified by this plugin update.
Chapter bodies previously downloaded in another language retain that language.

## Browse filters

Open the source in Browse and use LNReader's filter button:

- **Category / collection:** all novels by latest update, most viewed, newly
  listed, original works, or one of the site's categories. Category labels show
  English and the original Chinese.
- **Tag:** the five tags shown on the source's filter bar, or **Other tag** for
  an exact tag copied from the source. A custom tag overrides the selected tag.
- **Status:** any, ongoing, or completed.
- **Length:** the source's four ranges in Chinese characters.

Status and length apply on the server and persist across pagination. The source
uses separate pages for categories, tags, and ranking collections; they cannot
all be combined. For tag browsing, select **All — latest updates** in Category /
collection. An unsupported combination shows an error instead of ignoring your
selection. Most viewed and newly listed are collection choices because that is
how the site implements them. Browse filters apply to Browse lists, not keyword
search. Browse and Latest use the same chosen collection.

## Reading and search

- Novel titles translate in Browse and search results. Chapter names and the
  description translate when loading novel details, without opening individual
  chapters. Author names and genre metadata remain in the original language.
- Search terms still go to the Chinese source as entered; English search terms
  are not automatically translated. Use a Chinese keyword, a source URL, or ID.
- Title translation uses the selected Google/Microsoft provider and its quota.
  New chapter lists can take longer to load, especially for very long novels.
  Only missing Chinese names are translated. A separate cache retains up to 5,000
  successful title/description translations, shared between Browse and novel details and
  separated by provider. The cache switch applies to both titles and bodies.
- If title or description translation fails, originals remain visible and are retried on
  refresh. A translation failure in the chapter body still produces an error.
  Turning the provider Off disables both name and body translation; title switches
  can also be disabled independently.
- Search accepts a Chinese title, a numeric novel ID, or an exact source detail
  URL such as `https://18mh.net/novel/detail/27340`.
- Download translated chapters in LNReader for offline reading. Reopening an
  uncached chapter still needs the source and translation service.
- Switching providers affects newly fetched chapters. Previously downloaded
  chapters retain their saved language; delete and download those chapters again
  when changing provider or turning translation off.
- Translation results are cached separately for Google and Microsoft. Disable
  the cache to fetch fresh translations; removing the plugin clears its settings
  and plugin cache. LNReader downloads are managed separately by the app.
- The plugin serializes translation jobs and reuses concurrent requests for the
  same chapter to reduce throttling and duplicate quota consumption.

## Access limits

The source serves encrypted image bytes for many cover URLs. The plugin uses the
same public AES-CBC decoding as the website and returns image data URIs supported
by LNReader's image component. It fetches up to three covers concurrently and
stores up to 40 covers, with an aggregate cache limit of 8 million data-URI
characters and a seven-day cache lifetime. This adds work on the first Browse
load; cached covers avoid repeated downloads, including when signed URLs change.
Disable **Load and decode cover thumbnails** if you prefer less image traffic.
An unavailable or unrecognized image uses the app's placeholder.

Only public chapters are supported. Locked chapters throw a clear error and are
not sent for translation. This plugin does not log in, spend site credits, or
unlock chapters. Unlocking on the website does not automatically establish an
authenticated session in this plugin. Cover URLs can expire; refreshing the novel
gets a new source URL. Source markup, image decoding keys, and network restrictions can change.

## Local development

Install Node.js 22+ (including npm), then in this directory:

```powershell
npm ci
npm run check
npm run build
npm test
npm run check:plugin
```

The live check tests listings, filters, pagination, details, public chapter
extraction, locked chapter handling, search, a neutral Google translation, and
the metadata-translation/cache pipeline using neutral sample names and a
description, plus actual source-cover decoding without displaying the image.
It makes no Microsoft requests and needs no secrets. Its report is saved under
`work/live-report.json`. Tests use neutral fixtures and mocked translation APIs.

To build for a different HTTPS static host:

```powershell
npm run build -- --base-url=https://YOUR-HOST/path
```

Upload the **contents** of `dist` at that address, then add
`https://YOUR-HOST/path/plugins.min.json` in LNReader. Every manifest uses absolute
asset URLs, so rebuilding for the real host is required.

For a temporary LAN test, replace the sample IP with your PC's actual LAN IP:

```powershell
npm run build -- --base-url=http://192.168.1.100:8080
npm run serve
```

Keep the PC running and the phone on the same network. You may need to allow the
server through Windows Firewall. If Android blocks cleartext HTTP, use HTTPS
hosting instead. The default `127.0.0.1` build is a PC preview, not a phone URL.

## Compatibility and validation

Targets LNReader 2.1.4's CommonJS loader, Cheerio, `@libs/fetch`, `@libs/storage`,
and `@libs/novelStatus`. AES decoding is bundled into the plugin, so no extra app
module or service is required. The build uses esbuild then compiles to ES5 with async helpers, matching
the upstream plugin compilation target. The harness deliberately exposes only
the imported modules available in 2.1.4. Android installation and rendering still
need a device check; Node validation cannot prove Android behavior.

See `VALIDATION.md` for the checks actually completed during implementation.

## References

- [LNReader v2.1.4 plugin runtime](https://github.com/lnreader/lnreader/blob/v2.1.4/src/plugins/pluginManager.ts)
- [LNReader v2.1.4 setting types](https://github.com/lnreader/lnreader/blob/v2.1.4/src/plugins/types/index.ts)
- [LNReader plugin documentation](https://github.com/lnreader/lnreader-plugins/blob/master/docs/docs.md)
- [Microsoft Translator pricing](https://azure.microsoft.com/en-us/pricing/details/translator/)

This is an independent personal plugin, not an official LNReader or 18mh release.
