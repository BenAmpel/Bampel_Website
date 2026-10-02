// CARE Behavioral Lab: backups, for every study.
// An hourly scheduled function mirrors each study's store into its backup store (keys "m/{original key}").
// Answers are write-once, so each run copies only keys the mirror doesn't have yet; records that can
// change (participants, content, team, meta) are re-copied every run. Each run stops after a time
// budget and the next run continues. Deleting a participant also removes them from the mirror.
// The admin page's "Download complete backup" gives an off-Netlify copy for GSU-approved storage.
import { deleteKeys } from './store.mjs';

const MUTABLE = [/^participants\//, /^content\/current$/, /^meta\//, /^admins\//];
const PREFIXES = ['participants/', 'consent/', 'plans/', 'started/', 'done/', 'views/', 'data/', 'raw/', 'contact/', 'cond/', 'cond-test/', 'content/', 'admins/', 'audit/', 'meta/'];
const STATE = 'state/backup';

export async function runBackup(main, backup, { budgetMs = 20000, now = Date.now() } = {}) {
  const t0 = Date.now();
  const mainKeys = (await Promise.all(PREFIXES.map(p => main.list(p)))).flat();
  const have = new Set((await backup.list('m/')).map(k => k.slice(2)));
  const todo = mainKeys.filter(k => !have.has(k) || MUTABLE.some(re => re.test(k)));
  let copied = 0, done = true;
  for (let i = 0; i < todo.length; i += 25) {
    if (Date.now() - t0 > budgetMs) { done = false; break; }
    const batch = todo.slice(i, i + 25);
    const vals = await Promise.all(batch.map(k => main.get(k)));
    await Promise.all(batch.map((k, j) => vals[j] != null ? backup.set('m/' + k, vals[j]) : null));
    copied += batch.length;
  }
  const state = { lastRunAt: now, complete: done, copied, pending: todo.length - copied, keysInStudy: mainKeys.length, keysInMirror: (await backup.list('m/')).length, ms: Date.now() - t0 };
  const prev = (await backup.get(STATE)) || {};
  await backup.set(STATE, { ...prev, ...state, lastCompleteAt: done ? now : prev.lastCompleteAt || null });
  return state;
}

export async function backupStatus(backup) {
  return (await backup.get(STATE)) || { lastRunAt: null, lastCompleteAt: null };
}

// Removes a participant from the mirror (a withdrawal or test cleanup must not leave copies behind).
export async function purgeParticipant(backup, code, condition) {
  const keys = (await Promise.all(['data', 'raw', 'plans', 'started', 'done', 'views'].map(p => backup.list(`m/${p}/${code}/`)))).flat()
    .concat([`m/participants/${code}`, `m/contact/${code}`, `m/consent/${code}`, `m/cond/${condition}/${code}`, `m/cond-test/${condition}/${code}`]);
  await deleteKeys(backup, keys);
  return keys.length;
}
