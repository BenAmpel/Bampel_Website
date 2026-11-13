// Local real-engine check of the CCAIR mobile menu scroll lock in Playwright WebKit at 375 px. NOT run in CI (no browser
// there); CI runs tests/ccair-menu-lock.test.mjs. WebKit on macOS is not iOS Safari: this confirms the page does not scroll
// and the scroll position is restored exactly, but the iOS-specific touch behaviour rests on the mechanism (see that test).
// Playwright is not a project dependency. Install it elsewhere and point at it:
//   (cd /some/dir && npm i playwright && npx playwright install webkit)
//   npm run build:ccair && node scripts/../tests/ccair-menu-scroll.webkit.mjs http://localhost:8124 /some/dir
// where the URL serves static/ (so /ccair/ resolves). Exits 1 on any failure.
import { createRequire } from 'node:module';
import path from 'node:path';
const base = process.argv[2] || 'http://localhost:8124';
const pwDir = path.resolve(process.argv[3] || process.cwd());
const { webkit } = createRequire(path.join(pwDir, 'x.js'))('playwright');
const APP = ['/ccair/', '/ccair/publications/', '/ccair/research/'];
const STUDENTS = ['/ccair/students/', '/ccair/students/skills/']; // static pages: no menu, structure only
const fails = [];
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) fails.push(msg); };
const b = await webkit.launch();
for (const route of APP) {
  // Wheel input is unsupported in mobile-emulated WebKit, so use a 375-wide desktop-input context.
  const p = await (await b.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await p.goto(base + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(600);
  const y = () => p.evaluate(() => scrollY);
  await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(150);
  check(await y() === 400, `${route} starts at 400`);
  await p.evaluate(() => document.querySelector('.menu-btn').click()); await p.waitForTimeout(400);
  check(await y() === 400, `${route} opening does not move the page (${await y()})`);
  for (const [x, yy] of [[187, 780], [187, 300]]) { await p.mouse.move(x, yy); await p.mouse.wheel(0, 500); await p.waitForTimeout(250); }
  check(await y() === 400, `${route} wheel behind the open menu does not scroll (${await y()})`);
  // Not tested: Tab. WebKit on macOS skips links when tabbing by default, so Tab leaves the sheet for the page's form fields.
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  check(await y() === 400, `${route} Escape restores exactly (${await y()})`);
  check(await p.evaluate(() => !document.querySelector('#ccair-menu') && document.activeElement.classList.contains('menu-btn')), `${route} Escape closes and focuses the toggle`);
  await p.evaluate(() => document.querySelector('.menu-btn').click()); await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('.menu-btn').click()); await p.waitForTimeout(300);
  check(await y() === 400, `${route} toggle close restores exactly (${await y()})`);
  check(await p.evaluate(() => scrollX === 0 && document.documentElement.scrollWidth <= innerWidth), `${route} no horizontal overflow at 375`);
  await p.close();
}
for (const route of [...APP, ...STUDENTS]) {
  for (const width of [375, 1280]) {
    const p = await (await b.newContext({ viewport: { width, height: 812 } })).newPage();
    await p.goto(base + route, { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
    const s = await p.evaluate(() => ({ h1: document.querySelectorAll('h1').length, main: !!document.querySelector('main#main-content, main#main'), skip: !!document.querySelector('a.skip, a.skip-link, a[href="#main"], a[href="#main-content"]'), over: document.documentElement.scrollWidth > innerWidth }));
    check(s.h1 === 1 && s.main && s.skip && !s.over, `${route} @${width}: ${JSON.stringify(s)}`);
    await p.close();
  }
}
// Desktop-width classic scrollbar: opening the menu below 1000 px must not shift the layout sideways.
{
  const p = await (await b.newContext({ viewport: { width: 900, height: 700 } })).newPage();
  await p.goto(base + '/ccair/publications/', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
  const w0 = await p.evaluate(() => document.querySelector('.nav-inner').getBoundingClientRect().width);
  await p.evaluate(() => document.querySelector('.menu-btn').click()); await p.waitForTimeout(300);
  const w1 = await p.evaluate(() => document.querySelector('.nav-inner').getBoundingClientRect().width);
  check(w0 === w1, `900 px: layout width ${w0} -> ${w1} when the menu opens`);
}
await b.close();
process.exit(fails.length ? 1 : 0);
