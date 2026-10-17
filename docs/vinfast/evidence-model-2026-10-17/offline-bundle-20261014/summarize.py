import json,sys,collections
base=sys.argv[1]
out={}
for c in ['ai-child','child-rear','empty-cabin']:
    rows=[json.loads(l) for l in open(f'{base}/{c}/detections.jsonl')]
    s=json.load(open(f'{base}/{c}/detections.summary.json'))
    cnt=collections.Counter(); 
    for r in rows:
        labs=set()
        for d in r.get('detections',[]):
            labs.add(d.get('class_name') or d.get('class') or d.get('label'))
            if d.get('age_group'): labs.add('age:'+str(d['age_group']))
        for l in labs: cnt[l]+=1
    print(c, len(rows),'frames', dict(cnt))
    print('  keys', list(rows[0].keys())[:12], '| summary keys', list(s.keys())[:12])
