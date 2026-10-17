"""Experimental text-guided scene masks, never an inside/outside rejection rule."""
import math
from pathlib import Path

import cv2
import numpy as np

PROMPTS = ['a person', 'car seats inside a car', 'a car dashboard',
           'a car window', 'the outdoor scenery outside a car']
LABELS = ['unknown', 'person', 'cabin_surface', 'window_or_opening']
COLORS = np.array([[0, 0, 0], [220, 100, 200], [70, 200, 70], [40, 140, 250]], dtype=np.uint8)


def semantic_labels(probabilities, threshold=.5, margin=.1):
    """Independent prompt scores are uncalibrated; ambiguous pixels stay unknown."""
    scores = np.asarray(probabilities)
    if scores.ndim != 3 or scores.shape[0] != len(PROMPTS):
        raise ValueError('Expected five probability maps')
    if not np.isfinite(scores).all() or (scores < 0).any() or (scores > 1).any():
        raise ValueError('Invalid probabilities')
    if not 0 < threshold <= 1 or not 0 <= margin <= 1:
        raise ValueError('Invalid mask thresholds')
    grouped = np.stack([scores[0], scores[1:3].max(axis=0), scores[3:5].max(axis=0)])
    best = grouped.argmax(axis=0)
    ordered = np.sort(grouped, axis=0)
    confident = (ordered[-1] >= threshold) & (ordered[-1]-ordered[-2] >= margin)
    return np.where(confident, best+1, 0).astype(np.uint8)


def context_for_box(labels, box):
    """Describe a box plus surroundings; overlap cannot establish physical membership."""
    result = dict(membership='uncertain', advisory_only=True)
    if len(box) != 4 or not all(math.isfinite(v) for v in box):
        return {**result, 'status': 'invalid_box'}
    x1, y1, x2, y2 = box
    if x2 <= x1 or y2 <= y1:
        return {**result, 'status': 'invalid_box'}
    h, w = labels.shape
    dx, dy = .15*(x2-x1), .15*(y2-y1)
    left, top = max(0, math.floor(x1-dx)), max(0, math.floor(y1-dy))
    right, bottom = min(w, math.ceil(x2+dx)), min(h, math.ceil(y2+dy))
    crop = labels[top:bottom, left:right] if right > left and bottom > top else np.empty(0)
    if not crop.size:
        return {**result, 'status': 'invalid_box'}
    return {**result, 'status': 'ok', 'context_pixel_fractions':
            {name: float(np.mean(crop == i)) for i, name in enumerate(LABELS)}}


class CabinSegmenter:
    def __init__(self, model_path, *, device='cpu', threshold=.5, margin=.1):
        import torch
        from transformers import CLIPSegForImageSegmentation, CLIPSegProcessor
        path = Path(model_path)
        if not path.is_dir():
            raise FileNotFoundError('Download CLIPSeg to a local directory first')
        self.processor = CLIPSegProcessor.from_pretrained(path, local_files_only=True, use_fast=False)
        self.model = CLIPSegForImageSegmentation.from_pretrained(
            path, local_files_only=True, use_safetensors=True).to(device).eval()
        self.device, self.threshold, self.margin = device, threshold, margin
        self.torch = torch

    def predict(self, frame):
        from PIL import Image
        image = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        text = self.processor.tokenizer(PROMPTS, padding=True, return_tensors='pt')
        images = self.processor.image_processor(images=[image]*len(PROMPTS), return_tensors='pt')
        inputs = {k: v.to(self.device) for k, v in {**text, **images}.items()}
        with self.torch.inference_mode():
            logits = self.model(**inputs).logits
            logits = self.torch.nn.functional.interpolate(
                logits[:, None], size=frame.shape[:2], mode='bilinear', align_corners=False)[:, 0]
            scores = logits.sigmoid().cpu().numpy()
        return semantic_labels(scores, self.threshold, self.margin)

    def annotate(self, frame, detections):
        labels = self.predict(frame)
        for detection in detections:
            if detection['class'] in {'person', 'adult', 'child', 'infant'}:
                detection['segmentation_context'] = context_for_box(labels, detection['bbox'])
        return labels


def draw_segments(frame, labels):
    if labels.shape != frame.shape[:2]:
        raise ValueError('Mask size does not match frame')
    blended = cv2.addWeighted(frame, .65, COLORS[labels], .35, 0)
    result = np.where((labels != 0)[..., None], blended, frame).astype(np.uint8)
    cv2.rectangle(result, (0, 0), (result.shape[1]-1, 30), (20,20,20), -1)
    cv2.rectangle(result, (0, result.shape[0]-30),
                  (result.shape[1]-1, result.shape[0]-1), (20,20,20), -1)
    cv2.putText(result, 'SEG PILOT: purple=person green=interior orange=window/outdoor',
                (8, 22), 0, .46, (255, 255, 255), 1)
    cv2.putText(result, 'ADVISORY - membership uncertain / all detections retained',
                (8, result.shape[0]-12), 0, .48, (0, 230, 255), 1)
    return result
