// CCAIR Behavioral Lab: quotas, an N cap for the whole study and for each condition.
//   enrollment.quota: { total: number|null, perCondition: { [condition]: number } }
// Counted from the write-once assignment markers (cond/{condition}/{id}), so a count is one list per condition and
// test participants (cond-test/) never count. Only participants who sign themselves up (email domain or online
// panel) are capped; people the team adds on the Students tab or as pilot codes are always let in. Someone who
// arrives when the study, or every condition still open to them, is full gets a record marked screened out
// (reason "quota_full") with no condition, sees the "study is full" page, and gets the panel's screened-out code.

export function quotaDefaults() { return { total: null, perCondition: {} }; }

const capOk = v => v == null || (Number.isInteger(v) && v >= 0 && v <= 1e6);
export function validateQuota(q, conditions, e) {
  if (q == null) return;
  if (typeof q !== 'object') { e.push('Quotas are not valid.'); return; }
  if (!capOk(q.total)) e.push('Quota: the cap for the whole study must be a whole number (or empty for no cap).');
  const per = q.perCondition || {};
  if (typeof per !== 'object' || Array.isArray(per)) { e.push('Quota: the caps per condition are not valid.'); return; }
  for (const [k, v] of Object.entries(per)) {
    if (!conditions.includes(k)) e.push(`Quota: "${k}" is not a condition of this study.`);
    else if (!capOk(v)) e.push(`Quota: the cap for "${k}" must be a whole number (or empty for no cap).`);
  }
}

// How full the study is (real participants only): counts per condition, the total, and the conditions still open.
export async function quotaState(S, c, conds) {
  const q = (c.enrollment && c.enrollment.quota) || {}, per = q.perCondition || {};
  const counts = Object.fromEntries(await Promise.all(conds.map(async cn => [cn, (await S.store.list(`cond/${cn}/`)).length])));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const studyFull = Number.isInteger(q.total) && total >= q.total;
  const open = studyFull ? [] : conds.filter(cn => !(Number.isInteger(per[cn]) && counts[cn] >= per[cn]));
  return { counts, total, cap: Number.isInteger(q.total) ? q.total : null, perCondition: per, open, full: !open.length };
}
