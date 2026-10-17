"""Pathway Finder design check.
Respondent model is set independently of the scoring: an expert role-similarity matrix S (job-content
overlap), perturbed at random each replicate so results don't hinge on one guess. A simulated student with
true role t finds an item of role r appealing in proportion to S[t,r], plus person-level response style
(acquiescence), item noise and beginner uncertainty."""
import numpy as np, itertools, collections
R=['SOC','IR','FOR','INT','PEN','APP','CLD','GRC','AUD','PRV','AWR','NET','OT','AIS']
k={r:i for i,r in enumerate(R)}; n=len(R)
S0=np.full((n,n),0.12); np.fill_diagonal(S0,1)
for a,b,v in [('SOC','IR',.7),('SOC','NET',.5),('SOC','FOR',.4),('SOC','INT',.5),('IR','FOR',.6),('IR','INT',.45),
 ('FOR','INT',.4),('PEN','APP',.5),('PEN','AIS',.5),('PEN','CLD',.3),('PEN','NET',.3),('APP','CLD',.5),('APP','AIS',.5),
 ('CLD','NET',.6),('GRC','AUD',.75),('GRC','PRV',.6),('AUD','PRV',.5),('GRC','AWR',.4),('AWR','PRV',.25),('OT','NET',.5),
 ('OT','CLD',.25),('INT','AIS',.2),('IR','NET',.35),('AUD','SOC',.2),('AWR','SOC',.15)]:
    S0[k[a],k[b]]=S0[k[b],k[a]]=v
PAIRS9=[('SOC','IR'),('GRC','AUD'),('PEN','APP'),('PEN','AIS'),('FOR','INT'),('PRV','GRC'),('CLD','NET'),('AWR','GRC'),('OT','NET')]
PAIRS14=PAIRS9[:7]+[('AWR','PRV'),('OT','NET'),('SOC','FOR'),('IR','INT'),('APP','CLD'),('AIS','OT'),('AUD','AWR')]
CODE={'APP':1,'CLD':.75,'AIS':.75,'PEN':.5}
BG={'CS':['APP','AIS','CLD'],'IT':['NET','SOC','CLD'],'BUS':['GRC','AUD','PRV'],'CJ':['FOR','INT','PRV'],'PSY':['AWR','INT'],'ENG':['OT','NET'],'UND':[]}
rng=np.random.default_rng(7)

def simulate(design, N=300, noise=1.0, acq_sd=0.5, S_jitter=0.12, mode='true', reps=3):
    items, pairs, pairw, zscore = design['items'], design['pairs'], design['pairw'], design['z']
    cnt=collections.Counter(x for p in pairs for x in p)
    t1=t3=stab=0; tot=0; tops=collections.Counter(); per=collections.Counter(); perN=collections.Counter()
    for rep in range(reps):
        S=np.clip(S0+rng.normal(0,S_jitter,(n,n)),0,1); S=(S+S.T)/2; np.fill_diagonal(S,1)
        for t in range(n):
            for _ in range(N):
                def respond():
                    acq=rng.normal(0,acq_sd)
                    if mode=='random': A=rng.integers(0,3,(n,items))
                    else:
                        lat=3*S[t][:,None]+acq+rng.normal(0,noise,(n,items))
                        A=np.where(lat>2.2,2,np.where(lat>1.3,1,0))
                    sc=A.sum(1).astype(float)
                    if zscore: sc=(sc-sc.mean())/(sc.std()+0.5)*2   # within-person standardising
                    for a,b in pairs:
                        if mode=='random': c=rng.integers(0,3)
                        else:
                            ua,ub=3*S[t,k[a]]+rng.normal(0,noise),3*S[t,k[b]]+rng.normal(0,noise)
                            c=2 if max(ua,ub)<1.2 else (0 if ua>ub else 1)
                        w=pairw/ (cnt[a] if design.get('norm') else 1), pairw/(cnt[b] if design.get('norm') else 1)
                        if c==0: sc[k[a]]+=w[0]
                        elif c==1: sc[k[b]]+=w[1]
                    # context: coding + background (50% informative)
                    if mode=='random': lc=rng.integers(0,3); bg=list(BG)[rng.integers(0,7)]
                    else:
                        lc=0 if CODE.get(R[t],0)+rng.normal(0,noise)>0.8 else (2 if CODE.get(R[t],0)+rng.normal(0,noise)<-0.6 else 1)
                        match=[b for b,v in BG.items() if R[t] in v]
                        bg=match[0] if (match and rng.random()<.5) else list(BG)[rng.integers(0,7)]
                    for r,w in CODE.items(): sc[k[r]]+= w if lc==0 else (-w if lc==2 else 0)
                    for r in BG[bg]: sc[k[r]]+=0.5
                    sc+=rng.normal(0,1e-6,n)
                    return np.argsort(-sc)
                o=respond(); tops[R[o[0]]]+=1; tot+=1
                if mode=='true':
                    t1+=o[0]==t; t3+=t in o[:3]; per[R[t]]+=o[0]==t; perN[R[t]]+=1
                    o2=respond(); stab+=o2[0]==o[0]
    if mode=='random':
        exp=tot/n; chi=sum((tops[r]-exp)**2/exp for r in R)
        return dict(max_share=max(tops.values())/tot, min_share=min(tops.get(r,0) for r in R)/tot, chi2=round(chi,1), most=tops.most_common(2))
    return dict(top1=t1/tot, top3=t3/tot, retest=stab/tot, worst=sorted(((per[r]/perN[r]),r) for r in R)[:3])

D={'A: current (2 items, 9 pairs)':dict(items=2,pairs=PAIRS9,pairw=1.5,z=False),
   'B: 3 items, 9 pairs':dict(items=3,pairs=PAIRS9,pairw=1.5,z=False),
   'C: 3 items, 14 balanced pairs':dict(items=3,pairs=PAIRS14,pairw=1.5,z=False),
   'D: C + within-person standardising':dict(items=3,pairs=PAIRS14,pairw=1.5,z=True),
   'E: 4 items, 14 balanced pairs, std':dict(items=4,pairs=PAIRS14,pairw=1.5,z=True)}
import sys
for name,d in D.items():
    out=[name]
    for nz in (0.8,1.2,1.6):
        r=simulate(d,noise=nz,N=120); out.append(f"noise {nz}: top1 {r['top1']:.0%} top3 {r['top3']:.0%} retest {r['retest']:.0%}")
    rr=simulate(d,mode='random',N=300,reps=1)
    out.append(f"random answers: top role share {rr['min_share']:.1%}-{rr['max_share']:.1%} (fair = 7.1%), chi2={rr['chi2']}, most {rr['most']}")
    print('\n  '.join(out)); sys.stdout.flush()
