// Hourly backup of every study's store into its backup store (netlify/lib/lab/backup.mjs).
// Scheduled functions have a 30 s limit; the time is shared across studies and each run continues
// where the previous one stopped.
import { getStore } from '@netlify/blobs';
import { blobsStore } from '../lib/lab/store.mjs';
import { runBackup, REGISTRY_PREFIXES, REGISTRY_MUTABLE } from '../lib/lab/backup.mjs';
import { listStudies } from '../lib/lab/registry.mjs';

export default async () => {
  const registry = blobsStore(getStore, 'lab-registry');
  // Researcher accounts and the studies list go to their own backup store, first, so they are never starved by a large study.
  console.log('lab-backup registry', JSON.stringify(await runBackup(registry, blobsStore(getStore, 'lab-registry-backup'), { budgetMs: 3000, prefixes: REGISTRY_PREFIXES, mutable: REGISTRY_MUTABLE })));
  const studies = await listStudies(registry, { all: true });
  const budget = Math.max(2000, Math.floor(18000 / Math.max(1, studies.length)));
  for (const s of studies) {
    if (s.deletingAt) continue;   // being deleted permanently (registry.mjs, deleteStudy): copying it again would undo that
    const r = await runBackup(blobsStore(getStore, s.storeName), blobsStore(getStore, s.backupName), { budgetMs: budget });
    console.log('lab-backup', s.id, JSON.stringify(r));
  }
};

export const config = { schedule: '@hourly' };
