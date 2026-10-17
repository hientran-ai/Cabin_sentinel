"""Optional multiscale human proposals; presence is independent of age."""
from pathlib import Path

from p068_vision.evaluation import box_iou


def merge_person_proposals(rows, threshold=.6):
    people=sorted((r for r in rows if r['class']=='person'),key=lambda r:r['confidence'],reverse=True)
    kept=[]
    for row in people:
        if not any(box_iou(row['bbox'],other['bbox'])>=threshold for other in kept):
            kept.append(row)
    return [r for r in rows if r['class']!='person']+kept


class PersonRescue:
    def __init__(self, path, *, device='cpu', sizes=(960,1280),confidence=.07):
        if not Path(path).is_file():
            raise FileNotFoundError('Local person rescue checkpoint required')
        if not sizes or any(isinstance(v,bool) or not isinstance(v,int) or v<32 or v%32 for v in sizes):
            raise ValueError('Person rescue sizes must be positive multiples of 32')
        if not 0<confidence<=1:
            raise ValueError('Invalid person rescue confidence')
        from ultralytics import YOLO
        self.model=YOLO(str(path))
        self.classes=[i for i,n in self.model.names.items() if n=='person']
        if not self.classes:
            raise ValueError('Person rescue checkpoint must contain person')
        self.device,self.sizes,self.confidence=device,tuple(sizes),confidence

    def predict(self, frame):
        rows=[]
        # One model instance owns both passes. Other model/face branches run
        # concurrently; this instance is never entered from two threads.
        for size in self.sizes:
            result=self.model.predict(frame,classes=self.classes,device=self.device,
                imgsz=size,conf=self.confidence,verbose=False)[0]
            rows.extend({'class':'person','confidence':float(r[4]),'bbox':r[:4],
                         'detector_source':'person_rescue','rescue_imgsz':size}
                        for r in result.boxes.data.cpu().tolist())
        return rows
