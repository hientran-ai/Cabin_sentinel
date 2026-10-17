"""Optional person-crop fallback and expiring, stream-local age evidence."""
import math
from collections import deque

from p068_vision.age import choose_age


class TemporalAgeEvidence:
    """Average recent face scores within one stream and person track.

    Missing faces remain unknown. No age is inferred from seat position, motion,
    box size or another person's history.
    """

    def __init__(self, *, window=7, ttl=1.0):
        self.window, self.ttl = window, ttl
        self.tracks = {}

    def update(self, detections, now, child_threshold, adult_threshold):
        self.tracks = {k:v for k,v in self.tracks.items() if 0<=now-v['seen'] <= self.ttl}
        for d in detections:
            if d.get('class') != 'person' or d.get('track_id') is None:
                continue
            scores = d.get('age_raw_scores',d.get('age_scores'))
            if not scores or any(not math.isfinite(scores.get(c, float('nan'))) or not 0<=scores[c]<=1 for c in ('adult','child')):
                continue
            box = d.get('bbox')
            old = self.tracks.get(d['track_id'])
            if old and box is not None and old.get('bbox') is not None:
                from p068_vision.tracking import iou
                if iou(box,old['bbox'])<.1:
                    self.tracks.pop(d['track_id'])
            state = self.tracks.setdefault(d['track_id'], {'seen': now, 'samples': deque(maxlen=self.window)})
            if box is not None:
                state['bbox'] = list(box)
            state['seen'] = now
            state['samples'] = deque((s for s in state['samples'] if now-s[0]<=self.ttl), maxlen=self.window)
            state['samples'].append((now, dict(scores)))
            merged = {c:sum(s[1][c] for s in state['samples'])/len(state['samples']) for c in ('adult','child')}
            d.update(age_raw_scores=dict(scores), age_scores=merged,
                     age_group=choose_age(merged,child_threshold,adult_threshold),
                     age_observations=len(state['samples']), age_temporal=True)


class AgeEvidence:
    def __init__(self, face, body, *, window=7, ttl=1.0, label_hold=0.0):
        if face.input_kind != 'face' or body.input_kind != 'person':
            raise ValueError('Fusion requires separate face and person checkpoints')
        if not isinstance(window, int) or window < 1 or not math.isfinite(ttl) or ttl <= 0:
            raise ValueError('Age window and TTL must be positive')
        self.face, self.body = face, body
        self.window, self.ttl = window, ttl
        if not math.isfinite(label_hold) or not 0 <= label_hold <= ttl:
            raise ValueError('Label hold must be between zero and evidence TTL')
        self.label_hold = label_hold
        self.tracks = {}

    def classify(self, frame, people, now, *, faces=None):
        answers = self.face.classify(frame, [p['bbox'] for p in people], faces=faces)
        missing = [i for i, a in enumerate(answers) if a.get('age_scores') is None]
        body_answers = self.body.classify(frame, [people[i]['bbox'] for i in missing]) if missing else []
        for answer in answers:
            answer['age_source'] = 'face'
        for i, answer in zip(missing, body_answers, strict=True):
            answers[i] = {**answer, 'age_source': 'person_fallback'}
        self.tracks = {k:v for k,v in self.tracks.items() if now-v['seen'] <= self.ttl}
        for person, answer in zip(people, answers, strict=True):
            key = person.get('track_id')
            scores = answer.get('age_scores')
            if key is None:
                continue
            state = self.tracks.setdefault(key, {'seen':now, 'samples':deque(maxlen=self.window)})
            state['seen'] = now
            state['samples'] = deque((s for s in state['samples'] if now-s[0] <= self.ttl), maxlen=self.window)
            if scores is not None:
                state['samples'].append((now, dict(scores), 2.0 if answer['age_source']=='face' else 1.0))
            answer['age_raw_scores'] = scores
            if state['samples']:
                total = sum(s[2] for s in state['samples'])
                merged = {c:sum(s[1][c]*s[2] for s in state['samples'])/total for c in ('adult','child')}
                answer.update(age_scores=merged, age_group=choose_age(merged, self.face.child_threshold, self.face.adult_threshold),
                              age_observations=len(state['samples']), age_temporal=True,
                              age_held=scores is None)
                group=answer['age_group']
                raw_group=choose_age(scores, self.face.child_threshold,self.face.adult_threshold) if scores else 'unknown'
                if group in ('adult','child') and len(state['samples'])>=3 and raw_group==group:
                    state.update(confirmed_label=group,confirmed_at=now)
                elif (group=='unknown' and self.label_hold and state.get('confirmed_label')
                      and now-state['confirmed_at']<=self.label_hold
                      and raw_group in ('unknown',state['confirmed_label'])
                      and merged[state['confirmed_label']]>=.65):
                    answer.update(age_group=state['confirmed_label'],age_label_held=True)
        return answers
