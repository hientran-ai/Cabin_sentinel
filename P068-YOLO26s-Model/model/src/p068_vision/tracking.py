"""Stream-local living-object IDs and temporal displacement motion."""
import math
from collections import deque

import numpy as np

LIVING = {"person", "cat", "dog", "pet_unknown"}


def merge_face_rescue_duplicates(rows, faces, *, preserve_body_proposals=False):
    """Drop a rescued face only when the enclosing body has that same sole face.

    A second observed face in the enclosing box protects a distinct rear person.
    No face evidence means no new suppression.
    """
    valid = [f for f in (faces if faces is not None else []) if len(f)>=4 and all(math.isfinite(float(x)) for x in f[:4]) and f[2]>0 and f[3]>0
             and (len(f)<15 or float(f[-1])>=.85)]
    bodies = [r for r in rows if r['class']=='person' and r.get('detector_source')!='yunet_face']
    def covered(face,box):
        x,y,w,h = face[:4]
        return max(0,min(x+w,box[2])-max(x,box[0]))*max(0,min(y+h,box[3])-max(y,box[1]))/(w*h)>=.9
    kept = []
    for row in rows:
        duplicate = False
        if row['class']=='person' and row.get('detector_source')=='yunet_face':
            target = [f for f in valid if covered(f,row['bbox'])]
            if len(target)==1:
                for body in bodies:
                    owners = [f for f in valid if covered(f,body['bbox'])]
                    if len(owners)==1 and owners[0] is target[0]:
                        duplicate = True
                        break
        if not duplicate:
            kept.append(row)
    if preserve_body_proposals:
        # Multiscale body proposals can contain a tighter infant localization
        # inside an oversized seat/body proposal. A shared face is insufficient
        # to discard that tighter box.
        return kept
    # Native YOLO may emit a head/upper-body box in addition to a full body.
    # Merge only nested upper boxes supported by the same single clear face.
    people=[r for r in kept if r['class']=='person']
    remove=set()
    for small in people:
        a=small['bbox']
        area=(a[2]-a[0])*(a[3]-a[1])
        owned=[f for f in valid if covered(f,a)]
        if len(owned)!=1 or area<=0:
            continue
        for big in people:
            if small is big:
                continue
            b=big['bbox']
            barea=(b[2]-b[0])*(b[3]-b[1])
            intersection=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
            upper=a[1]<=b[1]+.15*(b[3]-b[1]) and a[3]<=b[1]+.75*(b[3]-b[1])
            owners=[f for f in valid if covered(f,b)]
            if barea>area/ .65 and intersection/area>=.95 and upper and len(owners)==1 and owners[0] is owned[0]:
                remove.add(id(small))
                break
    return [r for r in kept if id(r) not in remove]


def suppress_pet_duplicates(rows,threshold=.7,*,same_species_only=False):
    pets=sorted((i for i,r in enumerate(rows) if r['class'] in {'cat','dog','pet_unknown'}),
                key=lambda i:rows[i]['confidence'],reverse=True)
    kept=[]
    for i in pets:
        if not any((not same_species_only or rows[i]['class']==rows[j]['class'])
                   and iou(rows[i]['bbox'],rows[j]['bbox'])>threshold for j in kept):
            kept.append(i)
    return [r for i,r in enumerate(rows) if r['class'] not in {'cat','dog','pet_unknown'} or i in kept]

def iou(a, c):
    intersection = max(0, min(a[2], c[2])-max(a[0], c[0]))*max(0, min(a[3], c[3])-max(a[1], c[1]))
    union = (a[2]-a[0])*(a[3]-a[1])+(c[2]-c[0])*(c[3]-c[1])-intersection
    return intersection/union if union > 0 else 0


def suppress_person_duplicates(rows, threshold=.5):
    """Keep the strongest person box where person proposals substantially overlap.

    This filters current observations only; it never recovers a missing person.
    Different classes and moderately overlapping people remain independent.
    """
    people = sorted((i for i,r in enumerate(rows) if r['class']=='person'),
                    key=lambda i: rows[i]['confidence'], reverse=True)
    kept = []
    def duplicate(a, b):
        if iou(a,b) > threshold:
            return True
        intersection = max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
        smaller = min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1]))
        aligned = abs((a[0]+a[2]-b[0]-b[2])/2) <= .2*max(a[2]-a[0],b[2]-b[0])
        return smaller > 0 and intersection/smaller >= .95 and aligned
    for index in people:
        if not any(duplicate(rows[index]['bbox'],rows[old]['bbox']) for old in kept):
            kept.append(index)
    keep = set(kept)
    return [r for i,r in enumerate(rows) if r['class']!='person' or i in keep]


class TemporalTracker:
    """Class-aware greedy IoU IDs; no third-party tracker or invented detections.

    Keep association state 1s. A lost person's last box is available for privacy
    only for 0.5s. Motion uses robust median-center displacement across 5 observed
    boxes. It is not breathing detection and has no camera-motion compensation.
    """
    def __init__(self, fps, *, moving_threshold=.02, max_gap_seconds=1.):
        if (not math.isfinite(fps) or fps <= 0 or not 0 < moving_threshold <= 1
                or not math.isfinite(max_gap_seconds) or max_gap_seconds<=0):
            raise ValueError('Invalid tracking FPS or motion threshold')
        self.fps = fps
        self.moving_threshold = moving_threshold
        self.max_gap_seconds=max_gap_seconds
        self.tracks = {}
        self.next_id = 1
        self.observations = self.assignment_changes = self.contiguous_matches = 0
        self.last_rows = []

    def update(self, rows, now):
        self.tracks = {key: state for key, state in self.tracks.items() if 0<=now-state['last_seen']<=self.max_gap_seconds}
        living = [(i, row) for i, row in enumerate(rows) if row['class'] in LIVING
                  and isinstance(row.get('bbox'), (list, tuple)) and len(row['bbox']) == 4
                  and all(isinstance(v, (int, float)) and math.isfinite(v) for v in row['bbox'])
                  and row['bbox'][2] > row['bbox'][0] and row['bbox'][3] > row['bbox'][1]]
        pairs = []
        for index, row in living:
            for key, state in self.tracks.items():
                score = iou(row['bbox'], state['bbox'])
                if row['class']==state['class']=='person':
                    row_face=row.get('detector_source')=='yunet_face'
                    old_face=state.get('last_source')=='yunet_face'
                    if row_face != old_face:
                        face,body=(row['bbox'],state['bbox']) if row_face else (state['bbox'],row['bbox'])
                        area=(face[2]-face[0])*(face[3]-face[1])
                        overlap=max(0,min(face[2],body[2])-max(face[0],body[0]))*max(0,min(face[3],body[3])-max(face[1],body[1]))
                        if area>0 and overlap/area>=.9 and (face[1]+face[3])/2<=body[1]+.6*(body[3]-body[1]):
                            body_area=(body[2]-body[0])*(body[3]-body[1])
                            score=max(score,.31+.1*area/body_area)
                same_kind = row['class']==state['class'] or row['class'] in {'cat','dog','pet_unknown'} and state['class'] in {'cat','dog','pet_unknown'}
                if same_kind and score >= .3:
                    pairs.append((score, index, key))
        assigned, used = {}, set()
        for score, index, key in sorted(pairs, reverse=True):
            if index not in assigned and key not in used:
                assigned[index] = key
                used.add(key)
        answers = {}
        for index, row in living:
            key = assigned.get(index)
            if key is None:
                key = self.next_id
                self.next_id += 1
                self.tracks[key] = {'class': row['class'], 'samples': deque(maxlen=5)}
            state = self.tracks[key]
            source=row.get('detector_source','yolo')
            if state.get('last_source',source)!=source:
                state['samples'].clear()  # Body and face centers are not comparable motion measurements.
            state['last_source']=source
            box = list(row['bbox'])
            center = [(box[0]+box[2])/2, (box[1]+box[3])/2]
            if 'last_seen' in state and now-state['last_seen'] > .5:
                state['samples'].clear()
            state['samples'].append((now, center))
            state.update(bbox=box, last_seen=now, **{'class':row['class']})
            samples = list(state['samples'])
            ratio = None
            if len(samples) >= 3:
                early = np.median([r[1] for r in samples[:2]], axis=0)
                late = np.median([r[1] for r in samples[-2:]], axis=0)
                diagonal = max(1., math.hypot(box[2]-box[0], box[3]-box[1]))
                ratio = float(np.linalg.norm(late-early)/diagonal)
            answers[index] = {'track_id': key, 'moving': None if ratio is None else ratio >= self.moving_threshold,
                              'track_displacement_ratio': ratio, 'motion_samples': len(samples)}
        # Continuity proxy only: not a ground-truth ID-switch or IDF1 metric.
        previous_pairs = []
        for index, row in living:
            for old in self.last_rows:
                score = iou(row['bbox'], old['bbox'])
                if row['class'] == old['class'] and score >= .5:
                    previous_pairs.append((score, index, old['track_id']))
        checked, prior_ids = set(), set()
        for score, index, old_id in sorted(previous_pairs, reverse=True):
            if index not in checked and old_id not in prior_ids:
                checked.add(index)
                prior_ids.add(old_id)
                self.contiguous_matches += 1
                self.assignment_changes += answers[index]['track_id'] != old_id
        self.last_rows = [{**rows[index], 'track_id': value['track_id']} for index, value in answers.items()]
        self.observations += len(answers)
        ready = any(v['moving'] is not None for v in answers.values()) or not answers
        metadata = {'status': 'ready' if ready else 'warming_up', 'scope': 'tracked_living_boxes',
                    'has_motion': any(v['moving'] is True for v in answers.values()) if ready else None,
                    'motion_ratio': None, 'regions': [
                        {'class': rows[i]['class'], 'bbox': rows[i]['bbox'], 'track_id': v['track_id']}
                        for i, v in answers.items() if v['moving'] is True]}
        return metadata, answers

    def privacy_people(self, now):
        return [{'class': 'person', 'bbox': state['bbox'], 'track_id': key,
                 'track_held': now-state['last_seen'] > .5/self.fps}
                for key, state in self.tracks.items() if state['class']=='person' and now-state['last_seen'] <= .5]

    def describe(self):
        return {'type': 'class-aware greedy IoU', 'ids_created': self.next_id-1,
                'living_observations_with_id': self.observations,
                'adjacent_iou_matches': self.contiguous_matches,
                'adjacent_iou_id_changes': self.assignment_changes,
                'adjacent_iou_id_change_rate': self.assignment_changes/self.contiguous_matches if self.contiguous_matches else None,
                'motion_window_observations': 5, 'motion_threshold_diagonal_fraction': self.moving_threshold,
                'association_hold_seconds': 1., 'privacy_box_hold_seconds': .5}
