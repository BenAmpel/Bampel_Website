# v2: 28 activity taps (2 per role, 0/1/2) + 9 this-or-that pairs + coding question.
# Simulated student: likes an activity in proportion to how close its role is to their true role.
import numpy as np, collections, sys
sys.path.insert(0,'.')
exec(open('sim18.py').read().split('names=list(R)')[0])   # reuse trait profiles R
names=list(R); P=np.array([R[n]/np.linalg.norm(R[n]) for n in names]); S=P@P.T
k={n:i for i,n in enumerate(names)}
PAIRS=[('SOC','IR'),('GRC','Audit'),('Pentest','AppSec'),('Pentest','AISec'),('Forensics','Intel'),
       ('Privacy','GRC'),('Cloud','NetSys'),('Awareness','GRC'),('OT','NetSys')]
CODE={'AppSec':2,'Cloud':1.5,'AISec':1.5,'Pentest':1}
rng=np.random.default_rng(2)
def run(noise,N=400,pairs=True):
    t1=t3=0; conf=collections.Counter()
    for true in names:
        aff=S[k[true]]
        for _ in range(N):
            sc=np.zeros(14)
            for r in names:
                for _item in range(2):
                    x=3*aff[k[r]]+rng.normal(0,noise)
                    sc[k[r]]+= 2 if x>2.4 else 1 if x>1.6 else 0
            if pairs:
                for a,b in PAIRS:
                    ua,ub=3*aff[k[a]]+rng.normal(0,noise),3*aff[k[b]]+rng.normal(0,noise)
                    if max(ua,ub)>1.5: sc[k[a] if ua>ub else k[b]]+=1.5
            likes_code=CODE.get(true,0)+rng.normal(0,noise)
            for r,w in CODE.items(): sc[k[r]]+= w*0.5 if likes_code>1 else -w*0.5 if likes_code<0 else 0
            sc+=rng.normal(0,1e-6,14)
            order=np.argsort(-sc); t1+=names[order[0]]==true; t3+=true in [names[i] for i in order[:3]]
            if names[order[0]]!=true: conf[(true,names[order[0]])]+=1
    return t1/(14*N),t3/(14*N),conf.most_common(4)
for noise in (0.5,1.0,1.5):
    a=run(noise); b=run(noise,pairs=False)
    print(f"noise {noise}: v2 top1 {a[0]:.0%} top3 {a[1]:.0%} | without pair Qs top1 {b[0]:.0%} | worst {a[2]}")
