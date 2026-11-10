import fs from 'node:fs';
import { load } from 'cheerio';

export function createPlugin({ values = new Map(), fetcher = fetch } = {}) {
  const storage = {
    get: key => values.get(key),
    set: (key, value) => values.set(key, value),
    delete: key => values.delete(key),
  };
  const packages = {
    '@libs/filterInputs': {
      FilterTypes: { TextInput: 'Text', Picker: 'Picker' },
    },
    cheerio: { load },
    '@libs/fetch': { fetchApi: fetcher },
    '@libs/storage': { storage },
    '@libs/novelStatus': {
      NovelStatus: {
        Unknown: 'Unknown',
        Ongoing: 'Ongoing',
        Completed: 'Completed',
      },
    },
  };
  const code = fs.readFileSync(
    new URL('../dist/plugins/eighteenMhEnglish.js', import.meta.url),
    'utf8',
  );
  const plugin = Function(
    'require',
    'module',
    'const exports = module.exports = {};\n' +
      code +
      '\nreturn exports.default;',
  )(name => {
    if (!(name in packages))
      throw new Error('Unsupported LNReader runtime module: ' + name);
    return packages[name];
  }, {});
  return { plugin, values };
}

export async function timedFetch(url, init = {}) {
  return fetch(url, {
    ...init,
    headers: { 'User-Agent': 'Mozilla/5.0', ...init.headers },
    signal: AbortSignal.timeout(30000),
  });
}
