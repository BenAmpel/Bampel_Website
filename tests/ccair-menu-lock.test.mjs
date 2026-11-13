// CCAIR mobile nav menu: while the sheet is open the page behind it must not scroll, and closing it must not move the page.
// Real iOS Safari is not available in CI, so this runs the built app in jsdom and checks the mechanism:
//  - the lock is the .menu-open class on <html> (CSS: overflow hidden on html and body), not an inline body style;
//  - a touchmove outside the sheet is cancelled (iOS Safari before 16 ignores overflow: hidden on body);
//  - the sheet has overscroll-behavior: contain;
//  - every programmatic focus() in the menu passes preventScroll (a plain focus() scrolled the page, because the nav
//    sits inside the scroll-padding-top band), and Escape still closes the menu and returns focus to the toggle.
// Run after `npm run build:ccair`: node --test tests/ccair-menu-lock.test.mjs
// Local real-engine check (WebKit, 375 px, wheel + scroll position): tests/ccair-menu-scroll.webkit.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const root = new URL('../static/ccair/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), 'utf8');
const CSS = read('assets/ccair.css');
const SCRIPTS = ['vendor/react-18.3.1.production.min.js', 'vendor/react-dom-18.3.1.production.min.js', 'dist/ccair.js'].map(read);

const tick = (ms = 60) => new Promise((r) => setTimeout(r, ms));

async function boot(route) {
  const html = read(route + 'index.html').replace(/<script[^>]*src=[^>]*><\/script>/g, '');
  const dom = new JSDOM(html, { url: 'http://localhost/ccair/' + route, runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  w.fetch = () => new Promise(() => {});
  w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  w.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.ResizeObserver = w.IntersectionObserver;
  w.scrollTo = () => {};
  for (const code of SCRIPTS) w.eval(code);
  w.eval("ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CCAIRApp))");
  await tick(300);
  return w;
}

for (const route of ['', 'publications/', 'research/']) {
  test(`menu lock on /ccair/${route}`, async () => {
    const w = await boot(route);
    const d = w.document;
    // Page structure the menu change must not disturb.
    assert.equal(d.querySelectorAll('h1').length, 1, 'exactly one h1');
    assert.ok(d.querySelector('main#main-content'), 'main#main-content');
    assert.ok(d.querySelector('a.skip'), 'skip link');

    const focusArgs = [];
    const realFocus = w.HTMLElement.prototype.focus;
    w.HTMLElement.prototype.focus = function (opts) { focusArgs.push(opts); return realFocus.call(this, opts); };

    const btn = d.querySelector('.menu-btn');
    btn.click(); await tick();
    assert.ok(d.querySelector('#ccair-menu'), 'sheet opens');
    assert.ok(d.documentElement.classList.contains('menu-open'), 'html.menu-open while open');
    assert.equal(d.body.style.overflow, '', 'no inline body style');
    assert.equal(d.body.getAttribute('style'), null, 'body has no style attribute');
    assert.ok(focusArgs.length > 0 && focusArgs.every((o) => o && o.preventScroll === true), 'focus moves into the sheet without scrolling');

    // A drag on the scrim or the bar is cancelled; on a sheet that does not overflow it is cancelled too.
    const scrim = d.querySelector('.sheet-scrim');
    const ev = new w.Event('touchmove', { bubbles: true, cancelable: true });
    scrim.dispatchEvent(ev);
    assert.equal(ev.defaultPrevented, true, 'touchmove on the scrim is cancelled');
    const sheet = d.querySelector('#ccair-menu');
    const ev2 = new w.Event('touchmove', { bubbles: true, cancelable: true });
    sheet.querySelector('a').dispatchEvent(ev2);
    assert.equal(ev2.defaultPrevented, true, 'touchmove on a sheet that fits is cancelled');
    // A sheet taller than its box (short phone, landscape) still scrolls itself.
    Object.defineProperty(sheet, 'scrollHeight', { value: 900, configurable: true });
    Object.defineProperty(sheet, 'clientHeight', { value: 400, configurable: true });
    const ev3 = new w.Event('touchmove', { bubbles: true, cancelable: true });
    sheet.querySelector('a').dispatchEvent(ev3);
    assert.equal(ev3.defaultPrevented, false, 'touchmove inside an overflowing sheet is left alone');

    // Escape closes it, releases the lock and returns focus to the toggle, without scrolling.
    focusArgs.length = 0;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await tick();
    assert.equal(d.querySelector('#ccair-menu'), null, 'Escape closes the sheet');
    assert.equal(d.documentElement.classList.contains('menu-open'), false, 'lock released');
    assert.equal(d.activeElement, btn, 'focus returns to the toggle');
    assert.ok(focusArgs.length > 0 && focusArgs.every((o) => o && o.preventScroll === true), 'focus return does not scroll');

    // Closing with the toggle releases the lock too.
    btn.click(); await tick();
    assert.ok(d.documentElement.classList.contains('menu-open'));
    btn.click(); await tick();
    assert.equal(d.documentElement.classList.contains('menu-open'), false);
    w.close();
  });
}

test('CSS: html and body overflow hidden while open, sheet contains overscroll', () => {
  assert.match(CSS, /html\.menu-open,\s*html\.menu-open body\s*\{\s*overflow:\s*hidden;?\s*\}/);
  const sheet = CSS.match(/^\.sheet \{[^}]*\}/m);
  assert.ok(sheet && /overscroll-behavior:\s*contain/.test(sheet[0]), '.sheet has overscroll-behavior: contain');
});
