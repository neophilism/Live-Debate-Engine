import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('dist/ui', { recursive: true });
const output = await build({ entryPoints: ['packages/ui/src/main.tsx'], bundle: true, minify: true, sourcemap: false,
  target: ['es2022'], platform: 'browser', format: 'esm', outfile: 'dist/ui/app.js', metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' }, legalComments: 'eof', logLevel: 'warning' });
if (output.errors.length) throw new Error('UI build failed');
const imports = Object.values(output.metafile.outputs).flatMap((file) => file.imports);
if (imports.some((item) => item.external)) throw new Error('Browser bundle must not depend on external scripts');
await writeFile('dist/ui/build.json', `${JSON.stringify({ entries: Object.keys(output.metafile.outputs), externalImports: 0 })}\n`);
