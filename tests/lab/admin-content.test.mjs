import { core } from './compat.mjs';
import { content } from './compat.mjs';
import * as admin from '../../netlify/lib/lab/admin.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:0}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};

const OWNER='owner-key-0123456789abcdef'; let now=Date.UTC(2026,9,5,15);
// roles
const owner=await admin.authAdmin(store,OWNER,OWNER); assert.equal(owner.role,'owner');
assert.equal(await admin.authAdmin(store,'wrong-key-0123456789abcdef',OWNER),null);
const v=await admin.addMember(store,'Viewer V','viewer',owner); const e=await admin.addMember(store,'Editor E','editor',owner); const mg=await admin.addMember(store,'Manager M','manager',owner);
assert.equal((await admin.addMember(store,'X','owner',owner)).error,'bad_role');
const vw=await admin.authAdmin(store,v.key,OWNER); assert.equal(vw.role,'viewer');
assert(admin.can('viewer','viewer') && !admin.can('viewer','editor') && admin.can('manager','editor') && !admin.can('manager','owner'));
assert(!JSON.stringify([...m.values()]).includes(v.key),'raw key stored');
const members=await admin.listMembers(store); assert.equal(members.length,3);
await admin.removeMember(store,members.find(x=>x.name==='Viewer V').id,owner);
assert.equal(await admin.authAdmin(store,v.key,OWNER),null); console.log('roles + revoke ok');
// content defaults & validation
const c0=await content.getContent(store); assert.equal(c0.version,0); assert.deepEqual(content.validateContent(c0),[]);
const bad=structuredClone(c0); bad.survey.post[0].id='Bad Name'; bad.survey.pre.push({...bad.survey.pre[0]}); bad.alerts.pop(); bad.consent.paragraphs=[];
const errs=content.validateContent(bad); assert(errs.length>=4, errs.join('|')); console.log('validation catches', errs.length, 'problems');
// participants with defaults
const {created}=await core.createParticipants(store,3,{test:true,gapDays:0},now);
const real=(await core.createParticipants(store,1,{gapDays:0},now)).created[0].code;
const c=created[0].code; await core.consent(store,c,true,now);
const plan=await core.startSession(store,c,now); assert.equal(plan.contentVersion,0);
const t0id=m.get('plans/'+c+'/s1').trials[0].alertId; const origTruth=c0.alerts.find(a=>a.id===t0id).truth;
await core.saveTrial(store,c,1,0,{final:{judgment:origTruth},evidence:{opens:[]}},now);
// edit content: flip truth of that alert, edit text, add survey question
const next=structuredClone(c0); const ai=next.alerts.findIndex(a=>a.id===t0id);
next.alerts[ai].truth = origTruth==='malicious'?'benign':'malicious'; next.alerts[ai].title='Edited title';
next.survey.post.push({id:'open_note',text:'Anything else?',type:'text',required:false,showIf:'always'});
next.consent.approved=true;
assert.equal((await content.saveContent(store,next,'Editor E',5)).error,'conflict');
const s1=await content.saveContent(store,next,'Editor E',0,now); assert.equal(s1.version,1);
const plan2=await core.startSession(store,c,now); assert.equal(plan2.contentVersion,0); assert.notEqual(plan2.trials[0].alert.title,'Edited title');
await core.saveTrial(store,c,1,1,{final:{judgment:'benign'},evidence:{opens:[]}},now);
const csv=(await core.exportCsv(store)).trim().split('\n'); const h=csv[0].split(',');
const TI=h.indexOf('trial_index'); const row0=csv.slice(1).map(l=>l.split(',')).find(r=>r[0]===c&&r[TI]==='0');
assert.equal(row0[h.indexOf('truth')],origTruth,'snapshot keeps truth as scored'); assert.equal(row0[h.indexOf('correct')],'1'); assert.equal(row0[h.indexOf('content_version')],'0');
const row1=csv.slice(1).map(l=>l.split(',')).find(r=>r[0]===c&&r[TI]==='1'); assert.equal(row1[h.indexOf('content_version')],'0');
console.log('in-progress session keeps its snapshot; trials keep scored answer key');
// surveys csv
await core.saveSurvey(store,c,1,'pre',{role:'student',experience_years:'1–2'},now);
const scsv=await core.exportSurveyCsv(store); assert(scsv.split('\n')[0].includes('experience_years') && scsv.includes('student'));
// history + restore
const hist=await content.contentHistory(store); assert.equal(hist[0].version,1);
const rs=await content.restoreContent(store,0,'Owner',now); assert.equal(rs.version,2);
const c2=await content.getContent(store); assert.equal(c2.alerts[ai].title,c0.alerts[ai].title); assert.equal(c2.consent.approved,false); assert.equal(c2.restoredFrom,0);
console.log('history + restore ok');
// public content has no truth
assert(!/"truth"|aiRationale|"supports"/.test(JSON.stringify(content.publicContent(c2))));
// delete
const before=(await store.list(`data/${c}/`)).length; assert(before>=3);
const d=await core.deleteParticipant(store,c); assert.equal(d.records,before);
assert.equal((await store.list(`data/${c}/`)).length,0); assert.equal(await store.get(`participants/${c}`),null);
const dt=await core.deleteTestParticipants(store); assert.equal(dt.participants,2);
const left=await core.listParticipants(store); assert.deepEqual(left.map(x=>x.code),[real]); console.log('delete one + delete all test ok (real participant kept)');
await admin.audit(store,owner,'participant.delete','x',now); assert.equal((await admin.auditLog(store))[0].action,'participant.delete');
console.log('ALL ADMIN TESTS PASSED');
