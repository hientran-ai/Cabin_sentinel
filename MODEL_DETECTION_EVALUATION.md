# Model detection evaluation

## Method

- Input: each of the 8 original supplied MP4s, not posters or generated content.
- Sampling: 10 frames per clip at 0.5–9.5 s; resize and JPEG encode as the web capture path does; submit through the local E2E API, Vision adapter, service and deterministic rules.
- Model: local stock `yolov8n.pt`, SHA-256 `f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`, confidence 0.25, CPU, COCO classes. Safety minimum remains 0.40. Age classifier disabled.
- Safety evidence: person/dog/cat remain the only living-occupant labels. Backpack/cell-phone detections are a separate `item_detections` channel and never enter occupancy, risk or action evidence.
- Ground truth: `NOT_INDEPENDENTLY_ANNOTATED`. The manifest's human-review notes are not annotated detections. Detection frequency is not unique-object tracking; no precision/recall is stated.
- Telemetry: DEMO values are explicitly simulated. Where radar is null, no telemetry packet is synthesized. Other absent demo-only settings (e.g. 25°C, 80% battery) are disclosed in the generated panel and raw evidence.

## Results

| ID | Model labels found | Not found / unsupported | Evaluation note |
|---|---|---|---|
| DEMO-01 | person, 8 frame detections | exterior/cabin location | False-positive rejection cannot be proven; no spatial model/ROI. Result stays unverified. |
| DEMO-02 | none | child seat semantics | No child/person invented; occupancy `UNKNOWN`, risk `ERROR`. |
| DEMO-03 | none | occupancy class from radar | Radar fallback is explicitly uncertain, one simulated notification. |
| DEMO-04 | person, 9 | low-light quality label | Actual model output retained; no unsupported low-light classifier. |
| DEMO-05 | person, 11 | child/age | Critical rule uses simulated context plus generic person evidence. Never labels this as child detection. |
| DEMO-06 | person 23, backpack 11, cat 2, dog 1 | phone, child/age, unique identity | Same-frame item analytics observed for backpack in this clip; frame totals do not imply unique entities. |
| DEMO-07 | person, 35 | occupant identity/seat | After driving-state regression fix, final 10-frame run reports SAFE with no incident/notification. |
| DEMO-08 | person 3, cell phone 1 | **backpack** | No two-frame backpack continuity; reminder correctly absent. This is a release-blocking quality gap for the advertised reminder scenario. |

## Interpretation and limits

The supplied clips show that inference runs through the same stock detector and rules path. They do not establish child recognition, camera placement, cabin localization, object identity/continuity, production latency, hardware execution or safety validation. DEMO-01 and DEMO-08 fail their target visual behaviors. Do not lower thresholds, infer an age, or add scenario-name detections to disguise them. A future fine-tuned/spatial model change needs annotated datasets, approved model provenance and separate safety review.

The model's raw output is preserved in `docs/final-integration-20261017/model-detection-evaluation.json`; media hashes/fallback codec hashes are in `media_inventory.json` and `codec-fallbacks.json`.
