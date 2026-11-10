import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createPlugin } from '../scripts/runtime.mjs';

const chapterPath = '/novel_chapter/123/1.html';
const chapter =
  '<main class="app-content"><div class="article jm-rd-text"><p>你好，世界。</p><p>今天天气很好。</p><script>unwanted()</script></div></main>';
const source = text => new Response(text, { status: 200 });

test('bundle initializes with only LNReader 2.1.4 supported modules and dropdown', () => {
  const { plugin } = createPlugin();
  assert.equal(plugin.id, 'eighteenMhEnglish');
  assert.equal(plugin.version, '1.2.0');
  assert.deepEqual(
    plugin.pluginSettings.translationProvider.options.map(item => item.value),
    ['google', 'microsoft', 'off'],
  );
});

test('off mode preserves paragraphs, escapes text and removes scripts', async () => {
  const { plugin } = createPlugin({
    values: new Map([['translationProvider', 'off']]),
    fetcher: async () => source(chapter),
  });
  const html = await plugin.parseChapter(chapterPath);
  assert.equal((html.match(/<p>/g) || []).length, 2);
  assert(html.includes('你好，世界。'));
  assert(!html.includes('unwanted'));
});

test('locked chapters never call a translation provider', async () => {
  let requests = 0;
  const { plugin } = createPlugin({
    fetcher: async () => {
      requests++;
      return source(
        '<main class="app-content"><div class="article is-gated" data-read-locked="1"><p>Preview</p></div></main>',
      );
    },
  });
  await assert.rejects(plugin.parseChapter(chapterPath), /locked/i);
  assert.equal(requests, 1);
});

test('empty chapters fail rather than saving a blank download', async () => {
  const { plugin } = createPlugin({
    fetcher: async () => source('<main></main>'),
  });
  await assert.rejects(plugin.parseChapter(chapterPath), /no readable chapter/);
});

test('Google requests have no Microsoft credentials and cache by provider', async () => {
  let calls = 0;
  const values = new Map([['microsoftKey', 'private-test-key']]);
  const { plugin } = createPlugin({
    values,
    fetcher: async (url, init) => {
      calls++;
      if (url.startsWith('https://18mh.net/')) return source(chapter);
      assert(url.startsWith('https://translate.googleapis.com/'));
      assert(!JSON.stringify(init || {}).includes('private-test-key'));
      return Response.json([
        [['Hello, world.\n\nThe weather is good today.', null]],
      ]);
    },
  });
  const translated = await plugin.parseChapter(chapterPath);
  assert(translated.includes('Hello, world.'));
  assert.equal(calls, 2);
  assert.equal(await plugin.parseChapter(chapterPath), translated);
  assert.equal(calls, 2);
  values.set('translationProvider', 'off');
  assert((await plugin.parseChapter(chapterPath)).includes('你好'));
  assert.equal(calls, 3);
});

test('translation HTTP failure does not save Chinese fallback or successful cache', async () => {
  const { plugin, values } = createPlugin({
    fetcher: async url =>
      url.startsWith('https://18mh.net/')
        ? source(chapter)
        : new Response('', { status: 429 }),
  });
  await assert.rejects(plugin.parseChapter(chapterPath), /HTTP 429/);
  assert(
    !Array.from(values.keys()).some(key =>
      key.startsWith('translationCacheV1:'),
    ),
  );
});

test('concurrent requests for the same chapter share one translation', async () => {
  let calls = 0;
  const { plugin } = createPlugin({
    fetcher: async url => {
      calls++;
      return url.startsWith('https://18mh.net/')
        ? source(chapter)
        : Response.json([[['First paragraph.\n\nSecond paragraph.']]]);
    },
  });
  const [first, second] = await Promise.all([
    plugin.parseChapter(chapterPath),
    plugin.parseChapter(chapterPath),
  ]);
  assert.equal(first, second);
  assert.equal(calls, 2);
});

test('Microsoft uses the selected key and region, fixed endpoint, and text array', async () => {
  const values = new Map([
    ['translationProvider', 'microsoft'],
    ['microsoftKey', 'test-key'],
    ['microsoftRegion', 'centralindia'],
  ]);
  let calls = 0;
  const { plugin } = createPlugin({
    values,
    fetcher: async (url, init) => {
      calls++;
      if (url.startsWith('https://18mh.net/')) return source(chapter);
      assert(
        url.startsWith(
          'https://api.cognitive.microsofttranslator.com/translate?',
        ),
      );
      assert.equal(init.headers['Ocp-Apim-Subscription-Key'], 'test-key');
      assert.equal(
        init.headers['Ocp-Apim-Subscription-Region'],
        'centralindia',
      );
      const body = JSON.parse(init.body);
      assert.equal(body.length, 2);
      assert.equal(body[0].Text, '你好，世界。');
      return Response.json(
        body.map((_, index) => ({
          translations: [{ text: 'Translated ' + index, to: 'en' }],
        })),
      );
    },
  });
  assert((await plugin.parseChapter(chapterPath)).includes('Translated 1'));
  assert.equal(calls, 2);
  assert(values.get('microsoftUsageV1').characters > 0);
});

test('Microsoft local cap blocks calls, does not fall back to Google', async () => {
  const values = new Map([
    ['translationProvider', 'microsoft'],
    ['microsoftKey', 'test-key'],
    ['microsoftMonthlyLimit', '1'],
  ]);
  let translationCalls = 0;
  const { plugin } = createPlugin({
    values,
    fetcher: async url => {
      if (url.startsWith('https://18mh.net/')) return source(chapter);
      translationCalls++;
      throw new Error('Unexpected translation request');
    },
  });
  await assert.rejects(
    plugin.parseChapter(chapterPath),
    /monthly character cap/,
  );
  assert.equal(translationCalls, 0);
});

test('provider output cannot inject HTML', async () => {
  const { plugin } = createPlugin({
    fetcher: async url =>
      url.startsWith('https://18mh.net/')
        ? source(chapter)
        : Response.json([[['<script>bad()</script>\n\nSecond paragraph.']]]),
  });
  const html = await plugin.parseChapter(chapterPath);
  assert(html.includes('&lt;script&gt;'));
  assert(!html.includes('<script>'));
});

test('very long paragraphs are chunked without losing surrogate pairs', () => {
  const { plugin } = createPlugin();
  const text = '汉'.repeat(899) + '😀' + '字'.repeat(2200);
  const chunks = plugin.chunks(text, 900);
  assert.equal(chunks.join(''), text);
  assert(chunks.every(chunk => chunk.length <= 900));
  assert(chunks.every(chunk => !/[\ud800-\udbff]$/.test(chunk)));
});

test('cache eviction bounds stored chapter count', () => {
  const { plugin, values } = createPlugin();
  for (let index = 0; index < 105; index++)
    plugin.cache('chapter:' + index, '<p>Cached</p>');
  assert.equal(values.get('translationCacheIndexV1').length, 100);
  assert(!values.has('chapter:0'));
  assert(values.has('chapter:104'));
});

test('source URL validation prevents arbitrary fetches', async () => {
  const { plugin } = createPlugin();
  assert.throws(
    () => plugin.resolveUrl('https://example.com/test'),
    /Unsupported/,
  );
  assert.throws(() => plugin.resolveUrl('//example.com/test'), /Invalid/);
  await assert.rejects(plugin.parseChapter('/wrong/path'), /Invalid chapter/);
});

test('novel chapter extraction deduplicates and sorts numeric chapter numbers', async () => {
  const { plugin } = createPlugin({
    fetcher: async () =>
      source(
        '<h1 class="jm-dt-title">Neutral title</h1><a class="jm-dt-ch" href="/novel_chapter/123/2.html" data-chapter-no="2">Two</a><a class="jm-dt-ch" href="/novel_chapter/123/1.html" data-chapter-no="1">One</a><a class="jm-dt-ch" href="/novel_chapter/123/1.html">Duplicate</a>',
      ),
  });
  const novel = await plugin.parseNovel('/novel/detail/123');
  assert.deepEqual(
    novel.chapters.map(chapter => chapter.chapterNumber),
    [1, 2],
  );
});

const listing = '<a href="/novel/detail/123"><img alt="春天的故事"></a>';
const novelDetail =
  '<h1 class="jm-dt-title">春天的故事</h1><a class="jm-dt-ch" href="/novel_chapter/123/1.html" data-chapter-no="1">第一章：新的开始</a><a class="jm-dt-ch" href="/novel_chapter/123/2.html" data-chapter-no="2">第二章：回家</a>';
const translatedTitles = {
  春天的故事: 'A Story of Spring',
  '第一章：新的开始': 'Chapter 1: A New Beginning',
  '第二章：回家': 'Chapter 2: Going Home',
};
const feed = (html = listing) =>
  Response.json({ code: 200, data: { wall_html: html, total_page: 3 } });

function titleFetcher(calls) {
  return async url => {
    calls.push(url);
    if (url.startsWith('https://translate.googleapis.com/')) {
      const text = new URL(url).searchParams.get('q');
      return Response.json([
        [
          [
            text
              .split('\n\n')
              .map(value => translatedTitles[value] || value)
              .join('\n\n'),
          ],
        ],
      ]);
    }
    if (url.includes('_feed=1')) return feed();
    if (url.includes('/novel/search/')) return source(listing);
    return source(novelDetail);
  };
}

test('novel and chapter names translate before chapter bodies are opened; stable paths survive', async () => {
  const calls = [];
  const { plugin } = createPlugin({ fetcher: titleFetcher(calls) });
  const novels = await plugin.popularNovels(1);
  assert.equal(novels[0].name, 'A Story of Spring');
  assert.equal(novels[0].path, '/novel/detail/123');
  assert.equal(
    calls.filter(url => url.includes('translate.googleapis.com')).length,
    1,
  );
  const novel = await plugin.parseNovel('/novel/detail/123');
  assert.equal(novel.name, 'A Story of Spring');
  assert.deepEqual(
    novel.chapters.map(item => item.name),
    ['Chapter 1: A New Beginning', 'Chapter 2: Going Home'],
  );
  assert.equal(novel.chapters[0].path, '/novel_chapter/123/1.html');
  assert.equal(
    calls.filter(url => url.includes('translate.googleapis.com')).length,
    2,
  );
  await plugin.parseNovel('/novel/detail/123');
  assert.equal(
    calls.filter(url => url.includes('translate.googleapis.com')).length,
    2,
  );
  assert(!calls.some(url => url.startsWith('https://18mh.net/novel_chapter/')));
});

test('search results translate titles', async () => {
  const { plugin } = createPlugin({ fetcher: titleFetcher([]) });
  const found = await plugin.searchNovels('春天', 1);
  assert.equal(found[0].name, 'A Story of Spring');
});

test('title toggles are independent and Off disables all metadata translation', async () => {
  const calls = [];
  const values = new Map([['translateNovelTitles', false]]);
  const { plugin } = createPlugin({ values, fetcher: titleFetcher(calls) });
  const novel = await plugin.parseNovel('/novel/detail/123');
  assert.equal(novel.name, '春天的故事');
  assert.equal(novel.chapters[0].name, 'Chapter 1: A New Beginning');
  values.set('translationProvider', 'off');
  const requestsBefore = calls.length;
  const original = await plugin.parseNovel('/novel/detail/123');
  assert.equal(original.chapters[0].name, '第一章：新的开始');
  assert.equal(calls.length, requestsBefore + 1);
});

test('metadata errors retain original names without caching failed translations and retry on refresh', async () => {
  let fail = true;
  const calls = [];
  const validFetcher = titleFetcher(calls);
  const { plugin, values } = createPlugin({
    fetcher: async url =>
      fail && url.includes('translate.googleapis.com')
        ? new Response('', { status: 429 })
        : validFetcher(url),
  });
  const original = await plugin.popularNovels(1);
  assert.equal(original[0].name, '春天的故事');
  assert(
    !Array.from(values.keys()).some(key => key.startsWith('metadataCacheV1:')),
  );
  fail = false;
  const translated = await plugin.popularNovels(1);
  assert.equal(translated[0].name, 'A Story of Spring');
});

test('metadata cache is provider-specific and respects disabled caching', async () => {
  const calls = [];
  const values = new Map();
  const googleFetcher = titleFetcher(calls);
  let microsoftCalls = 0;
  const { plugin } = createPlugin({
    values,
    fetcher: async (url, init) => {
      if (url.includes('api.cognitive.microsofttranslator.com')) {
        microsoftCalls++;
        return Response.json(
          JSON.parse(init.body).map(item => ({
            translations: [
              { text: 'Microsoft: ' + translatedTitles[item.Text] },
            ],
          })),
        );
      }
      return googleFetcher(url);
    },
  });
  await plugin.popularNovels(1);
  values.set('translationProvider', 'microsoft');
  values.set('microsoftKey', 'test-key');
  assert.equal(
    (await plugin.popularNovels(1))[0].name,
    'Microsoft: A Story of Spring',
  );
  assert.equal(microsoftCalls, 1);
  values.set('cacheTranslations', false);
  await plugin.popularNovels(1);
  assert.equal(microsoftCalls, 2);
});

test('filters use correct feed pagination and preserve status/length on page 2', async () => {
  const calls = [];
  const { plugin } = createPlugin({
    values: new Map([['translationProvider', 'off']]),
    fetcher: async (url, init) => {
      calls.push(url);
      assert.equal(init.headers.Accept, 'application/json');
      return feed();
    },
  });
  await plugin.popularNovels(2, {
    filters: { status: { value: '1' }, length: { value: '2' } },
  });
  assert.equal(
    calls[0],
    'https://18mh.net/novel/all/page/2?_feed=1&status=1&length=2',
  );
  await plugin.popularNovels(2, {
    filters: {
      collection: { value: '/novel/all/kxhx' },
      status: { value: '2' },
    },
  });
  assert.equal(calls[1], 'https://18mh.net/novel/all/kxhx/2?_feed=1&status=2');
  await plugin.popularNovels(2, {
    filters: { collection: { value: '/novel/hot' } },
  });
  assert.equal(calls[2], 'https://18mh.net/novel/hot/2?_feed=1');
  await plugin.popularNovels(1, {
    filters: { collection: { value: '/novel/last_published' } },
  });
  assert(calls[3].startsWith('https://18mh.net/novel/last_published?'));
});

test('tag feed supports common tags, custom tags and filtered pagination', async () => {
  const calls = [];
  const { plugin } = createPlugin({
    values: new Map([['translationProvider', 'off']]),
    fetcher: async url => {
      calls.push(url);
      return feed();
    },
  });
  await plugin.popularNovels(2, {
    filters: { tag: { value: '1v1' }, length: { value: '1' } },
  });
  assert.equal(calls[0], 'https://18mh.net/novel/tag/1v1/2?_feed=1&length=1');
  await plugin.popularNovels(1, {
    filters: { tag: { value: '1v1' }, customTag: { value: '剧情' } },
  });
  assert(calls[1].includes('/novel/tag/' + encodeURIComponent('剧情') + '?'));
});

test('invalid filters and unsupported combinations fail before a network call', async () => {
  const { plugin } = createPlugin({
    fetcher: async () => {
      throw new Error('Network must not run');
    },
  });
  await assert.rejects(
    plugin.popularNovels(1, {
      filters: { collection: { value: '/arbitrary/path' } },
    }),
    /valid collection/,
  );
  await assert.rejects(
    plugin.popularNovels(1, {
      filters: { tag: { value: '1v1' }, collection: { value: '/novel/hot' } },
    }),
    /separate collection and tag/,
  );
  await assert.rejects(
    plugin.popularNovels(1, { filters: { customTag: { value: '../bad' } } }),
    /single source tag/,
  );
  await assert.rejects(plugin.popularNovels(0), /page number/);
});

test('empty filtered results are valid, malformed feeds are errors', async () => {
  let valid = true;
  const { plugin } = createPlugin({
    fetcher: async () => (valid ? feed('') : Response.json({ code: 500 })),
  });
  assert.deepEqual(await plugin.popularNovels(1), []);
  valid = false;
  await assert.rejects(plugin.popularNovels(1), /invalid list feed/);
});

test('Google pacing is shared between title and chapter-body requests', async () => {
  const starts = [];
  const { plugin } = createPlugin({
    fetcher: async url => {
      if (url.includes('_feed=1')) return feed();
      if (url.startsWith('https://18mh.net/')) return source(chapter);
      starts.push(Date.now());
      const text = new URL(url).searchParams.get('q');
      return Response.json([
        [
          [
            text
              .split('\n\n')
              .map((_, index) => 'Translated ' + index)
              .join('\n\n'),
          ],
        ],
      ]);
    },
  });
  await plugin.popularNovels(1);
  await plugin.parseChapter(chapterPath);
  assert.equal(starts.length, 2);
  assert(
    starts[1] - starts[0] >= 1200,
    'Title and body requests must share the 1.25-second pacing interval',
  );
});

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=',
  'base64',
);
function encryptedImage() {
  const padded = Buffer.alloc(Math.ceil(png.length / 16) * 16);
  png.copy(padded);
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from('f5d965df75336270'),
    Buffer.from('97b60394abc2fbe1'),
  );
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(padded), cipher.final()]);
}

test('descriptions translate independently and reuse the metadata cache', async () => {
  let translations = 0;
  const values = new Map([
    ['translateNovelTitles', false],
    ['translateChapterTitles', false],
  ]);
  const { plugin } = createPlugin({
    values,
    fetcher: async url => {
      if (url.includes('translate.googleapis.com')) {
        translations++;
        assert.equal(
          new URL(url).searchParams.get('q'),
          '这是一个关于春天的故事。',
        );
        return Response.json([[['This is a story about spring.']]]);
      }
      return source(
        novelDetail + '<p class="jm-dt-desc__p">这是一个关于春天的故事。</p>',
      );
    },
  });
  assert.equal(
    (await plugin.parseNovel('/novel/detail/123')).summary,
    'This is a story about spring.',
  );
  await plugin.parseNovel('/novel/detail/123');
  assert.equal(translations, 1);
  values.set('translateDescriptions', false);
  assert.equal(
    (await plugin.parseNovel('/novel/detail/123')).summary,
    '这是一个关于春天的故事。',
  );
  values.set('translateDescriptions', true);
  values.set('translationProvider', 'off');
  assert.equal(
    (await plugin.parseNovel('/novel/detail/123')).summary,
    '这是一个关于春天的故事。',
  );
  assert.equal(translations, 1);
});

test('unavailable description translation keeps the original description', async () => {
  const { plugin } = createPlugin({
    values: new Map([
      ['translateNovelTitles', false],
      ['translateChapterTitles', false],
    ]),
    fetcher: async url =>
      url.includes('translate.googleapis.com')
        ? new Response('', { status: 429 })
        : source(novelDetail + '<p class="jm-dt-desc__p">春天的故事。</p>'),
  });
  assert.equal(
    (await plugin.parseNovel('/novel/detail/123')).summary,
    '春天的故事。',
  );
});

test('encrypted covers decode without a proxy and cache across expiring signatures', async () => {
  let calls = 0;
  const { plugin, values } = createPlugin({
    fetcher: async (url, init) => {
      calls++;
      assert.equal(init.headers.Referer, 'https://18mh.net/');
      assert(!JSON.stringify(init).includes('Ocp-Apim'));
      return new Response(encryptedImage(), {
        headers: { 'Content-Type': 'binary/octet-stream' },
      });
    },
  });
  const uri = await plugin.cover(
    'https://images.example/cover.jpeg?auth_key=old',
  );
  assert(uri.startsWith('data:image/png;base64,'));
  assert.deepEqual(
    Buffer.from(uri.split(',')[1], 'base64').subarray(0, png.length),
    png,
  );
  assert.equal(
    await plugin.cover('https://images.example/cover.jpeg?auth_key=new'),
    uri,
  );
  assert.equal(calls, 1);
  assert(values.has('coverCacheV1:https://images.example/cover.jpeg'));
});

test('plain cover bytes pass through and concurrent loads share one request', async () => {
  let calls = 0;
  const { plugin } = createPlugin({
    fetcher: async () => {
      calls++;
      return new Response(png);
    },
  });
  const [first, second] = await Promise.all([
    plugin.cover('https://images.example/plain.png'),
    plugin.cover('https://images.example/plain.png'),
  ]);
  assert.equal(first, 'data:image/png;base64,' + png.toString('base64'));
  assert.equal(first, second);
  assert.equal(calls, 1);
});

test('failed covers and disabled thumbnails do not break novel details', async () => {
  let imageCalls = 0;
  const values = new Map([['translationProvider', 'off']]);
  const { plugin } = createPlugin({
    values,
    fetcher: async url => {
      if (url.startsWith('https://images.example')) {
        imageCalls++;
        return source('<html>Not an image</html>');
      }
      return source(
        novelDetail +
          '<img class="jm-dt-cover__img" data-src="https://images.example/bad.jpeg">',
      );
    },
  });
  const novel = await plugin.parseNovel('/novel/detail/123');
  assert.equal(novel.cover, undefined);
  assert.equal(novel.chapters.length, 2);
  assert.equal(imageCalls, 1);
  values.set('loadThumbnails', false);
  await plugin.parseNovel('/novel/detail/123');
  assert.equal(imageCalls, 1);
});

test('decoded covers appear in Browse and novel details with shared caching', async () => {
  let imageCalls = 0;
  const { plugin } = createPlugin({
    values: new Map([['translationProvider', 'off']]),
    fetcher: async url => {
      if (url.startsWith('https://images.example')) {
        imageCalls++;
        return new Response(encryptedImage());
      }
      if (url.includes('_feed=1'))
        return feed(
          '<article class="jm-card"><a href="/novel/detail/123">春天的故事</a><img data-src="https://images.example/cover.jpeg"></article>',
        );
      return source(
        novelDetail +
          '<img class="jm-dt-cover__img" data-src="https://images.example/cover.jpeg">',
      );
    },
  });
  const novels = await plugin.popularNovels(1);
  const novel = await plugin.parseNovel('/novel/detail/123');
  assert(novels[0].cover.startsWith('data:image/png;'));
  assert.equal(novels[0].cover, novel.cover);
  assert.equal(imageCalls, 1);
});

test('cover cache has an entry bound and expires after seven days', async () => {
  let calls = 0;
  const { plugin, values } = createPlugin({
    fetcher: async () => {
      calls++;
      return new Response(png);
    },
  });
  for (let index = 0; index < 41; index++)
    await plugin.cover('https://images.example/' + index + '.png');
  assert.equal(values.get('coverCacheIndexV1').length, 40);
  assert(!values.has('coverCacheV1:https://images.example/0.png'));
  const key = 'coverCacheV1:https://images.example/40.png';
  const entry = values.get(key);
  values.set(key, { ...entry, updatedAt: Date.now() - 8 * 86400000 });
  await plugin.cover('https://images.example/40.png');
  assert.equal(calls, 42);
});
