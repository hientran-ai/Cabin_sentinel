"""Record assistant visual annotations of the 32 sampled cabin frames.

Coordinates were selected from 640x360 contact sheets, independently of model
predictions, then scaled back to source resolution. This is a preliminary audit,
not independently human-reviewed ground truth. Only the two visible occupants
are labeled; indistinct foreground fragments are excluded.
"""

import json
from pathlib import Path


def main():
    folder = Path('data/person-eval-20261002')
    source = json.loads((folder / 'labels.json').read_text(encoding='utf-8'))
    # x1, y1, x2, y2 in the 640x360 preview, two occupants per frame.
    boxes = [
        [[0,0,410,360],[207,0,627,360]],
        [[0,0,410,360],[204,0,627,360]],
        [[0,0,420,360],[216,0,616,360]],
        [[0,0,424,360],[207,0,610,360]],
        [[0,0,405,360],[207,0,601,360]],
        [[0,10,398,360],[207,4,623,360]],
        [[0,7,400,360],[204,12,597,360]],
        [[0,0,408,360],[205,11,603,360]],
        [[0,0,402,360],[205,0,609,360]],
        [[0,0,395,360],[208,0,606,360]],
        [[0,0,387,360],[218,0,627,360]],
        [[0,0,397,360],[225,0,640,360]],
        [[0,0,400,360],[220,0,639,360]],
        [[20,0,405,360],[230,6,640,360]],
        [[36,0,398,360],[225,6,640,360]],
        [[25,0,354,360],[221,14,640,360]],
        [[27,0,395,360],[220,38,640,360]],
        [[36,0,395,360],[204,43,630,360]],
        [[35,0,409,360],[225,65,640,360]],
        [[36,0,409,360],[218,52,640,360]],
        [[43,0,437,360],[233,33,640,360]],
        [[49,0,435,360],[235,30,640,360]],
        [[56,2,429,360],[238,33,640,360]],
        [[51,4,427,360],[236,32,640,360]],
        [[44,18,416,360],[235,57,640,360]],
        [[47,31,417,360],[239,64,640,360]],
        [[40,33,410,360],[230,66,635,360]],
        [[43,6,405,360],[227,57,640,360]],
        [[37,0,366,360],[229,46,640,360]],
        [[38,14,364,360],[248,66,640,360]],
        [[61,22,355,360],[232,69,626,360]],
        [[53,21,354,360],[239,61,628,360]],
    ]
    expected_ids = [1,9,18,26,35,43,52,60,69,77,86,95,103,112,120,129,
                    137,146,154,163,171,180,189,197,206,214,223,231,240,248,257,266]
    if [f['frame_id'] for f in source['frames']] != expected_ids or any(
        (f['width'], f['height']) != (3840, 2160) for f in source['frames']
    ):
        raise ValueError('This annotation recipe applies only to the original 32-frame cabin sample')
    for frame, pair in zip(source['frames'], boxes):
        frame['boxes'] = [[round(v * (frame['width'] / 640 if i % 2 == 0 else frame['height'] / 360))
                           for i, v in enumerate(box)] for box in pair]
        frame['reviewed'] = True
    source['annotation_provenance'] = __doc__.strip()
    path = folder / 'labels-assistant-reviewed.json'
    with path.open('x', encoding='utf-8') as output:
        json.dump(source, output, indent=2)
    print(path)


if __name__ == '__main__':
    main()
