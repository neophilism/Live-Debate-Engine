import { mkdir, copyFile } from 'node:fs/promises';
import { build } from 'esbuild';
await mkdir('dist/ui/assets', { recursive: true });
const result = await build({ entryPoints: ['packages/ui/src/app.tsx'], outfile: 'dist/ui/assets/ui.js', bundle: true, platform: 'browser', target: ['es2022'], minify: true, sourcemap: false, metafile: true, define: { 'process.env.NODE_ENV': '"production"' } });
if (Object.keys(result.metafile.inputs).some((path) => /packages\/(identity|database|security)\/|packages\/competition\/src\/(store|http)\./.test(path))) throw new Error('Server module entered browser bundle');
await copyFile('packages/ui/src/styles.css', 'dist/ui/assets/ui.css');
