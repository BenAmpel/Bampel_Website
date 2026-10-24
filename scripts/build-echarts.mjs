// Trimmed ECharts for the research dashboard (assets/js/research_dashboard.js): only the chart types and components it
// uses, instead of the full 1 MB build. Same version as the full file it replaces (package.json pins echarts exactly).
// Rerun after changing the dashboard's charts or the echarts version:  node scripts/build-echarts.mjs
// Output: static/vendor/echarts/<version>/echarts.custom.min.js (window.echarts, as the full UMD build provided).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const version = require('echarts/package.json').version;
const entry = `
import * as echarts from 'echarts/core';
import { BarChart, LineChart, GraphChart, RadarChart } from 'echarts/charts';
// AriaComponent turns each chart's aria.label option into the accessible description screen readers announce.
import { GridComponent, TooltipComponent, TitleComponent, RadarComponent, AriaComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([BarChart, LineChart, GraphChart, RadarChart, GridComponent, TooltipComponent, TitleComponent, RadarComponent, AriaComponent, CanvasRenderer]);
window.echarts = echarts;
`;
const out = path.join(root, 'static', 'vendor', 'echarts', version, 'echarts.custom.min.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
await build({
  stdin: { contents: entry, resolveDir: root, loader: 'js' },
  bundle: true, minify: true, format: 'iife', target: 'es2018', outfile: out, legalComments: 'none',
  banner: { js: `/*! ECharts ${version} (bar, line, graph, radar; grid, tooltip, title, radar, aria; canvas), Apache License 2.0, https://echarts.apache.org. Built by scripts/build-echarts.mjs. */` },
});
console.log(`echarts ${version}: ${fs.statSync(out).size} bytes -> ${path.relative(root, out)}`);
