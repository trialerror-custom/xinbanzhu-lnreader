import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlugin } from '../scripts/runtime.mjs';

const chapterPath = '/novel_chapter/123/1.html';
const chapter =
  '<main class="app-content"><div class="article jm-rd-text"><p>你好，世界。</p><p>今天天气很好。</p><script>unwanted()</script></div></main>';
const source = text => new Response(text, { status: 200 });

test('bundle initializes with only LNReader 2.1.4 supported modules and dropdown', () => {
  const { plugin } = createPlugin();
  assert.equal(plugin.id, 'eighteenMhEnglish');
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
