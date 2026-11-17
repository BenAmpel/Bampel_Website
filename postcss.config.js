// Drops CSS the site never uses from css/wowchemy.css (Bootstrap and theme rules for components this site does not render).
// Only runs when WC_PURGE_CSS=true (layouts/partials/site_head.html), on the second Hugo pass of the Netlify build: the first
// pass writes hugo_stats.json (every tag, class and id in the rendered HTML), this one reads it. See netlify.toml.
const purgeModule = require('@fullhuman/postcss-purgecss');
const purgecss = purgeModule.default || purgeModule;

// Classes in the rendered HTML come from hugo_stats.json; classes that scripts add later come from the scripts
// themselves (every word in them counts as used) and from the safelist below.
const hugoStats = (content) => { const e = JSON.parse(content).htmlElements; return e.tags.concat(e.classes, e.ids); };
const words = (content) => content.match(/[A-Za-z0-9_-]+/g) || [];

// Classes that scripts put on elements after the page loads (headroom, Leaflet, badges, shortcodes). Found by loading the
// pages in a browser and listing every class that is on an element but not in hugo_stats.json. Add to it when a script
// starts building a new class name.
const scriptClasses = require('./postcss-safelist.json');

module.exports = {
  plugins: [
    purgecss({
      content: [
        './hugo_stats.json',
        './static/js/**/*.js',
        // The site's own scripts only. The Wowchemy scripts copied into assets/js in October 2026 (wowchemy-*.js,
        // _vendor/) are left out so the purge keeps exactly what it kept when they lived in the theme module; the
        // safelist below still covers the classes they toggle. Stage 2 of the theme plan replaces those scripts.
        './assets/js/{body-end,css-swap,ga-init,head-enhancements,research_dashboard,wowchemy-search}.js',
        './assets/js/site/**/*.js',
        './assets/js/widgets/**/*.js',
        './layouts/**/*.html',
        './content/**/*.md',
      ],
      extractors: [
        { extractor: hugoStats, extensions: ['json'] },
        { extractor: words, extensions: ['js', 'html', 'md'] },
      ],
      // State classes the theme's scripts toggle at run time stay whole. Bootstrap's JavaScript is no longer loaded (theme
      // plan stage 2), so its modal, tooltip, popover, carousel, toast, spinner and offcanvas classes are no longer kept.
      // Prefix patterns below keep library and widget classes that scripts create at run time (Leaflet, Headroom, Font Awesome,
      // KaTeX, ...). These prefixes were removed on 2026-11-17 because every rule they alone kept (638 selectors, 28 KB raw)
      // styled a class found nowhere in the repo, built output or any script: dropdown, nav, typed, article-, pub-, section,
      // terminal, home-, talks-, awards-, impact-, hb-, wg- (Bootstrap menus and Wowchemy hero/about widgets this site does not
      // render). A second pass on 2026-11-17 removed navbar, bio- and the is-/has-/js- state patterns the same way: 262 selectors,
      // 14.8 KB raw, 2.0 KB gzip, all for classes found nowhere (navbar-expand-*, bio-* rules scoped under .wg-about/.hb-about,
      // .form-control.is-valid). A class a script or template starts using is still found by the content scan above; one built only by string
      // concatenation needs its prefix added back here.
      safelist: {
        standard: ['html', 'body', ...scriptClasses, /^(show|showing|collapse|collapsing|collapsed|fade|in|active|open|dark|light|disabled)$/],
        greedy: [
          /^(search|sticky|searching|hljs|chroma|fa|fas|far|fab|ai|academicons|leaflet|marker|echarts|tsparticles|particles|altmetric|__dimensions|mfp|reveal|view-transition|katex|mjx|MathJax|highlight|copy|visitor|headroom|header--|invited|media-|cae-|pll-|tdrift|service-|footprint)/,
        ],
        deep: [/^(dropdown|navbar|search|show|dark)$/],
      },
      keyframes: false,
      fontFace: false,
      variables: false,
    }),
  ],
};
