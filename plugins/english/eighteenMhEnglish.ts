import { load } from 'cheerio';
import { fetchApi } from '@libs/fetch';
import { storage } from '@libs/storage';
import { NovelStatus } from '@libs/novelStatus';

type NovelItem = { name: string; path: string; cover?: string };
type ChapterItem = { name: string; path: string; chapterNumber: number };
type Provider = 'google' | 'microsoft' | 'off';
type Setting = {
  label: string;
  value: string | boolean;
  type: 'Text' | 'Select' | 'Switch';
  options?: { label: string; value: string }[];
};

class EighteenMhEnglishPlugin {
  id = 'eighteenMhEnglish';
  name = '18mh — English';
  version = '1.0.0';
  site = 'https://18mh.net';
  icon = 'icon.png';
  imageRequestInit = { headers: { Referer: 'https://18mh.net/' } };
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
      label: 'Cache translated chapters',
      type: 'Switch',
      value: true,
    },
  };
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight: Record<string, Promise<string> | undefined> = {};

  private setting(key: string): string | boolean {
    const value = storage.get(key);
    return typeof value === 'string' || typeof value === 'boolean'
      ? value
      : this.pluginSettings[key].value;
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
      const image = link.find('img').first();
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

  async popularNovels(
    pageNo: number,
    options?: { showLatestNovels?: boolean },
  ): Promise<NovelItem[]> {
    const $ = await this.page(
      '/novel/all' + (pageNo > 1 ? '/page/' + pageNo : ''),
    );
    const novels = this.listings($);
    if (!novels.length && pageNo === 1)
      throw new Error(
        '18mh returned no novels. The site layout may have changed.',
      );
    return novels;
  }

  async searchNovels(searchTerm: string, pageNo: number): Promise<NovelItem[]> {
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
    return this.listings(
      await this.page(
        '/novel/search/' +
          encodeURIComponent(query.replace(/\s*\/+\s*/g, ' ')) +
          (pageNo > 1 ? '/page/' + pageNo : ''),
      ),
    );
  }

  async parseNovel(novelPath: string) {
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
    return {
      path,
      name,
      cover: cover?.startsWith('/') ? this.site + cover : cover,
      summary: $('.jm-dt-desc__p, .detail-page__description')
        .first()
        .text()
        .trim(),
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
      chapters,
    };
  }

  async parseChapter(chapterPath: string): Promise<string> {
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
    if (provider !== 'off' && cacheEnabled) this.cache(cacheKey, html);
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
        const url =
          'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=' +
          encodeURIComponent(text);
        const response = await fetchApi(url);
        if (!response.ok)
          throw new Error(
            'Unofficial Google Translate returned HTTP ' +
              response.status +
              '. Try later or select Microsoft.',
          );
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
        const split = output.trim().split(/\n\s*\n/);
        if (split.length !== batch.length) {
          // Retry individually if Google changes the paragraph separators.
          for (const item of batch)
            translated.push(await this.googleSingle(item));
        } else translated.push(...split);
        if (start < parts.length)
          await new Promise(resolve => setTimeout(resolve, 350));
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
        this.reserveMicrosoftQuota(characters);
        const response = await fetchApi(
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
    const response = await fetchApi(
      'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=en&dt=t&q=' +
        encodeURIComponent(text),
    );
    if (!response.ok)
      throw new Error(
        'Unofficial Google Translate returned HTTP ' + response.status + '.',
      );
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
    await new Promise(resolve => setTimeout(resolve, 350));
    return output;
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
