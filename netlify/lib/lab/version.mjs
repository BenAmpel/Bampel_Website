// CCAIR Behavioral Lab: which version of the platform is running, for design files, codebooks, and the
// reproducibility bundle. The git commit (short form, 7 characters) comes from LAB_COMMIT when set, else from the
// Netlify build (build-info.mjs, written from COMMIT_REF by scripts/lab/build-info.mjs; Netlify functions cannot read
// COMMIT_REF at run time), else from the local checkout (npm run lab: .git, then `git rev-parse`), else "unknown".
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_COMMIT } from './build-info.mjs';

export const PLATFORM = 'CCAIR Behavioral Lab';
export const PLATFORM_VERSION = '2026.10';   // bump with notable platform changes; the commit says exactly which code ran

// A worktree's .git is a file ("gitdir: ..."); a normal checkout's is a folder. Packed refs are read too.
function localCommit() {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++, dir = dirname(dir)) {
      let git = join(dir, '.git'), text;
      try { text = readFileSync(git, 'utf8'); } catch (e) { if (e.code === 'EISDIR') text = null; else continue; }
      if (text != null) { const m = text.match(/^gitdir:\s*(.+)\s*$/m); if (!m) continue; git = resolve(dir, m[1]); }
      const head = readFileSync(join(git, 'HEAD'), 'utf8').trim();
      if (/^[0-9a-f]{40}$/.test(head)) return head;
      const ref = (head.match(/^ref:\s*(.+)$/) || [])[1];
      if (!ref) return null;
      const common = (() => { try { return resolve(git, readFileSync(join(git, 'commondir'), 'utf8').trim()); } catch { return git; } })();
      for (const base of [git, common]) { try { return readFileSync(join(base, ref), 'utf8').trim(); } catch {} }
      try { const line = readFileSync(join(common, 'packed-refs'), 'utf8').split('\n').find(l => l.endsWith(' ' + ref)); if (line) return line.slice(0, 40); } catch {}
      return null;
    }
  } catch {}
  return null;
}

function gitRevParse() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dirname(fileURLToPath(import.meta.url)), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim(); } catch { return null; }
}

export const shortCommit = c => (/^[0-9a-f]{7,40}$/i.test(String(c || '')) ? String(c).slice(0, 7).toLowerCase() : null);

let cached;
export function platformInfo(env = process.env, build = BUILD_COMMIT) {
  if (!cached) {
    const commit = [env.LAB_COMMIT, build, env.COMMIT_REF].map(shortCommit).find(Boolean) || shortCommit(localCommit()) || shortCommit(gitRevParse()) || 'unknown';
    cached = { name: PLATFORM, version: PLATFORM_VERSION, commit };
  }
  return cached;
}
export const _resetPlatformInfo = () => { cached = undefined; };   // tests
