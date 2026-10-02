import * as core from '../../netlify/lib/vc-core.mjs';
import * as content from '../../netlify/lib/vc-content.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:0}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};

const now=Date.UTC(2026,9,5,15);
const planOf=(code,n)=>m.get('plans/'+code+'/s'+n); const idOf=(code,n,t)=>planOf(code,n).trials[t.index].alertId;
const c=content.normalize(structuredClone(content.DEFAULT_CONTENT));
// new alert with custom panels
c.alerts.push({ id:'alert-x1', family:'mfa', title:'MFA fatigue', severity:'High', truth:'malicious', summary:'Many MFA prompts.',
  panels:[{key:'logs',label:'Auth logs',text:'40 prompts in 5 min',supports:'malicious'},{key:'email',label:'Email',text:'User reported nothing',supports:'benign'}],
  misleadingPanels:['email'], aiRationale:{correct:'Prompt bombing pattern.',incorrect:'User did not report it.'} });
// remove an alert not used anywhere after we drop session 3/4
c.design.sessions = [
  { alerts:['alert-x1','travel-0','exfil-1'], ai:['accurate','incorrect','manipulated'] },
  { alerts:['phish-2','alert-x1'], ai:null }
];
c.survey.pre[0].sessions=[1,2];
c.text.done_title='All done for today';
// validation errors first
const bad=structuredClone(c); bad.design.sessions[0].ai=['accurate']; bad.design.sessions[1].alerts.push('nope');
const be=content.validateContent(bad); assert(be.some(x=>/must add up/.test(x)) && be.some(x=>/no longer exist/.test(x)), be.join('|'));
const bad2=structuredClone(c); bad2.text.q_final=''; assert(content.validateContent(bad2).some(x=>/Screen text/.test(x)));
const bad3=structuredClone(c); bad3.alerts.at(-1).panels.push({key:'logs',label:'dup',text:'x',supports:'neutral'}); assert(content.validateContent(bad3).some(x=>/used twice/.test(x)));
console.log('validation: count mismatch, missing alert, empty text, duplicate panel key caught');
const sv=await content.saveContent(store,c,'Editor',0,now); assert.equal(sv.version,1, JSON.stringify(sv));
const pub=content.publicContent(await content.getContent(store)); assert.equal(pub.sessions,2); assert.equal(pub.text.done_title,'All done for today');
// participants in every condition
const {created}=await core.createParticipants(store,3,{gapDays:0,test:true},now);
const byCond=Object.fromEntries(created.map(x=>[x.condition,x.code]));
const firstPlans={};
for (const [cond,code] of Object.entries(byCond)) {
  await core.consent(store,code,true,now);
  const p1=await core.startSession(store,code,now); firstPlans[code]=p1;
  assert.equal(p1.total,3); assert.equal(p1.preSurveyDone,false); assert.equal(p1.practiceDone,false);
  assert.equal(p1.mode, cond==='control'?'none':cond);
  if (cond!=='control') { const types=planOf(code,1).trials.map(t=>t.aiType).sort(); assert.deepEqual(types,['accurate','incorrect','manipulated']);
    const man=p1.trials.find(t=>planOf(code,1).trials[t.index].aiType==='manipulated'); assert(man.ai.rationale.endsWith(c.text.ai_manipulated_suffix)); }
  const x1=p1.trials.find(t=>idOf(code,1,t)==='alert-x1'); assert.deepEqual(x1.alert.panels.map(q=>q.key).sort(),['email','logs']);
  // counterbalancing: one rotation per participant, applied to every alert; one answer order per participant
  const rot=a=>{ const base=c.alerts.find(x=>x.title===a.title&&x.summary===a.summary).panels.map(q=>q.key); const got=a.panels.map(q=>q.key); return base.indexOf(got[0]); };
  const four=p1.trials.filter(t=>t.alert.panels.length===4).map(t=>rot(t.alert)); assert.equal(new Set(four).size,1,'same panel rotation within participant');
  assert(['malicious>benign','benign>malicious'].includes(p1.answerOrder.join('>')));
}
// mid-session edit: drop alert-x1 from session 1 and rename it; sessions in progress must not change
{
  const c2=structuredClone(await content.getContent(store)); c2.design.sessions[0]={alerts:['travel-0','exfil-1'],ai:['accurate','accurate']}; c2.alerts.find(a=>a.id==='alert-x1').title='Renamed';
  assert.equal((await content.saveContent(store,c2,'Editor',1,now)).version,2);
  for (const code of Object.values(byCond)) { const again=await core.startSession(store,code,now); assert.equal(again.total,3); assert.equal(again.trials.find(t=>idOf(code,1,t)==='alert-x1').alert.title,'MFA fatigue'); }
  const late=(await core.createParticipants(store,1,{gapDays:0,test:true},now)).created[0].code; await core.consent(store,late,true,now);
  assert.equal((await core.startSession(store,late,now)).total,2); await core.deleteParticipant(store,late);
  console.log('mid-session edit leaves sessions in progress alone; new sessions get the edit');
}
for (const [cond,code] of Object.entries(byCond)) {
  const p1=firstPlans[code];
  await core.saveSurvey(store,code,1,'pre',{experience_years:'None'},now);
  await core.saveTrial(store,code,1,'practice',{},now);
  for (const t of p1.trials) await core.saveTrial(store,code,1,t.index,{final:{judgment:'malicious'},evidence:{opens:[{panel:t.alert.panels[0].key,atMs:5,dwellMs:100}]}},now);
  const r1=await core.saveSurvey(store,code,1,'post',{},now); assert.equal(r1.status.nextSession,2);
  const p2=await core.startSession(store,code,now);
  assert.equal(p2.mode,'none'); assert.equal(p2.aiRemoved, cond!=='control'); assert.equal(p2.preSurveyDone,false,'pre item set for session 2'); assert.equal(p2.practice,null);
  const post=content.itemsFor((await content.getContent(store)).survey.post,'post',{session:2,mode:p2.mode,aiRemoved:p2.aiRemoved}).map(i=>i.id);
  assert.equal(post.includes('no_ai_difficulty'), cond!=='control'); assert(!post.includes('trust_1'));
  await core.saveSurvey(store,code,2,'pre',{experience_years:'None'},now);
  for (const t of p2.trials) await core.saveTrial(store,code,2,t.index,{final:{judgment:'benign'},evidence:{opens:[]}},now);
  const r2=await core.saveSurvey(store,code,2,'post',{},now); assert.equal(r2.status.finished,true);
}
console.log('2-session custom design runs end to end in all three conditions');
const csv=(await core.exportCsv(store)).trim().split('\n'); const h=csv[0].split(',');
assert(h.includes('dwell_logs_ms') && h.includes('dwell_email_ms') && h.includes('dwell_network_ms'), h.join());
const x1row=csv.slice(1).map(l=>l.split(',')).find(r=>r[h.indexOf('alert_id')]==='alert-x1'&&r[h.indexOf('session')]==='1');
const first=x1row[h.indexOf('first_panel')]; assert.equal(x1row[h.indexOf('evidence_breadth')],'0.50'); assert.equal(x1row[h.indexOf('dwell_'+first+'_ms')],'100'); assert.equal(x1row[h.indexOf('first_panel_position')],'1'); assert.equal(x1row[h.indexOf('family')],'mfa');
console.log('CSV adds columns for custom evidence panels; breadth uses each alert\'s panel count');
const list=(await core.listParticipants(store,now)).filter(p=>p.completedSessions>0); assert(list.length===3 && list.every(p=>p.totalSessions===2 && p.completedSessions===2));
const ex=await core.exportAll(store); assert(!JSON.stringify(ex.participants).includes('"truth"'),'plans leak into participant export'); assert(Object.values(firstPlans).every(p=>p.trials.every(t=>!('id' in t.alert))),'alert id sent to browser');
// across many participants, all four rotations and both answer orders occur
const rots=new Set(), ans=new Set();
for (let i=0;i<24;i++){ const q=(await core.createParticipants(store,1,{gapDays:0,test:true},now)).created[0].code; await core.consent(store,q,true,now); const pl=await core.startSession(store,q,now);
  const t=pl.trials.find(t=>t.alert.panels.length===4); const base=(await content.getContent(store)).alerts.find(x=>x.title===t.alert.title&&x.summary===t.alert.summary).panels.map(k=>k.key); rots.add(base.indexOf(t.alert.panels[0].key)); ans.add(pl.answerOrder[0]); }
assert.equal(rots.size,4,'all panel rotations used'); assert.equal(ans.size,2,'both answer orders used');
console.log('counterbalancing: fixed within participant, all rotations and both answer orders across participants');
console.log('ALL FLEX TESTS PASSED');
