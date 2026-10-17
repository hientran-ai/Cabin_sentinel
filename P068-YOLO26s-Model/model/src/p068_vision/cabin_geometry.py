"""Explicit per-camera cabin footprint, with glass cut out of the footprint.

This implements image overlap requested by the product, not a depth estimator.
No calibration or a mismatched camera yields unknown, never guessed outside.
"""
import math

import cv2
import numpy as np


class CabinGeometry:
    def __init__(self, config):
        self.camera_id = config['camera_id']
        self.reference_size = tuple(config['reference_size'])
        if not isinstance(self.camera_id, str) or not self.camera_id:
            raise ValueError('camera_id required')
        if len(self.reference_size) != 2 or min(self.reference_size) <= 0:
            raise ValueError('Invalid reference_size')
        self.polygons = {}
        for kind in ('cabin', 'windows'):
            polygons = []
            for polygon in config[kind]:
                points = np.asarray(polygon, dtype=np.float32)
                if (points.ndim != 2 or points.shape[1] != 2 or len(points) < 3
                        or not np.isfinite(points).all() or (points < 0).any()
                        or (points > 1).any() or cv2.contourArea(points) <= 0):
                    raise ValueError('Expected nonempty normalized polygons')
                polygons.append(points)
            self.polygons[kind] = polygons
        if not self.polygons['cabin']:
            raise ValueError('Cabin footprint required')
        self._cache = None

    def mask(self, size):
        width,height = size
        if min(size) <= 0 or abs((width/height)/(self.reference_size[0]/self.reference_size[1])-1) > .01:
            raise ValueError('Camera aspect ratio differs from calibration')
        if self._cache is None or self._cache[0] != tuple(size):
            mask = np.zeros((height,width), dtype=np.uint8)
            for kind,value in (('cabin',1), ('windows',0)):
                for points in self.polygons[kind]:
                    cv2.fillPoly(mask,[np.rint(points*(width-1,height-1)).astype(np.int32)],value)
            self._cache = (tuple(size), mask)
        return self._cache[1]

    def evidence(self, box, size, *, camera_id=None):
        result = dict(label='uncertain', method='calibrated_bbox_overlap',
                      camera_id=self.camera_id, physical_membership_verified=False)
        if camera_id != self.camera_id:
            return {**result, 'reason': 'camera_not_bound'}
        try:
            mask = self.mask(size)
        except ValueError:
            return {**result, 'reason': 'aspect_ratio_mismatch'}
        if len(box) != 4 or not all(math.isfinite(v) for v in box):
            return {**result, 'reason': 'invalid_box'}
        x1,y1,x2,y2 = box
        width,height = size
        if x1 < 0 or y1 < 0 or x2 > width or y2 > height or x2 <= x1 or y2 <= y1:
            return {**result, 'reason': 'invalid_or_clipped_box'}
        crop = mask[math.floor(y1):math.ceil(y2),math.floor(x1):math.ceil(x2)]
        pixels = int(crop.sum())
        return {**result, 'label': 'inside' if pixels else 'outside',
                'reason': 'cabin_without_glass_overlap', 'overlap_pixels': pixels,
                'overlap_fraction': pixels/crop.size}
