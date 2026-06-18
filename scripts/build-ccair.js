const esbuild = require('esbuild');
const path = require('path');

const files = ['tweaks-panel', 'ccair-data', 'ccair-components', 'ccair-pages', 'ccair-app'];
const ccairDir = path.join(__dirname, '..', 'static', 'care');

Promise.all(
  files.map((f) =>
    esbuild.build({
      entryPoints: [path.join(ccairDir, `${f}.jsx`)],
      outfile: path.join(ccairDir, 'dist', `${f}.js`),
      jsx: 'transform',
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
      target: 'es2020',
      minify: true,
      bundle: false,
      banner: { js: '(function(){' },
      footer: { js: '})();' },
    })
  )
)
  .then(() => console.log('CCAIR build complete: %d files transpiled', files.length))
  .catch((err) => {
    console.error('CCAIR build failed:', err);
    process.exit(1);
  });
