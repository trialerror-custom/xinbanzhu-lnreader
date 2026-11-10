# Personal LNReader source: 18mh — English

A small custom repository for **LNReader 2.1.4**. The source retrieves public
18mh.net novel chapters and optionally translates Chinese to English before
passing them to the reader. No app modification or translation backend is needed.

## Plugin settings

In LNReader, open the installed plugin's settings:

| Setting                         | Value                                                       |
| ------------------------------- | ----------------------------------------------------------- |
| Translation provider            | Google Translate (unofficial), Microsoft Translator, or Off |
| Microsoft API key               | Your own Translator resource key; leave blank for Google    |
| Microsoft resource region       | The region shown in the Azure resource                      |
| Microsoft monthly character cap | Defaults to 1,900,000 on this device                        |
| Cache translated chapters       | Enabled by default; retains the latest 100 chapter results  |

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

This folder is prepared for publication but has not been uploaded to GitHub.

## Reading and search

- Browse lists and search terms use the source's Chinese titles and metadata.
  Only chapter bodies are translated, keeping requests and quota use low.
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

Only public chapters are supported. Locked chapters throw a clear error and are
not sent for translation. This plugin does not log in, spend site credits, or
unlock chapters. Unlocking on the website does not automatically establish an
authenticated session in this plugin. Cover URLs can expire; refreshing the novel
gets a new source URL. Source markup and network restrictions can change.

## Local development

Install Node.js 22+ (including npm), then in this directory:

```powershell
npm ci
npm run check
npm run build
npm test
npm run check:plugin
```

The live check tests listings, pagination, details, public chapter extraction,
locked chapter handling, search, and a neutral two-sentence Google translation.
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
and `@libs/novelStatus`. The plugin compiles to ES5 with async helpers, matching
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
