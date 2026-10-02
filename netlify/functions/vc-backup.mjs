// Hourly backup of the verification study store into the "verification-backup" store.
// See netlify/lib/vc-backup.mjs. Scheduled functions have a 30 s limit; each run stops at 20 s and the
// next run continues where it left off.
import { getStore } from '@netlify/blobs';
import { runBackup } from '../lib/vc-backup.mjs';

const adapt = name => {
  const s = getStore({ name, consistency: 'strong' });
  return {
    get: key => s.get(key, { type: 'json' }),
    set: (key, value) => s.setJSON(key, value),
    delete: key => s.delete(key),
    list: async prefix => { const keys = []; for await (const page of s.list({ prefix, paginate: true })) for (const b of page.blobs) keys.push(b.key); return keys; }
  };
};

export default async () => {
  const r = await runBackup(adapt('verification-study'), adapt('verification-backup'), { budgetMs: 20000 });
  console.log('vc-backup', JSON.stringify(r));
};

export const config = { schedule: '@hourly' };
