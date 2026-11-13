// Dates for the CCAIR app pages in the sitemap (used by scripts/build-ccair.js).
// A page's date never comes from the clock: building the same commit twice must give the same dates. It is the
// committed date while the page's hash still matches, and otherwise the date of the last commit to the page's inputs.
// A shallow clone cannot answer "last commit to these files" (git reports the clone's tip for every path), so there
// the committed date is kept, and a page with none gets the date of the checked-out commit.
const { execFileSync } = require('child_process');

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

function makeGit(root) {
  let shallow;
  const isShallow = () => {
    if (shallow === undefined) {
      try { shallow = git(root, ['rev-parse', '--is-shallow-repository']) !== 'false'; } catch { shallow = true; }
    }
    return shallow;
  };
  const date = (args) => { try { const d = git(root, ['log', '-1', '--format=%cs', ...args]); return DATE.test(d) ? d : null; } catch { return null; } };
  return {
    isShallow,
    // Date of the last commit that touched any of these paths; null when history is missing or shallow.
    inputsDate: (paths) => (isShallow() ? null : date(['--', ...paths])),
    // Date of the checked-out commit, the one date a shallow clone can vouch for.
    headDate: () => date(['HEAD']),
  };
}

// prev: the committed { hash, lastmod } or undefined. g: { inputsDate(paths), headDate() }.
function resolveLastmod(prev, digest, paths, g) {
  if (prev && prev.hash === digest && DATE.test(prev.lastmod)) return prev.lastmod;
  const fromGit = g.inputsDate(paths);
  if (fromGit) return fromGit;
  if (prev && DATE.test(prev.lastmod)) return prev.lastmod;
  return g.headDate() || null;
}

module.exports = { makeGit, resolveLastmod };
