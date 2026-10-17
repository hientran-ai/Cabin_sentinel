from collections import OrderedDict
from types import SimpleNamespace
from unittest.mock import Mock

import numpy as np
from p068_vision.tracking import TemporalTracker


def test_person_duplicate_filter_keeps_distinct_people_and_pets():
    from p068_vision.tracking import suppress_person_duplicates
    rows = [{'class':'person','confidence':.9,'bbox':[0,0,100,100]},
            {'class':'person','confidence':.6,'bbox':[5,5,100,100]},
            {'class':'person','confidence':.8,'bbox':[65,0,165,100]},
            {'class':'dog','confidence':.8,'bbox':[0,0,100,100]}]
    result = suppress_person_duplicates(rows)
    assert result == [rows[0],rows[2],rows[3]]
    tracker=TemporalTracker(10)
    _, answers=tracker.update(result,0)
    _, again=tracker.update(result,.1)
    assert [v['track_id'] for v in answers.values()] == [v['track_id'] for v in again.values()]


def test_person_nested_partial_box_is_removed_but_offset_person_is_kept():
    from p068_vision.tracking import suppress_person_duplicates
    full={'class':'person','confidence':.9,'bbox':[0,0,100,200]}
    partial={'class':'person','confidence':.4,'bbox':[10,100,90,180]}
    adjacent={'class':'person','confidence':.8,'bbox':[80,0,180,200]}
    assert suppress_person_duplicates([full,partial,adjacent]) == [full,adjacent]


def test_tracking_recovery_never_invents_occupancy_or_object_motion():
    tracker = TemporalTracker(30)
    person = {'class': 'person', 'bbox': [10, 10, 90, 90]}
    rows = [person, {'class': 'object', 'bbox': [0, 0, 100, 100]}]
    _, first = tracker.update(rows, 0)
    assert set(first) == {0}
    for i in range(1, 4):
        _, answers = tracker.update(rows, i/30)
        assert answers[0]['track_id'] == first[0]['track_id']
    assert answers[0]['moving'] is False
    _, absent = tracker.update([], .2)
    assert absent == {} and len(tracker.privacy_people(.2)) == 1
    _, recovered = tracker.update([person], .3)
    assert recovered[0]['track_id'] == first[0]['track_id']
    assert tracker.privacy_people(.9) == []


def test_face_roi_coordinates_fallback_and_pet_exclusion():
    from p068_vision.age import AgeClassifier
    age = AgeClassifier.__new__(AgeClassifier)
    age.face_detector = Mock()
    face = np.array([10, 10, 40, 40]+[0]*10+[.9], dtype=np.float32)
    age.face_detector.detect.return_value = None, np.array([face])
    frame = np.zeros((200, 300, 3), np.uint8)
    faces = age.detect_pipeline_faces(frame, [{'class': 'person', 'bbox': [100, 50, 200, 180]}], privacy=True)
    assert faces[0][:4].tolist() == [110, 60, 40, 40]
    assert age.face_detector.detect.call_count == 1
    age.face_detector.detect.reset_mock()
    faces = age.detect_pipeline_faces(frame, [{'class': 'cat', 'bbox': [0, 0, 100, 100]}], privacy=True)
    assert faces == []
    assert age.face_detector.detect.call_count == 1
    age.face_detector.detect.side_effect = [(None, None), (None, np.array([face]))]
    faces = age.detect_pipeline_faces(frame, [{'class': 'person', 'bbox': [100, 50, 200, 180]}], privacy=True)
    assert faces[0][0] == 10  # Full-frame rescue, no stale ROI offset.


def test_age_rescue_replaces_weak_duplicate_and_keeps_privacy_evidence():
    from p068_vision.age import AgeClassifier
    age = AgeClassifier.__new__(AgeClassifier)
    age.face_detector = Mock()
    weak = np.array([10, 10, 40, 40]+[0]*10+[.6], dtype=np.float32)
    strong = weak.copy()
    strong[-1] = .95
    frame = np.zeros((100, 100, 3), np.uint8)
    people = [{'class': 'person', 'bbox': [0, 0, 100, 100]}]
    age.face_detector.detect.side_effect = [(None, np.array([weak])), (None, np.array([strong]))]
    faces = age.detect_pipeline_faces(frame, people, privacy=True)
    assert len(faces) == 1 and len(age.age_faces(faces)) == 1
    assert age._face_rects(frame, [people[0]['bbox']], faces=faces)[0] is not None
    age.face_detector.detect.side_effect = [(None, np.array([weak])), (None, None)]
    faces = age.detect_pipeline_faces(frame, people, privacy=True)
    assert len(faces) == 1 and not age.age_faces(faces)
    age.face_detector.setScoreThreshold.assert_called_with(.85)


def test_age_rescue_runs_for_second_person_without_clear_face():
    from p068_vision.age import AgeClassifier
    age = AgeClassifier.__new__(AgeClassifier)
    age.face_detector = Mock()
    face = np.array([10, 10, 40, 40]+[0]*10+[.95], dtype=np.float32)
    other = face.copy()
    other[0] += 100
    age.face_detector.detect.side_effect = [(None, np.array([face])), (None, None), (None, np.array([face, other]))]
    frame = np.zeros((100, 200, 3), np.uint8)
    boxes = [[0, 0, 100, 100], [100, 0, 200, 100]]
    faces = age.detect_pipeline_faces(frame, [{'class': 'person', 'bbox': b} for b in boxes], privacy=True)
    assert len(faces) == 2
    assert all(r is not None for r in age._face_rects(frame, boxes, faces=age.age_faces(faces)))


def test_face_owner_prefers_tighter_person_without_stealing_foreground_face():
    from p068_vision.age import AgeClassifier
    age=AgeClassifier.__new__(AgeClassifier)
    frame=np.zeros((300,300,3),np.uint8)
    faces=[np.array([30,20,32,40]+[0]*10+[.95]),np.array([130,30,45,50]+[0]*10+[.95])]
    boxes=[[0,0,240,290],[20,10,80,100]]
    rects=age._face_rects(frame,boxes,faces=faces)
    assert rects[0][0]>100 and rects[1][0]<30
    assert age._face_rects(frame,[boxes[0],boxes[0]],faces=faces)==[None,None]


def test_distinct_small_face_rescues_missed_person_without_duplicating_front_face():
    from p068_vision.age import AgeClassifier
    age=AgeClassifier.__new__(AgeClassifier)
    age.face_detector=Mock()
    frame=np.zeros((250,200,3),np.uint8)
    people=[{'class':'person','bbox':[0,0,200,250]}]
    large=np.array([70,20,60,70]+[0]*10+[.95],dtype=np.float32)
    small=np.array([20,50,32,32]+[0]*10+[.95],dtype=np.float32)
    faces=[large,small]
    added=age.face_only_people(frame,people,faces=faces)
    assert len(added)==1 and added[0]['detector_source']=='yunet_face'
    assert added[0]['bbox'][0]<20
    ambiguous=[np.array([20,20,35,35]+[0]*10+[.95]),np.array([130,20,35,35]+[0]*10+[.95])]
    assert age.face_only_people(frame,people,faces=ambiguous)==[]


def test_person_rescue_scans_full_frame_even_when_roi_has_clear_face():
    from p068_vision.age import AgeClassifier
    age=AgeClassifier.__new__(AgeClassifier)
    age.face_detector=Mock()
    front=np.array([20,10,50,60]+[0]*10+[.95],dtype=np.float32)
    rear=np.array([180,15,32,35]+[0]*10+[.95],dtype=np.float32)
    age.face_detector.detect.side_effect=[(None,np.array([front])),(None,np.array([rear]))]
    frame=np.zeros((150,250,3),np.uint8)
    faces=age.detect_pipeline_faces(frame,[{'class':'person','bbox':[0,0,120,150]}],rescue_people=True)
    assert len(faces)==2 and faces[1][0]==180
    assert age.face_detector.detect.call_count==2


def test_nearby_faces_of_different_sizes_are_not_deduplicated_by_origin():
    from p068_vision.age import AgeClassifier
    age=AgeClassifier.__new__(AgeClassifier)
    age.face_detector=Mock()
    large=np.array([50,20,80,100]+[0]*10+[.96],dtype=np.float32)
    small=np.array([45,25,35,40]+[0]*10+[.95],dtype=np.float32)
    age.face_detector.detect.return_value=(None,np.array([large,small]))
    faces=age.detect_pipeline_faces(np.zeros((200,200,3),np.uint8),[{'class':'person','bbox':[0,0,200,200]}])
    assert len(age.age_faces(faces))==2


def test_crop_padding_is_not_used_to_claim_ownership_of_another_face():
    from p068_vision.age import AgeClassifier
    age=AgeClassifier.__new__(AgeClassifier)
    age.face_detector=Mock()
    large=np.array([70,20,60,70]+[0]*10+[.96],dtype=np.float32)
    small=np.array([66,25,32,32]+[0]*10+[.95],dtype=np.float32)
    added=age.face_only_people(np.zeros((250,200,3),np.uint8),
                              [{'class':'person','bbox':[0,0,200,250]}],faces=[large,small])
    assert len(added)==1


def test_observed_face_and_body_share_id_without_cached_occupancy():
    tracker=TemporalTracker(10)
    body={'class':'person','confidence':.9,'bbox':[0,0,100,200]}
    face={'class':'person','confidence':.95,'bbox':[30,10,70,55],'detector_source':'yunet_face'}
    _,a=tracker.update([body],0)
    _,b=tracker.update([face],.1)
    _,c=tracker.update([body],.2)
    assert a[0]['track_id']==b[0]['track_id']==c[0]['track_id']
    assert b[0]['motion_samples']==c[0]['motion_samples']==1
    _,absent=tracker.update([],.3)
    assert absent=={}


def test_provider_filters_before_normalizing_and_isolates_streams():
    from p068_vision.provider import TamVisionProvider
    provider = TamVisionProvider.__new__(TamVisionProvider)
    provider._items_authoritative = False
    provider._phone_model = None
    rows = [[10, 10, 90, 90, .9, 0], [0, 0, 100, 100, .3, 56], [100, 10, 130, 40, .3, 67]]
    boxes = SimpleNamespace(data=SimpleNamespace(cpu=lambda: SimpleNamespace(tolist=lambda: rows)))
    result = SimpleNamespace(boxes=boxes, names={0:'person', 56:'chair', 67:'cell phone'})
    provider._model = SimpleNamespace(predict=lambda *a, **kw: [result])
    provider._options = {}
    provider._configure_threads = lambda: None
    provider._age = None
    provider._age_load_error = None
    provider._streams = OrderedDict()
    pixels = np.zeros((150, 200, 3), np.uint8)
    a = provider._infer(b'a', decoded_frame=pixels, stream_id='a')
    b = provider._infer(b'b', decoded_frame=pixels, stream_id='b')
    provider._infer(b'a', decoded_frame=pixels, stream_id='a')
    assert [d['class'] for d in a['detections']] == ['person']
    assert a['detections'][0]['age_group'] == 'unknown'
    assert b['detections'][0]['motion_samples'] == 1
    assert len(provider._streams['a'][0].tracks[1]['samples']) == 2
    assert len(provider._streams['b'][0].tracks[1]['samples']) == 1
