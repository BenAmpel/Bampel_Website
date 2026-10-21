// CCAIR Behavioral Lab, economic games: every key a participant leaves behind (for withdrawals and test cleanup).
// The engine calls this from deleteParticipant. A participant's decisions inside their group are removed with them;
// other participants' round records keep the decisions of the people they played with, as values without any ID.
import { K, getOnce, bucketOf } from './shared.mjs';

export async function purgeGameKeys(S, p) {
  const pid = p.code, store = S.store, keys = new Set(await store.list(`g/p/${pid}/`));
  for (const k of [...keys]) {
    if (!/\/member\/\d+$/.test(k)) continue;
    const m = await store.get(k);
    if (!m) continue;
    // A real participant's decisions are removed from the group; a cohort of test participants (pilots, self-tests) goes entirely.
    const cohort = await store.get(K.cohort(m.cid)), whole = !!(cohort && cohort.test);
    if (whole) keys.add(K.cidx(m.cid));
    for (const ck of await store.list(`g/c/${m.cid}/`)) if (whole || ck.endsWith('/' + pid) || ck.includes('~' + pid)) keys.add(ck);
  }
  const role = await getOnce(store, K.role(pid));
  if (role) for (const test of [false, true]) { keys.add(K.pool(test, p.condition, role.role, pid)); keys.add(`g/arole/${p.condition}/${role.role}/${pid}`); }
  keys.add(K.apend(pid));
  // Heartbeats are removed by the matcher once they are old; here only the few buckets after the participant entered the waiting room.
  const lobby = await getOnce(store, K.lobby(pid));
  if (lobby) for (let bk = bucketOf(lobby.at); bk <= bucketOf(lobby.at) + 8; bk++) for (const k of await store.list(K.hbPrefix(bk))) if (k.endsWith('~' + pid)) keys.add(k);
  return [...keys];
}
