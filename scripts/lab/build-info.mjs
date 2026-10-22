#!/usr/bin/env node
// Build step (netlify.toml's build command): records which commit is being built in netlify/lib/lab/build-info.mjs, so
// the lab's design files, codebooks and reproducibility bundles name the code that ran. Netlify sets COMMIT_REF during
// the build only; functions cannot read it later. Without COMMIT_REF (a build on this computer) the file is left alone
// and version.mjs reads the commit from the local checkout instead.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ref = String(process.env.COMMIT_REF || '').trim();
const out = fileURLToPath(new URL('../../netlify/lib/lab/build-info.mjs', import.meta.url));
if (!/^[0-9a-f]{7,40}$/i.test(ref)) {
  console.log(`lab build info: no COMMIT_REF${ref ? ' (not a commit hash)' : ''}, left ${out} as it is`);
} else {
  writeFileSync(out, `// Written by scripts/lab/build-info.mjs during the Netlify build. Not committed.\nexport const BUILD_COMMIT = '${ref.toLowerCase()}';\n`);
  console.log(`lab build info: commit ${ref.slice(0, 7)}`);
}
