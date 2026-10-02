// Verification study: backups.
// An hourly scheduled function mirrors the study store into a separate Blobs store
// ("verification-backup", keys "m/{original key}"). Answers are write-once, so each run copies only
// keys the mirror doesn't have yet; small records that can change (participants, content, team) are
// re-copied every run. Each run stops after a time budget and the next run continues.
// Deleting a participant (e.g., a withdrawal) also removes them from the mirror.
// The admin page's "Download complete backup" gives an off-Netlify copy to keep in GSU storage.

// Keys whose value can change after they are first written; everything else is write-once.
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
  if (done) state.lastCompleteAt = now;
  const prev = (await backup.get(STATE)) || {};
  await backup.set(STATE, { ...prev, ...state, lastCompleteAt: state.lastCompleteAt || prev.lastCompleteAt || null });
  return state;
}

export async function backupStatus(backup) {
  return (await backup.get(STATE)) || { lastRunAt: null, lastCompleteAt: null };
}

// Removes a participant from the mirror (withdrawal or test cleanup must not leave copies behind).
export async function purgeParticipant(backup, code, condition) {
  const prefixes = ['data/', 'raw/', 'plans/', 'started/', 'done/', 'views/'].map(p => `m/${p}${code}/`);
  const keys = (await Promise.all(prefixes.map(p => backup.list(p)))).flat()
    .concat([`m/participants/${code}`, `m/contact/${code}`, `m/consent/${code}`, `m/cond/${condition}/${code}`, `m/cond-test/${condition}/${code}`]);
  for (let i = 0; i < keys.length; i += 40) await Promise.all(keys.slice(i, i + 40).map(k => backup.delete(k)));
  return keys.length;
}
