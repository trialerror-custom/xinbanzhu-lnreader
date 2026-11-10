import { load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { storage } from '@libs/storage';
import { NovelStatus } from '@libs/novelStatus';
import { FilterTypes } from '@libs/filterInputs';
import { ModeOfOperation, utils } from 'aes-js';

type NovelItem = { name: string; path: string; cover?: string };
type ChapterItem = { name: string; path: string; chapterNumber: number };
type Provider = 'google' | 'microsoft' | 'off';
type SourceFilter = {
  label: string;
  type: FilterTypes;
  value: string;
  options?: { label: string; value: string }[];
};
type BrowseOptions = {
  showLatestNovels?: boolean;
  filters?: Record<string, { value: string }>;
};
type Setting = {
  label: string;
  value: string | boolean;
  type: 'Text' | 'Select' | 'Switch';
  options?: { label: string; value: string }[];
};

class EighteenMhEnglishPlugin {
  id = 'eighteenMhEnglish';
  name = '18mh — English';
  version = '1.3.0';
  site = 'https://18mh.net';
  icon = 'icon.png';
  imageRequestInit = { headers: { Referer: 'https://18mh.net/' } };
  filters: Record<string, SourceFilter> = {
    collection: {
      label: 'Category / collection',
      type: FilterTypes.Picker,
      value: '/novel/all',
      options: [
        { label: 'All — latest updates', value: '/novel/all' },
        { label: 'Most viewed', value: '/novel/hot' },
        { label: 'Newly listed', value: '/novel/last_published' },
        { label: 'Original works', value: '/novel/original' },
        { label: 'Urban passion · 都市激情', value: '/novel/all/dsjq' },
        { label: 'Campus romance · 校园春色', value: '/novel/all/xycs' },
        { label: 'Rural romance · 乡村爱情', value: '/novel/all/xcaq' },
        { label: 'Systems / superpowers · 系统异能', value: '/novel/all/xtyn' },
        { label: 'Family / incest · 家庭乱伦', value: '/novel/all/jtll' },
        {
          label: 'Transmigration / rebirth · 穿越重生',
          value: '/novel/all/cycs',
        },
        { label: 'Classic wuxia · 经典武侠', value: '/novel/all/jdwx' },
        { label: 'Fan adaptations · 同人改编', value: '/novel/all/trgb' },
        { label: 'Science fiction · 科学幻想', value: '/novel/all/kxhx' },
        { label: 'Eastern fantasy · 东方玄幻', value: '/novel/all/dfxh' },
        {
          label: 'Entertainment / celebrities · 娱乐明星',
          value: '/novel/all/ylmx',
        },
        { label: 'Alternate history · 历史架空', value: '/novel/all/lsjk' },
        { label: 'Western fantasy · 西方魔幻', value: '/novel/all/xfmh' },
        { label: 'Sage novels · 贤者小说', value: '/novel/all/xzxs' },
      ],
    },
    tag: {
      label: 'Tag (use All category)',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Uniforms · 制服', value: '制服' },
        { label: 'One-to-one · 1v1', value: '1v1' },
        { label: 'Plot-driven · 剧情', value: '剧情' },
        { label: 'Discipline · 调教', value: '调教' },
        { label: 'Contrast · 反差', value: '反差' },
      ],
    },
    customTag: {
      label: 'Other tag (exact Chinese tag; overrides Tag)',
      type: FilterTypes.TextInput,
      value: '',
    },
    status: {
      label: 'Status',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Ongoing', value: '2' },
        { label: 'Completed', value: '1' },
      ],
    },
    length: {
      label: 'Length (Chinese characters)',
      type: FilterTypes.Picker,
      value: '',
      options: [
        { label: 'Any', value: '' },
        { label: 'Under 100,000', value: '1' },
        { label: '100,000–500,000', value: '2' },
        { label: '500,000–1,000,000', value: '3' },
        { label: 'Over 1,000,000', value: '4' },
      ],
    },
  };
  pluginSettings: Record<string, Setting> = {
    translationProvider: {
      label: 'Translation provider',
      type: 'Select',
      value: 'google',
      options: [
        { label: 'Google Translate (unofficial, no key)', value: 'google' },
        {
          label: 'Microsoft Translator (use F0 free tier)',
          value: 'microsoft',
        },
        { label: 'Off — original Chinese', value: 'off' },
      ],
    },
    microsoftKey: {
      label: 'Microsoft API key (plain text)',
      type: 'Text',
      value: '',
    },
    microsoftRegion: {
      label: 'Microsoft resource region',
      type: 'Text',
      value: '',
    },
    microsoftMonthlyLimit: {
      label: 'Microsoft monthly character cap (this device only)',
      type: 'Text',
      value: '1900000',
    },
    cacheTranslations: {
      label: 'Cache translated text (chapters, titles, descriptions)',
      type: 'Switch',
      value: true,
    },
    translateNovelTitles: {
      label: 'Translate novel titles in Browse and search',
      type: 'Switch',
      value: true,
    },
    translateChapterTitles: {
      label: 'Translate chapter names when opening novel details',
      type: 'Switch',
      value: true,
    },
    translateDescriptions: {
      label: 'Translate novel descriptions',
      type: 'Switch',
      value: true,
    },
    loadThumbnails: {
      label: 'Load and decode cover thumbnails',
      type: 'Switch',
      value: true,
    },
    browseBatchSize: {
      label: 'Novels per Browse batch (refresh Browse after changing)',
      type: 'Select',
      value: '10',
      options: [
        { label: '5 — lighter', value: '5' },
        { label: '10 — balanced', value: '10' },
        { label: '20 — full source page', value: '20' },
      ],
    },
    cacheCovers: { label: 'Cache decoded covers', type: 'Switch', value: true },
    clearTranslationCache: {
      label: 'Clear text cache on next source request',
      type: 'Switch',
      value: false,
    },
    clearCoverCache: {
      label: 'Clear cover cache on next source request',
      type: 'Switch',
      value: false,
    },
    retryTemporaryErrors: {
      label: 'Retry temporary translation failures once',
      type: 'Switch',
      value: true,
    },
    googleRequestSpacing: {
      label: 'Google request spacing',
      type: 'Select',
      value: '1250',
      options: [
        { label: '1.25 seconds', value: '1250' },
        { label: '2 seconds', value: '2000' },
        { label: '3 seconds', value: '3000' },
      ],
    },
  };
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight: Record<string, Promise<string> | undefined> = {};
  private googleReadyAt = 0;
  private textCacheGeneration = 0;
  private coverCacheGeneration = 0;
  private browseSnapshots: Record<string, { novels: NovelItem[] }> = {};
  private coverRequests: Record<
    string,
    Promise<string | undefined> | undefined
  > = {};

  private setting(key: string): string | boolean {
    const value = storage.get(key);
    return typeof value === 'string' || typeof value === 'boolean'
      ? value
      : this.pluginSettings[key].value;
  }

  private maintainCaches(): void {
    if (this.setting('clearTranslationCache') === true) {
      this.textCacheGeneration++;
      for (const [index, prefix] of [
        ['translationCacheIndexV1', 'translationCacheV1:'],
        ['metadataCacheIndexV1', 'metadataCacheV1:'],
      ]) {
        const keys = storage.get(index);
        if (Array.isArray(keys))
          keys.forEach(key => {
            if (typeof key === 'string' && key.startsWith(prefix))
              storage.delete(key);
          });
        storage.delete(index);
      }
      storage.set('clearTranslationCache', false);
    }
    if (this.setting('clearCoverCache') === true) {
      this.coverCacheGeneration++;
      const entries = storage.get('coverCacheIndexV1');
      if (Array.isArray(entries))
        entries.forEach(entry => {
          if (
            entry &&
            typeof entry.key === 'string' &&
            entry.key.startsWith('coverCacheV1:')
          )
            storage.delete(entry.key);
        });
      storage.delete('coverCacheIndexV1');
      storage.set('clearCoverCache', false);
      this.coverRequests = {};
    }
  }

  resolveUrl(path: string): string {
    if (/^https?:\/\//i.test(path)) {
      if (!/^https:\/\/18mh\.net\//i.test(path))
        throw new Error('Unsupported source URL.');
      return path;
    }
    if (!path.startsWith('/') || path.startsWith('//'))
      throw new Error('Invalid source path.');
    return this.site + path;
  }

  private path(url: string): string {
    return this.resolveUrl(url).slice(this.site.length).split(/[?#]/)[0];
  }

  private async page(path: string) {
    const response = await fetchApi(this.resolveUrl(path), {
      headers: { Referer: this.site + '/novel' },
    });
    if (!response.ok)
      throw new Error(
        '18mh returned HTTP ' +
          response.status +
          '. Try the source in WebView.',
      );
    return load(await response.text());
  }

  private listings($: ReturnType<typeof load>): NovelItem[] {
    const novels: NovelItem[] = [];
    const seen: Record<string, boolean> = {};
    $('a[href*="/novel/detail/"]').each((_, element) => {
      const link = $(element);
      const href = link.attr('href') || '';
      if (!/^(?:https:\/\/18mh\.net)?\/novel\/detail\/\d+\/?$/.test(href))
        return;
      const path = this.path(href).replace(/\/$/, '');
      const card = link.closest(
        'li, .jm-card, .jm-novel-card, .jm-book, .jm-hp-card',
      );
      const image = (
        link.find('img').length ? link.find('img') : card.find('img')
      ).first();
      const name = (
        link.find('h3, h2, .title').first().text() ||
        link.attr('title') ||
        image.attr('alt') ||
        link.text() ||
        card.find('h3, h2').first().text()
      ).trim();
      if (!name || seen[path]) return;
      seen[path] = true;
      const cover = image.attr('data-src') || image.attr('src');
      novels.push({
        name,
        path,
        cover:
          cover && !cover.includes('loading.svg')
            ? cover.startsWith('/')
              ? this.site + cover
              : cover
            : undefined,
      });
    });
    return novels;
  }

  private filterValue(key: string, options?: BrowseOptions): string {
    const value = options?.filters?.[key]?.value ?? this.filters[key].value;
    if (typeof value !== 'string')
      throw new Error('Invalid ' + key + ' filter.');
    const choices = this.filters[key].options;
    if (choices && !choices.some(choice => choice.value === value))
      throw new Error('Choose a valid ' + key + ' filter.');
    return value;
  }

  private async translatedListings(novels: NovelItem[]): Promise<NovelItem[]> {
    const [names, covers] = await Promise.all([
      this.metadata(
        novels.map(novel => novel.name),
        'translateNovelTitles',
      ),
      this.covers(novels),
    ]);
    return novels.map((novel, index) => ({
      ...novel,
      name: names[index],
      cover: covers[index],
    }));
  }

  private async covers(novels: NovelItem[]): Promise<(string | undefined)[]> {
    const covers: (string | undefined)[] = [];
    for (let index = 0; index < novels.length; index += 3) {
      covers.push(
        ...(await Promise.all(
          novels.slice(index, index + 3).map(novel => this.cover(novel.cover)),
        )),
      );
    }
    return covers;
  }

  private async cover(url?: string): Promise<string | undefined> {
    if (
      !url ||
      this.setting('loadThumbnails') !== true ||
      url.includes('loading.svg')
    )
      return undefined;
    const absolute = url.startsWith('//')
      ? 'https:' + url
      : url.startsWith('/')
        ? this.site + url
        : url;
    if (!/^https:\/\//i.test(absolute)) return undefined;
    // Signed query strings expire; the file path identifies the actual cover.
    const key = 'coverCacheV1:' + absolute.split('?')[0];
    const cached = storage.get(key) as
      | { uri?: string; updatedAt?: number }
      | undefined;
    if (
      this.setting('cacheCovers') === true &&
      cached?.uri?.startsWith('data:image/') &&
      Date.now() - (cached.updatedAt || 0) < 7 * 86400000
    )
      return cached.uri;
    if (this.coverRequests[key]) return this.coverRequests[key];
    const request = this.fetchCover(absolute, key);
    this.coverRequests[key] = request;
    try {
      return await request;
    } finally {
      if (this.coverRequests[key] === request) delete this.coverRequests[key];
    }
  }

  private async fetchCover(
    url: string,
    key: string,
  ): Promise<string | undefined> {
    const generation = this.coverCacheGeneration;
    try {
      const response = await fetchApi(url, {
        headers: { Referer: this.site + '/' },
      });
      if (!response.ok) return undefined;
      let bytes: Uint8Array = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > 3 * 1024 * 1024) return undefined;
      if (!this.imageMime(bytes)) {
        if (bytes.length % 16) return undefined;
        // Same public image decoding used by the site's lazyload.js (AES-CBC, no padding).
        bytes = new ModeOfOperation.cbc(
          utils.utf8.toBytes('f5d965df75336270'),
          utils.utf8.toBytes('97b60394abc2fbe1'),
        ).decrypt(bytes);
      }
      const mime = this.imageMime(bytes);
      if (!mime) return undefined;
      const uri = 'data:' + mime + ';base64,' + this.base64(bytes);
      if (
        this.setting('cacheCovers') !== true ||
        generation !== this.coverCacheGeneration
      )
        return uri;
      storage.set(key, { uri, updatedAt: Date.now() });
      const stored = storage.get('coverCacheIndexV1');
      const entries: { key: string; size: number }[] = Array.isArray(stored)
        ? stored.filter(
            item =>
              item &&
              typeof item.key === 'string' &&
              typeof item.size === 'number' &&
              item.key !== key,
          )
        : [];
      entries.push({ key, size: uri.length });
      let total = entries.reduce((sum, item) => sum + item.size, 0);
      while (entries.length > 40 || total > 8000000) {
        const oldest = entries.shift()!;
        storage.delete(oldest.key);
        total -= oldest.size;
      }
      storage.set('coverCacheIndexV1', entries);
      return uri;
    } catch {
      // A failed image must not prevent reading or translating the novel.
      return undefined;
    }
  }

  private imageMime(bytes: Uint8Array): string | undefined {
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
      return 'image/jpeg';
    if (
      bytes[0] === 137 &&
      bytes[1] === 80 &&
      bytes[2] === 78 &&
      bytes[3] === 71
    )
      return 'image/png';
    if (
      bytes[0] === 71 &&
      bytes[1] === 73 &&
      bytes[2] === 70 &&
      bytes[3] === 56
    )
      return 'image/gif';
    if (
      bytes[0] === 82 &&
      bytes[1] === 73 &&
      bytes[2] === 70 &&
      bytes[3] === 70 &&
      bytes[8] === 87 &&
      bytes[9] === 69 &&
      bytes[10] === 66 &&
      bytes[11] === 80
    )
      return 'image/webp';
    return undefined;
  }

  private base64(bytes: Uint8Array): string {
    const alphabet =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const output: string[] = [];
    for (let index = 0; index < bytes.length; index += 3) {
      const a = bytes[index],
        b = bytes[index + 1],
        c = bytes[index + 2];
      output.push(
        alphabet[a >> 2] +
          alphabet[((a & 3) << 4) | ((b || 0) >> 4)] +
          (index + 1 < bytes.length
            ? alphabet[((b & 15) << 2) | ((c || 0) >> 6)]
            : '=') +
          (index + 2 < bytes.length ? alphabet[c & 63] : '='),
      );
    }
    return output.join('');
  }

  async popularNovels(
    pageNo: number,
    options?: BrowseOptions,
  ): Promise<NovelItem[]> {
    this.maintainCaches();
    if (!Number.isInteger(pageNo) || pageNo < 1)
      throw new Error('Invalid page number.');
    const collection = this.filterValue('collection', options);
    const tag = (
      this.filterValue('customTag', options).trim() ||
      this.filterValue('tag', options)
    ).trim();
    if (tag && (tag.length > 80 || /[\/?#]/.test(tag)))
      throw new Error('Enter a single source tag, not a URL.');
    if (tag && collection !== '/novel/all')
      throw new Error(
        'For tag browsing, set Category / collection to All — latest updates. The source uses separate collection and tag pages.',
      );
    const base = tag ? '/novel/tag/' + encodeURIComponent(tag) : collection;
    const batchSize = Number(this.setting('browseBatchSize'));
    if (![5, 10, 20].includes(batchSize))
      throw new Error('Choose 5, 10, or 20 novels per Browse batch.');
    const sourcePage = Math.floor(((pageNo - 1) * batchSize) / 20) + 1;
    const offset = ((pageNo - 1) * batchSize) % 20;
    // Match the site's feed pagination, which differs from full-page pagination.
    const path =
      base +
      (sourcePage > 1
        ? (base === '/novel/all' ? '/page/' : '/') + sourcePage
        : '');
    const query = ['_feed=1'];
    for (const key of ['status', 'length']) {
      const value = this.filterValue(key, options);
      if (value) query.push(key + '=' + encodeURIComponent(value));
    }
    const selectionKey = base + '?' + query.join('&') + ':page:';
    if (pageNo === 1)
      Object.keys(this.browseSnapshots).forEach(key => {
        if (key.startsWith(selectionKey)) delete this.browseSnapshots[key];
      });
    const snapshotKey = selectionKey + sourcePage;
    const cached = this.browseSnapshots[snapshotKey];
    if (pageNo !== 1 && cached)
      return this.translatedListings(
        cached.novels.slice(offset, offset + batchSize),
      );
    const response = await fetchApi(
      this.resolveUrl(path + '?' + query.join('&')),
      {
        headers: { Referer: this.site + base, Accept: 'application/json' },
      },
    );
    if (!response.ok)
      throw new Error(
        '18mh returned HTTP ' + response.status + ' while loading filters.',
      );
    const body = (await response.json()) as {
      code?: number;
      data?: { wall_html?: string; total_page?: number };
    };
    if (body?.code !== 200 || typeof body.data?.wall_html !== 'string')
      throw new Error(
        '18mh returned an invalid list feed. The source may have changed.',
      );
    if (
      typeof body.data.total_page === 'number' &&
      sourcePage > body.data.total_page
    )
      return [];
    const novels = this.listings(load(body.data.wall_html));
    if (
      novels.length > 20 ||
      (novels.length > 0 &&
        novels.length < 20 &&
        typeof body.data.total_page === 'number' &&
        sourcePage < body.data.total_page)
    )
      throw new Error(
        'The source page size changed. Refresh or update the plugin to avoid skipping novels.',
      );
    this.browseSnapshots[snapshotKey] = { novels };
    const keys = Object.keys(this.browseSnapshots);
    while (keys.length > 8) delete this.browseSnapshots[keys.shift()!];
    return this.translatedListings(novels.slice(offset, offset + batchSize));
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
    this.maintainCaches();
    const query = searchTerm.trim();
    if (/^(?:https:\/\/18mh\.net)?\/novel\/detail\/\d+\/?$/.test(query)) {
      if (pageNo !== 1) return [];
      const novel = await this.parseNovel(query);
      return [{ name: novel.name, path: novel.path, cover: novel.cover }];
    }
    if (/^\d+$/.test(query)) {
      if (pageNo !== 1) return [];
      const novel = await this.parseNovel('/novel/detail/' + query);
      return [{ name: novel.name, path: novel.path, cover: novel.cover }];
    }
    return this.translatedListings(
      this.listings(
        await this.page(
          '/novel/search/' +
            encodeURIComponent(query.replace(/\s*\/+\s*/g, ' ')) +
            (pageNo > 1 ? '/page/' + pageNo : ''),
        ),
      ),
    );
  }

  async parseNovel(novelPath: string) {
    this.maintainCaches();
    const path = this.path(novelPath).replace(/\/$/, '');
    if (!/^\/novel\/detail\/\d+$/.test(path))
      throw new Error('Invalid novel path.');
    const $ = await this.page(path + '/');
    const name = $('.jm-dt-title, h1').first().text().trim();
    const chapters: ChapterItem[] = [];
    const seen: Record<string, boolean> = {};
    $('a.jm-dt-ch, a.detail-page__catalog-item').each((index, element) => {
      const link = $(element);
      const href = link.attr('href') || '';
      if (!href.includes('/novel_chapter/')) return;
      const chapterPath = this.path(href);
      if (seen[chapterPath]) return;
      seen[chapterPath] = true;
      const number = Number(
        link.attr('data-chapter-no') ||
          /\/(\d+)\.html$/.exec(chapterPath)?.[1] ||
          index + 1,
      );
      const title = link.clone();
      title.find('svg, .jm-dt-ch__lock').remove();
      chapters.push({
        name: title.text().trim() || 'Chapter ' + number,
        path: chapterPath,
        chapterNumber: number,
      });
    });
    chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
    if (!name || !chapters.length)
      throw new Error('Could not extract the 18mh novel and chapter list.');
    const image = $('.jm-dt-cover__img, .detail-page__cover img').first();
    const cover = image.attr('data-src') || image.attr('src');
    const meta = $('.jm-dt-meta').text();
    const translatedName = (
      await this.metadata([name], 'translateNovelTitles')
    )[0];
    const chapterNames = await this.metadata(
      chapters.map(chapter => chapter.name),
      'translateChapterTitles',
    );
    const description = $('.jm-dt-desc__p, .detail-page__description')
      .first()
      .clone();
    description.find('br').replaceWith('\n');
    const summary = (
      await this.metadata([description.text().trim()], 'translateDescriptions')
    )[0];
    const decodedCover = await this.cover(cover);
    return {
      path,
      name: translatedName,
      cover: decodedCover,
      summary,
      author:
        $('.jm-dt-meta a[href*="/author/"]').first().text().trim() || undefined,
      genres: $('.jm-dt-tags a')
        .map((_, el) => $(el).text().trim())
        .get()
        .join(', '),
      status: /已完结|已完結|完结|完結/.test(meta)
        ? NovelStatus.Completed
        : /连载|連載/.test(meta)
          ? NovelStatus.Ongoing
          : NovelStatus.Unknown,
      chapters: chapters.map((chapter, index) => ({
        ...chapter,
        name: chapterNames[index],
      })),
    };
  }

  private async metadata(texts: string[], toggle: string): Promise<string[]> {
    const generation = this.textCacheGeneration;
    const provider = String(this.setting('translationProvider')) as Provider;
    if (this.setting(toggle) !== true || provider === 'off') return texts;
    if (provider !== 'google' && provider !== 'microsoft')
      throw new Error('Choose a valid translation provider.');
    return this.enqueue(async () => {
      const resolved: Record<string, string> = Object.create(null);
      const missing: string[] = [];
      const prefix = 'metadataCacheV1:' + provider + ':en:';
      const cacheEnabled = this.setting('cacheTranslations') === true;
      for (const text of texts) {
        if (!/[\u3400-\u9fff]/.test(text)) {
          resolved[text] = text;
          continue;
        }
        const cached = cacheEnabled ? storage.get(prefix + text) : undefined;
        if (typeof cached === 'string' && cached.length)
          resolved[text] = cached;
        else if (missing.indexOf(text) < 0) missing.push(text);
      }
      for (let start = 0; start < missing.length; start += 20) {
        const batch = missing.slice(start, start + 20);
        try {
          const translations = await this.translate(batch, provider);
          const storedKeys = storage.get('metadataCacheIndexV1');
          const keys: string[] = Array.isArray(storedKeys)
            ? storedKeys.filter(key => typeof key === 'string')
            : [];
          batch.forEach((text, index) => {
            const translated = translations[index];
            resolved[text] = translated;
            if (!cacheEnabled || generation !== this.textCacheGeneration)
              return;
            const key = prefix + text;
            storage.set(key, translated);
            if (keys.indexOf(key) < 0) keys.push(key);
          });
          if (cacheEnabled && generation === this.textCacheGeneration) {
            while (keys.length > 5000) storage.delete(keys.shift()!);
            storage.set('metadataCacheIndexV1', keys);
          }
        } catch {
          // Browsing remains available if translation is temporarily unavailable.
          // Originals are not cached as successful translations; refresh retries.
          break;
        }
      }
      return texts.map(text => resolved[text] || text);
    });
  }

  async parseChapter(chapterPath: string): Promise<string> {
    this.maintainCaches();
    const path = this.path(chapterPath);
    if (!/^\/novel_chapter\/\d+\/\d+\.html$/.test(path))
      throw new Error('Invalid chapter path.');
    const provider = String(this.setting('translationProvider')) as Provider;
    if (!['google', 'microsoft', 'off'].includes(provider))
      throw new Error('Choose a valid translation provider.');
    const key = provider + ':en:' + path;
    if (this.inFlight[key]) return this.inFlight[key]!;
    const work = this.chapter(path, provider, key);
    this.inFlight[key] = work;
    try {
      return await work;
    } finally {
      delete this.inFlight[key];
    }
  }

  private async chapter(
    path: string,
    provider: Provider,
    key: string,
  ): Promise<string> {
    const generation = this.textCacheGeneration;
    const cacheEnabled = this.setting('cacheTranslations') === true;
    const cacheKey = 'translationCacheV1:' + key;
    if (provider !== 'off' && cacheEnabled) {
      const cached = storage.get(cacheKey);
      if (typeof cached === 'string' && cached.length) return cached;
    }
    const $ = await this.page(path);
    const article = $('main.app-content .article').first();
    if (
      article.hasClass('is-gated') ||
      article.attr('data-read-locked') === '1'
    ) {
      throw new Error(
        'This chapter is locked on 18mh. Open it on the source website and use its normal unlock process. This plugin supports public chapters only.',
      );
    }
    article
      .find(
        'script, style, iframe, ins, button, .ads, .advertisement, .jm-ad, [data-ad_slot_key]',
      )
      .remove();
    article.find('br').replaceWith('\n');
    const paragraphs = article.find('p').length
      ? article
          .find('p')
          .map((_, element) => $(element).text().trim())
          .get()
          .filter(Boolean)
      : article
          .text()
          .split(/\n+/)
          .map(text => text.trim())
          .filter(Boolean);
    if (!paragraphs.length)
      throw new Error(
        '18mh returned no readable chapter text. It may be locked or the layout changed.',
      );
    const translated =
      provider === 'off'
        ? paragraphs
        : await this.enqueue(() => this.translate(paragraphs, provider));
    const html = translated
      .map(text => '<p>' + this.escapeHtml(text) + '</p>')
      .join('\n');
    if (
      provider !== 'off' &&
      cacheEnabled &&
      generation === this.textCacheGeneration
    )
      this.cache(cacheKey, html);
    return html;
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.queue.then(action, action);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private chunks(text: string, limit: number): string[] {
    const result: string[] = [];
    let remaining = text;
    while (remaining.length > limit) {
      let end = limit;
      for (let index = limit; index >= limit / 2; index--) {
        if (/[。！？；.!?;\n]/.test(remaining.charAt(index - 1))) {
          end = index;
          break;
        }
      }
      const lastCode = remaining.charCodeAt(end - 1);
      if (lastCode >= 0xd800 && lastCode <= 0xdbff) end--;
      result.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }
    if (remaining) result.push(remaining);
    return result;
  }

  private async translate(
    paragraphs: string[],
    provider: 'google' | 'microsoft',
  ): Promise<string[]> {
    const parts: string[] = [];
    const ranges: number[] = [];
    paragraphs.forEach(paragraph => {
      const chunks = this.chunks(paragraph, provider === 'google' ? 900 : 4000);
      ranges.push(chunks.length);
      parts.push(...chunks);
    });
    const translated: string[] = [];
    if (provider === 'google') {
      // Small batches reduce requests while retaining paragraph boundaries.
      for (let start = 0; start < parts.length; ) {
        const batch: string[] = [];
        let size = 0;
        while (start < parts.length && size + parts[start].length <= 1000) {
          batch.push(parts[start]);
          size += parts[start++].length + 2;
        }
        const text = batch.join('\n\n');
        const output = await this.googleSingle(text);
        const split = output.trim().split(/\n\s*\n/);
        if (split.length !== batch.length) {
          // Retry individually if Google changes the paragraph separators.
          for (const item of batch)
            translated.push(await this.googleSingle(item));
        } else translated.push(...split);
      }
    } else {
      const apiKey = String(this.setting('microsoftKey')).trim();
      const region = String(this.setting('microsoftRegion')).trim();
      if (!apiKey)
        throw new Error(
          'Enter your Microsoft Translator F0 API key in plugin settings.',
        );
      if (region && !/^[a-z0-9-]+$/i.test(region))
        throw new Error('Enter a valid Microsoft resource region.');
      for (let start = 0; start < parts.length; ) {
        const batch: string[] = [];
        let characters = 0;
        while (
          start < parts.length &&
          batch.length < 100 &&
          characters + parts[start].length <= 20000
        ) {
          characters += parts[start].length;
          batch.push(parts[start++]);
        }
        const response = await this.translationResponse(
          'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&from=zh-Hans&to=en',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Ocp-Apim-Subscription-Key': apiKey,
              ...(region ? { 'Ocp-Apim-Subscription-Region': region } : {}),
            },
            body: JSON.stringify(batch.map(Text => ({ Text }))),
          },
          async () => this.reserveMicrosoftQuota(characters),
        );
        if (!response.ok)
          throw new Error(
            'Microsoft Translator returned HTTP ' +
              response.status +
              '. Check your F0 key, region, and free quota. No provider fallback was used.',
          );
        const body: unknown = await response.json();
        if (!Array.isArray(body) || body.length !== batch.length)
          throw new Error('Unexpected Microsoft Translator response.');
        body.forEach((item: { translations?: { text?: string }[] }) => {
          const text = item?.translations?.[0]?.text;
          if (typeof text !== 'string' || !text.trim())
            throw new Error('Microsoft Translator returned empty text.');
          translated.push(text);
        });
      }
    }
    let offset = 0;
    return ranges.map(count => {
      const text = translated.slice(offset, offset + count).join(' ');
      offset += count;
      return text;
    });
  }

  private async googleSingle(text: string): Promise<string> {
    // Share pacing across titles, chapter bodies, and delimiter-recovery requests.
    const spacing = Number(this.setting('googleRequestSpacing'));
    if (![1250, 2000, 3000].includes(spacing))
      throw new Error('Choose a valid Google request spacing.');
    const response = await this.translationResponse(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=' +
        encodeURIComponent(text),
      undefined,
      async () => {
        const delay = this.googleReadyAt - Date.now();
        if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
        this.googleReadyAt = Date.now() + spacing;
      },
    );
    if (!response.ok) {
      if (response.status === 429) this.googleReadyAt = Date.now() + 5000;
      throw new Error(
        'Unofficial Google Translate returned HTTP ' + response.status + '.',
      );
    }
    const body: unknown = await response.json();
    if (!Array.isArray(body) || !Array.isArray(body[0]))
      throw new Error('Unexpected Google Translate response.');
    const output = body[0]
      .map((segment: unknown) =>
        Array.isArray(segment) && typeof segment[0] === 'string'
          ? segment[0]
          : '',
      )
      .join('');
    if (!output.trim())
      throw new Error('Google Translate returned empty text.');
    return output;
  }

  private async translationResponse(
    url: string,
    init?: RequestInit,
    beforeAttempt?: () => Promise<void>,
  ): Promise<Response> {
    const retries = this.setting('retryTemporaryErrors') === true ? 1 : 0;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (beforeAttempt) await beforeAttempt();
      let response: Response;
      try {
        response = await fetchApi(url, init);
      } catch (error) {
        if (
          attempt === retries ||
          (error instanceof Error && error.name === 'AbortError')
        )
          throw new Error(
            'Translation network request failed. Try again later.',
          );
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }
      if (
        attempt === retries ||
        ![429, 500, 502, 503, 504].includes(response.status)
      )
        return response;
      const header = response.headers.get('Retry-After');
      const retryAfter =
        header === null
          ? 0
          : /^\d+(?:\.\d+)?$/.test(header.trim())
            ? Number(header) * 1000
            : Math.max(0, Date.parse(header) - Date.now());
      // Do not retry early when the service requests a long cooldown.
      if (!Number.isFinite(retryAfter) || retryAfter > 10000) return response;
      await new Promise(resolve =>
        setTimeout(
          resolve,
          Math.max(response.status === 429 ? 5000 : 1000, retryAfter),
        ),
      );
    }
    throw new Error('Translation request failed.');
  }

  private reserveMicrosoftQuota(characters: number): void {
    const month = new Date().toISOString().slice(0, 7);
    const stored = storage.get('microsoftUsageV1') as
      | { month?: string; characters?: number }
      | undefined;
    const used = stored?.month === month ? Number(stored.characters) || 0 : 0;
    const cap = Number(this.setting('microsoftMonthlyLimit'));
    if (!Number.isFinite(cap) || cap <= 0 || cap > 2000000)
      throw new Error(
        'Set a Microsoft monthly cap between 1 and 2000000 characters.',
      );
    if (used + characters > cap)
      throw new Error(
        'This device reached its Microsoft monthly character cap. Wait for next month or choose Google.',
      );
    // Reserve before the request; failed requests remain counted conservatively.
    storage.set('microsoftUsageV1', { month, characters: used + characters });
  }

  private cache(key: string, html: string): void {
    const limit = 100;
    const stored = storage.get('translationCacheIndexV1');
    const keys: string[] = Array.isArray(stored)
      ? stored.filter(item => typeof item === 'string' && item !== key)
      : [];
    storage.set(key, html);
    keys.push(key);
    while (keys.length > limit) storage.delete(keys.shift()!);
    storage.set('translationCacheIndexV1', keys);
  }
}

export default new EighteenMhEnglishPlugin();
