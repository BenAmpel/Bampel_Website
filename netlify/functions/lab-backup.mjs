// Hourly backup of every study's store into its backup store (netlify/lib/lab/backup.mjs).
// Scheduled functions have a 30 s limit; the time is shared across studies and each run continues
// where the previous one stopped.
import { getStore } from '@netlify/blobs';
import { blobsStore } from '../lib/lab/store.mjs';
import { runBackup } from '../lib/lab/backup.mjs';
import { listStudies } from '../lib/lab/registry.mjs';

export default async () => {
  const studies = await listStudies(blobsStore(getStore, 'lab-registry'), { all: true });
  const budget = Math.max(2000, Math.floor(22000 / Math.max(1, studies.length)));
  for (const s of studies) {
    const r = await runBackup(blobsStore(getStore, s.storeName), blobsStore(getStore, s.backupName), { budgetMs: budget });
    console.log('lab-backup', s.id, JSON.stringify(r));
  }
};

export const config = { schedule: '@hourly' };
