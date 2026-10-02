import { core } from './compat.mjs';
import assert from 'node:assert/strict';
import { memStore } from './memstore.mjs';
const store=memStore({latency:0}), m={get:k=>store.m.has(k)?store.m.get(k).v:undefined, entries:()=>[...store.m.entries()].map(([k,x])=>[k,x.v]), values:()=>[...store.m.values()].map(x=>x.v)};
import { content } from './compat.mjs';
const C0=content.normalize(structuredClone(content.DEFAULT_CONTENT));

let now=Date.UTC(2026,9,5,15);
const {created}=await core.createParticipants(store,6,{label:'pilot'},now);
const counts={}; created.forEach(c=>counts[c.condition]=(counts[c.condition]||0)+1);
assert.deepEqual(Object.values(counts).sort(),[2,2,2]); console.log('balanced',counts);
assert.equal((await core.login(store,{code:'vc-bad-code'})).error,'invalid_code');
for (const cond of ['ai_first','evidence_first','control']) {
  const c=created.find(x=>x.condition===cond).code; let t=now;
  const lg=await core.login(store,{code:c.toLowerCase().replace(/-/g,' ')},t); assert.equal(await core.verifyToken(store,lg.token,t),c); assert.equal(lg.consented,false);
  assert.equal((await core.startSession(store,c,t)).error,'no_consent');
  await core.consent(store,c,true,t);
  const seenAlerts=new Set();
  for (let s=1;s<=4;s++){
    const plan=await core.startSession(store,c,t);
    assert.equal(plan.session,s); assert.equal(plan.trials.length,8);
    const txt=JSON.stringify(plan); assert(!/"truth"|"supports"|misleading/.test(txt),'leak');
    const types=m.get('plans/'+c+'/s'+s).trials.map(x=>x.aiType);
    if(cond==='control'||s===4){assert.equal(plan.mode,'none'); assert(plan.trials.every(x=>x.ai===null));}
    else {assert.equal(plan.mode,cond); if(s===3) assert.equal(types.filter(x=>x!=='accurate').length,4);}
    // resume gives identical plan
    assert.deepEqual((await core.startSession(store,c,t)).trials.map(x=>x.alert.id),plan.trials.map(x=>x.alert.id));
    m.get('plans/'+c+'/s'+s).trials.forEach(x=>seenAlerts.add(x.alertId));
    assert.equal((await core.saveSurvey(store,c,s,'post',{},t)).error,'trials_incomplete');
    if(s===1){ await core.saveTrial(store,c,1,'practice',{x:1},t); await core.saveSurvey(store,c,1,'pre',{exp:2},t); }
    for (const tr of plan.trials) await core.saveTrial(store,c,s,tr.index,{initial:{judgment:'benign'},final:{judgment:'malicious',influential:['network']},evidence:{opens:[{panel:'network',atMs:100,dwellMs:900},{panel:'context',atMs:2000,dwellMs:400},{panel:'network',atMs:4000,dwellMs:300}]},aiShownAtMs:1500},t);
    const r=await core.saveSurvey(store,c,s,'post',{trust:5},t);
    if(s<4){ assert.equal(r.status.available,false); const tooSoon=await core.startSession(store,c,t+5*86400000); assert.equal(tooSoon.error,'not_yet'); t+=6*86400000+1000; }
    else assert.equal(r.status.finished,true);
  }
  assert.equal(seenAlerts.size,32); console.log(cond,'ok: 4 sessions, 32 unique alerts');
}
const list=await core.listParticipants(store,now+40*86400000); console.log(list.filter(x=>x.completedSessions===4).length,'finished participants');
const csv=await core.exportCsv(store); const lines=csv.trim().split('\n'); console.log('csv rows',lines.length-1); console.log(lines[0].split(',').length,'cols'); console.log(lines[1]);
