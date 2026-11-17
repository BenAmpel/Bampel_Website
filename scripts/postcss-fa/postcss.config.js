// Drops the Font Awesome icon rules the site never uses from css/vendor-bundle.css (the stock stylesheet names about 2,000
// icons; the pages use around twenty). Like postcss.config.js it only runs when WC_PURGE_CSS=true (layouts/partials/site_head.html),
// on the second Hugo pass of the build, reading the hugo_stats.json the first pass wrote.
//
// Lives in its own folder because Hugo looks for postcss.config.js in the folder it is given, and it is separate because postcss.config.js keeps every class that starts with "fa" for the theme's scripts, which would keep
// all of them. Here an icon class stays when it appears in the rendered HTML (hugo_stats.json) or anywhere in the site's own
// scripts, layouts or content (every word counts, so an icon a script builds into a string is kept). Structural classes
// (sizes, spin, stack, pull, the style prefixes) are always kept. After adding an icon, the next build keeps it; the CI step
// "Icon fonts cover every icon in use" still checks the glyph is in the subset fonts (scripts/subset_fontawesome.py).
const purgeModule = require('@fullhuman/postcss-purgecss');
const purgecss = purgeModule.default || purgeModule;

const hugoStats = (content) => { const e = JSON.parse(content).htmlElements; return e.tags.concat(e.classes, e.ids); };
const words = (content) => content.match(/[A-Za-z0-9_-]+/g) || [];

module.exports = {
  plugins: [
    purgecss({
      content: [
        './hugo_stats.json',
        './static/js/**/*.js',
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
      safelist: {
        standard: [
          'html', 'body',
          /^(fa|fas|far|fab|fa-classic|fa-solid|fa-regular|fa-brands|fa-fw|fa-xs|fa-sm|fa-lg|fa-xl|fa-2xs|fa-2xl|fa-[0-9]+x|fa-spin|fa-pulse|fa-spin-pulse|fa-spin-reverse|fa-beat|fa-beat-fade|fa-bounce|fa-fade|fa-flip|fa-shake|fa-stack|fa-stack-1x|fa-stack-2x|fa-inverse|fa-ul|fa-li|fa-border|fa-pull-left|fa-pull-right|fa-rotate-90|fa-rotate-180|fa-rotate-270|fa-rotate-by|fa-flip-horizontal|fa-flip-vertical|fa-flip-both|fa-sr-only|fa-sr-only-focusable|sr-only|sr-only-focusable)$/,
        ],
      },
      keyframes: false,
      fontFace: false,
      variables: false,
    }),
  ],
};
