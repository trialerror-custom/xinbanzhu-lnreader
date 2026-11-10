import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const baseArg = process.argv.find(value => value.startsWith('--base-url='));
const configured =
  baseArg?.slice('--base-url='.length) || process.env.PLUGIN_BASE_URL;
const base = (configured || 'http://127.0.0.1:8080').replace(/\/$/, '');
const parsed = new URL(base);
if (
  !['https:', 'http:'].includes(parsed.protocol) ||
  parsed.username ||
  parsed.password
)
  throw new Error('Use an HTTP(S) public base URL without credentials.');
const output = path.resolve('dist');
fs.mkdirSync(path.join(output, 'plugins'), { recursive: true });
const source = fs.readFileSync('plugins/english/eighteenMhEnglish.ts', 'utf8');
const result = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES5,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
  reportDiagnostics: true,
});
if (result.diagnostics?.length)
  throw new Error(
    ts.formatDiagnosticsWithColorAndContext(result.diagnostics, {
      getCanonicalFileName: value => value,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    }),
  );
const code = result.outputText;
fs.writeFileSync(path.join(output, 'plugins/eighteenMhEnglish.js'), code);
// Evaluate through the same CommonJS entry point used by LNReader, without fetching anything.
const plugin = Function(
  'require',
  'module',
  'const exports = module.exports = {};\n' + code + '\nreturn exports.default;',
)(() => ({}), {});
const manifest = [
  {
    id: plugin.id,
    name: plugin.name,
    site: plugin.site,
    lang: 'English',
    version: plugin.version,
    url: base + '/plugins/eighteenMhEnglish.js',
    iconUrl: base + '/icon.png',
    hasSettings: true,
  },
];
fs.copyFileSync('assets/icon.png', path.join(output, 'icon.png'));
fs.writeFileSync(
  path.join(output, 'plugins.json'),
  JSON.stringify(manifest, null, 2) + '\n',
);
fs.writeFileSync(
  path.join(output, 'plugins.min.json'),
  JSON.stringify(manifest),
);
fs.writeFileSync(
  path.join(output, 'index.html'),
  '<!doctype html><meta charset="utf-8"><title>Personal LNReader plugins</title><h1>Personal LNReader plugins</h1><p>Add this repository URL in LNReader:</p><p><a href="' +
    base +
    '/plugins.min.json">' +
    base +
    '/plugins.min.json</a></p>',
);
console.log(
  'Built plugin for LNReader 2.1.4. Repository: ' + base + '/plugins.min.json',
);
if (!configured)
  console.log(
    'Local preview only. Rebuild with --base-url=https://YOUR-HOST for installation on your phone.',
  );
