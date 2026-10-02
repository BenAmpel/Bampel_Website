import * as core from '../../netlify/lib/vc-core.mjs';
import * as content from '../../netlify/lib/vc-content.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:0}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};

let now=Date.UTC(2026,9,5,15);
// non-GSU and look-alike domains refused
for (const e of ['someone@gmail.com','x@notgsu.edu','x@gsu.edu.evil.com','not-an-email']) assert.equal((await core.login(store,{email:e},now)).error,'not_enrolled', e);
// first sign-in asks for confirmation and creates nothing until confirmed
const first=await core.login(store,{email:' JDoe1@Student.GSU.edu '},now); assert.equal(first.error,'confirm_new'); assert.equal(first.email,'jdoe1@student.gsu.edu');
assert.equal((await core.listParticipants(store,now)).length,0);
const ok=await core.login(store,{email:'jdoe1@student.gsu.edu',confirm:true},now); assert(ok.token); assert.equal(ok.consented,false);
const pid=await core.verifyToken(store,ok.token,now);
// next week: email alone signs straight back in to the same record (case/space-insensitive)
const again=await core.login(store,{email:'JDOE1@student.gsu.edu'},now+7*86400000); assert.equal(await core.verifyToken(store,again.token,now+7*86400000),pid);
assert.equal((await core.listParticipants(store,now)).length,1);
console.log('email-only sign-in: domain check, confirm on first visit, same record every week');
// a full session works through the email-created record
await core.consent(store,pid,true,now);
const plan=await core.startSession(store,pid,now); assert.equal(plan.total,8);
await core.saveSurvey(store,pid,1,'pre',{role:'student'},now); await core.saveTrial(store,pid,1,'practice',{},now);
for (const t of plan.trials) await core.saveTrial(store,pid,1,t.index,{final:{judgment:'benign'},evidence:{opens:[]}},now);
await core.saveSurvey(store,pid,1,'post',{mental_effort:'3'},now);
// more students, balanced groups, roster still works
for (let i=2;i<=6;i++) await core.login(store,{email:`s${i}@gsu.edu`,confirm:true},now);
await core.addRoster(store,['guest@uga.edu'],{label:'guest'},now);
assert.equal((await core.login(store,{email:'guest@uga.edu'},now)).error,undefined,'roster email signs in without confirm');
const list=await core.listParticipants(store,now); assert.equal(list.length,7);
const by={}; list.filter(p=>p.label!=='guest').forEach(p=>by[p.condition]=(by[p.condition]||0)+1); assert.deepEqual(Object.values(by).sort(),[2,2,2]);
// extra-credit list has emails + completion; research exports never contain emails
const credit=(await core.exportCredit(store,now)).trim().split('\n');
assert.equal(credit[0],'email,sessions_completed,total_sessions,finished,last_session_completed,first_seen,label,test');
assert.equal(credit.length,8); const jd=credit.find(l=>l.startsWith('jdoe1@student.gsu.edu,')).split(','); assert.equal(jd[1],'1'); assert.equal(jd[2],'4');
assert(credit.some(l=>l.startsWith('guest@uga.edu,')));
const research=JSON.stringify(await core.exportAll(store))+await core.exportCsv(store)+await core.exportSurveyCsv(store);
assert(!/@gsu\.edu|@student\.gsu\.edu|@uga\.edu/.test(research),'email leaked into research export');
assert(!JSON.stringify([...m.entries()].filter(([k])=>!k.startsWith('contact/'))).includes('@student.gsu.edu'),'email stored outside contact/');
console.log('extra-credit CSV lists emails + completion; research exports have no emails');
// lookup and delete clean up the email too
const lk=await core.lookupEmails(store,['jdoe1@student.gsu.edu','nobody@gsu.edu'],now); assert.equal(lk[0].completedSessions,1); assert.equal(lk[1].enrolled,false);
await core.deleteParticipant(store,pid); assert.equal(await store.get('contact/'+pid),null);
assert(!(await core.exportCredit(store,now)).includes('jdoe1'),'deleted student still in credit list');
// sign-up off: existing students still sign in, new ones refused
const c=structuredClone(await content.getContent(store)); c.enrollment.open=false; await content.saveContent(store,c,'t',0,now);
assert.equal((await core.login(store,{email:'new@gsu.edu',confirm:true},now)).error,'not_enrolled');
assert((await core.login(store,{email:'s2@gsu.edu'},now)).token);
console.log('delete removes the email; sign-up off keeps existing students');
console.log('ALL EMAIL-LOGIN TESTS PASSED');
