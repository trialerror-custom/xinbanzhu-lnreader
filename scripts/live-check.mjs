import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPlugin, timedFetch } from './runtime.mjs';

const values = new Map([['translationProvider', 'off']]);
const { plugin } = createPlugin({ values, fetcher: timedFetch });
const checks = [];
async function check(name, action) {
  try {
    const detail = await action();
    checks.push({ name, result: 'PASS', ...detail });
    console.log('PASS ' + name + ': ' + JSON.stringify(detail));
  } catch (error) {
    checks.push({ name, result: 'FAIL', error: error.message });
    console.error('FAIL ' + name + ': ' + error.message);
  }
}
let novels;
await check('Novel listing', async () => {
  novels = await plugin.popularNovels(1);
  assert(novels.length > 0);
  return { count: novels.length, firstPath: novels[0].path };
});
await check('Pagination', async () => {
  const second = await plugin.popularNovels(2);
  assert(second.length > 0);
  assert.notEqual(second[0].path, novels?.[0]?.path);
  return { count: second.length, firstPath: second[0].path };
});
await check('Status and length filters with pagination', async () => {
  const options = {
    filters: { status: { value: '1' }, length: { value: '1' } },
  };
  const first = await plugin.popularNovels(1, options);
  const second = await plugin.popularNovels(2, options);
  assert(first.length > 0 && second.length > 0);
  assert.notEqual(first[0].path, second[0].path);
  return { firstCount: first.length, secondCount: second.length };
});
await check('Category feed', async () => {
  const found = await plugin.popularNovels(1, {
    filters: { collection: { value: '/novel/all/kxhx' } },
  });
  assert(found.length > 0);
  return { count: found.length };
});
await check('Tag feed with status', async () => {
  const found = await plugin.popularNovels(1, {
    filters: { tag: { value: '1v1' }, status: { value: '1' } },
  });
  assert(found.length > 0);
  return { count: found.length };
});
await check('Most viewed and newly listed collections', async () => {
  const hot = await plugin.popularNovels(1, {
    filters: { collection: { value: '/novel/hot' } },
  });
  const newest = await plugin.popularNovels(1, {
    filters: { collection: { value: '/novel/last_published' } },
  });
  assert(hot.length > 0 && newest.length > 0);
  return { mostViewed: hot.length, newlyListed: newest.length };
});
await check('Novel details and chapter order', async () => {
  const novel = await plugin.parseNovel('/novel/detail/27340');
  assert(novel.chapters.length >= 70);
  assert.equal(novel.chapters[0].chapterNumber, 1);
  assert(
    novel.chapters.every(
      (chapter, index) =>
        !index ||
        chapter.chapterNumber > novel.chapters[index - 1].chapterNumber,
    ),
  );
  return { count: novel.chapters.length };
});
await check('Public chapter extraction', async () => {
  const html = await plugin.parseChapter('/novel_chapter/27340/1.html');
  assert((html.match(/[\u4e00-\u9fff]/g) || []).length > 100);
  assert(!/<script|<iframe/i.test(html));
  return {
    htmlCharacters: html.length,
    paragraphs: (html.match(/<p>/g) || []).length,
  };
});
await check('Locked chapter detection', async () => {
  await assert.rejects(
    plugin.parseChapter('/novel_chapter/27340/70.html'),
    /locked/i,
  );
  return { message: 'Explicit access error; no translation request' };
});
await check('Search by source novel ID', async () => {
  const found = await plugin.searchNovels('27340', 1);
  assert.equal(found[0]?.path, '/novel/detail/27340');
  return { count: found.length };
});
await check('Chinese keyword search', async () => {
  const found = await plugin.searchNovels('都市', 1);
  assert(found.length > 0);
  return { count: found.length };
});
// Translate only a neutral sample, never send a whole novel during validation.
await check('Unofficial Google endpoint', async () => {
  values.set('translationProvider', 'google');
  const output = await plugin.translate(
    ['你好，世界。', '今天天气很好。'],
    'google',
  );
  assert.equal(output.length, 2);
  assert(output.every(text => /[a-z]/i.test(text)));
  return { paragraphs: output.length, sample: output[0] };
});
await check(
  'Title translation pipeline and persistent metadata cache',
  async () => {
    const texts = ['春天的故事', '第一章：新的开始', '第二章：回家'];
    const output = await plugin.metadata(texts, 'translateChapterTitles');
    assert(
      output.every(
        (text, index) => text !== texts[index] && /[a-z]/i.test(text),
      ),
    );
    const cached = values.get('metadataCacheV1:google:en:' + texts[0]);
    assert.equal(cached, output[0]);
    assert.deepEqual(
      await plugin.metadata(texts, 'translateChapterTitles'),
      output,
    );
    return { translatedNames: output.length, cacheVerified: true };
  },
);
const report = {
  checkedAt: new Date().toISOString(),
  runtime: 'Node mock of LNReader 2.1.4 module loader; Android not tested',
  checks,
};
fs.mkdirSync('work', { recursive: true });
fs.writeFileSync('work/live-report.json', JSON.stringify(report, null, 2));
if (checks.some(check => check.result === 'FAIL')) process.exitCode = 1;
