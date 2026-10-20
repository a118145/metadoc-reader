// Bundles the extension host code and the webview script into dist/.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const configs = [
  {
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    target: 'node18',
    external: ['vscode'],
  },
  {
    entryPoints: ['src/webview/main.ts'],
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
  },
];

for (const config of configs) {
  const options = { bundle: true, sourcemap: watch, minify: !watch, logLevel: 'info', ...config };
  if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
  } else {
    await esbuild.build(options);
  }
}
