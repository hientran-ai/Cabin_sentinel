"""Optional local grounded human proposals; phrases never become age evidence."""
from contextlib import nullcontext
from pathlib import Path

from p068_vision.evaluation import box_iou

PROMPT='a person. a baby. an infant. a child.'
REQUIRED_FILES=('config.json','model.safetensors','preprocessor_config.json',
                'tokenizer.json','tokenizer_config.json','special_tokens_map.json','vocab.txt')


def append_grounded_people(rows,proposals,threshold=.85):
    """Keep admitted human evidence, then add non-duplicate grounded proposals."""
    kept=list(rows)
    fresh=[]
    for row in sorted(proposals,key=lambda r:r['confidence'],reverse=True):
        if row['class']!='person':
            continue
        if any(box_iou(row['bbox'],other['bbox'])>=.6 for other in fresh):
            continue
        fresh.append(row)
        if not any(other['class']=='person' and box_iou(row['bbox'],other['bbox'])>=threshold for other in kept):
            kept.append(row)
    return kept


class GroundedPerson:
    def __init__(self,path,*,device='cpu',confidence=.1):
        path=Path(path)
        if not all((path/name).is_file() for name in REQUIRED_FILES):
            raise FileNotFoundError('Complete local Grounding DINO checkpoint required')
        if not 0<confidence<=1:
            raise ValueError('Invalid grounded person confidence')
        import torch
        from transformers import GroundingDinoForObjectDetection, GroundingDinoProcessor
        self.torch,self.device,self.confidence=torch,device,confidence
        self.cuda=device.startswith('cuda:')
        self.processor=GroundingDinoProcessor.from_pretrained(path,local_files_only=True)
        self.model=GroundingDinoForObjectDetection.from_pretrained(path,local_files_only=True,
            device_map=device,low_cpu_mem_usage=True,
            dtype=torch.float16 if self.cuda else torch.float32,
            disable_custom_kernels=True).eval()

    def predict(self,frame):
        import cv2
        from PIL import Image
        image=Image.fromarray(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
        inputs=self.processor(images=image,text=PROMPT,return_tensors='pt').to(self.device)
        if self.cuda:
            inputs['pixel_values']=inputs['pixel_values'].half()
        context=self.torch.autocast('cuda',dtype=self.torch.float16) if self.cuda else nullcontext()
        with self.torch.inference_mode(),context:
            outputs=self.model(**inputs)
        result=self.processor.post_process_grounded_object_detection(outputs,inputs.input_ids,
            threshold=self.confidence,text_threshold=self.confidence,target_sizes=[frame.shape[:2]])[0]
        rows=[{'class':'person','confidence':float(score),'bbox':box,
                 'detector_source':'grounded_person','grounding_phrase':phrase}
            for score,box,phrase in zip(result['scores'].cpu().tolist(),result['boxes'].cpu().tolist(),
                                       result['text_labels'],strict=True)
            if any(word in phrase.split() for word in ('person','baby','infant','child'))]
        return append_grounded_people([],rows)
