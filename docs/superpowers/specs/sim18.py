import numpy as np, itertools, collections
T=['OFF','DEF','INV','INTEL','BLD','CODE','GOV','PPL','PACE','CLOUD','OT','AI','LAW','PRIV']
ix={t:i for i,t in enumerate(T)}
def v(**k):
    a=np.zeros(len(T))
    for t,w in k.items(): a[ix[t]]=w
    return a
R={'SOC':v(DEF=3,PACE=2,INV=1),'IR':v(PACE=3,DEF=2,INV=2,PPL=1),'Forensics':v(INV=3,LAW=2,DEF=1),
'Intel':v(INTEL=3,INV=1,PPL=1),'Pentest':v(OFF=3,CODE=1.5,INV=1),'AppSec':v(CODE=3,BLD=2,OFF=1),
'Cloud':v(BLD=3,CLOUD=3,CODE=1.5),'GRC':v(GOV=3,PPL=1.5,PACE=-1),'Audit':v(GOV=3,PPL=1),
'Privacy':v(PRIV=3,GOV=2,LAW=1),'Awareness':v(PPL=3,GOV=1),'NetSys':v(BLD=2,DEF=1.5,PACE=1),
'OT':v(OT=3,BLD=1,DEF=1),'AISec':v(AI=3,CODE=2,OFF=1)}
Q=[[v(OFF=2),v(DEF=2,PACE=1),v(INTEL=2),v(GOV=2,PPL=1)],
[v(OFF=2),v(INV=2),v(CODE=2,BLD=1),v(GOV=2),v(BLD=2,DEF=1)],
[v(CODE=2),v(CODE=1),v(CODE=-1)],[v(PACE=2),v(PACE=1),v(PACE=-1)],
[v(PACE=1,DEF=1),v(),v(PACE=-2)],
[v(INTEL=2),v(OFF=2),v(INV=2,LAW=1),v(BLD=2),v(PPL=2),v(GOV=2)],
[v(PPL=-1),v(),v(GOV=1,PPL=1),v(PPL=2)],
[v(DEF=1,INV=1),v(OFF=1,CODE=1),v(INTEL=2),v(GOV=1,PRIV=1)],
[v(DEF=1,INV=1),v(INTEL=2),v(OT=2),v(AI=2),v(PRIV=2),v(CLOUD=2)],
'multi',
[v(GOV=2),v(),v(OFF=1)],[v(OFF=2),v(BLD=2),v(GOV=2),v(INV=1,DEF=1)],
[v(CODE=1,BLD=1),v(BLD=1,DEF=1),v(GOV=2),v(LAW=1,INTEL=1),v(PPL=2),v(OT=2),v()],
[v(PPL=2),v(),v(PPL=-1)],[v(INTEL=1,GOV=1),v(),v(INTEL=-1,GOV=-1)],
[v(OFF=1,INV=1),v(INTEL=1,GOV=1)],
[v(LAW=1,INTEL=1),v(OFF=1,GOV=1),v(DEF=1,BLD=1),v(CODE=1,CLOUD=1),v()]]
MULTI=[v(CLOUD=1),v(OT=1),v(AI=1),v(LAW=1),v(PRIV=1)]
names=list(R); P=np.array([R[n]/np.linalg.norm(R[n]) for n in names])
rng=np.random.default_rng(1)
def respond(prof,noise):
    s=np.zeros(len(T))
    for q in Q:
        if q=='multi':
            for o in MULTI:
                if o@prof+rng.gumbel(0,noise)>1.0: s+=o
            continue
        u=[o@prof+rng.gumbel(0,noise) for o in q]; s+=q[int(np.argmax(u))]
    return s
for noise in (0.5,1.0,1.5):
    top1=top3=0; conf=collections.Counter(); N=400
    for n in names:
        prof=R[n]/np.linalg.norm(R[n])*3
        for _ in range(N):
            s=respond(prof,noise); sc=P@s/(np.linalg.norm(s)+1e-9)
            order=[names[i] for i in np.argsort(-sc)]
            top1+=order[0]==n; top3+=n in order[:3]
            if order[0]!=n: conf[(n,order[0])]+=1
    print(f"noise {noise}: top1 {top1/(14*N):.0%}  top3 {top3/(14*N):.0%}  worst confusions {conf.most_common(6)}")
# per-trait coverage
cov=collections.Counter()
for q in Q:
    opts=MULTI if q=='multi' else q
    for o in opts:
        for t in T:
            if o[ix[t]]!=0: cov[t]+=1
print('options touching each trait:',dict(cov))
print('cosine GRC vs Audit:',round(float(P[names.index('GRC')]@P[names.index('Audit')]),3),' SOC vs IR:',round(float(P[names.index('SOC')]@P[names.index('IR')]),3))
