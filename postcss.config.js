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
      // The theme's own scripts (search, navbar, theme toggle, Bootstrap collapse/dropdown/modal) are not in this repo, so
      // the state and component classes they toggle stay whole.
      safelist: {
        standard: ['html', 'body', ...scriptClasses, /^(show|showing|collapse|collapsing|collapsed|fade|in|active|open|dark|light|disabled|is-[a-z-]+|has-[a-z-]+|js-[a-z-]+)$/],
        greedy: [
          /^(modal|dropdown|navbar|nav|tooltip|popover|carousel|search|toast|spinner|offcanvas|sticky|searching|hljs|chroma|fa|fas|far|fab|ai|academicons|leaflet|marker|echarts|typed|tsparticles|particles|bmc|altmetric|__dimensions|mfp|reveal|view-transition|katex|mjx|MathJax|highlight|copy|article-|pub-|bio-|hb-|wg-|home-|section|terminal|visitor|headroom|header--|talks-|invited|media-|cae-|pll-|tdrift|pub-|service-|awards-|footprint|impact-)/,
        ],
        deep: [/^(modal|dropdown|navbar|search|show|dark)$/],
      },
      keyframes: false,
      fontFace: false,
      variables: false,
    }),
  ],
};
