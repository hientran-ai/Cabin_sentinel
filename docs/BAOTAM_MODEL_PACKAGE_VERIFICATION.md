# Model package verification and handoff — 2026-10-03

Task `CABIN-BAOTAM-PR-20261003`; owner BACKEND_AGENT. User authorized checking the latest P-068 model source and creating a PR into `hientran-ai/Cabin`. This candidate starts at Cabin main `7cd4955`; source is BaoTam `f7c04a0`. No new safety policy, age-to-risk mapping, detector default or public API change was approved or introduced.

## Verified

- Full Python suite: **287 passed, 11 subtests passed**. Six healthcheck cases first failed because sandbox denied binding localhost; the same tests then passed with escalation. Six new preparation tests failed before implementation and passed afterward. Dependency warnings remain (16 Gradio/Pandas deprecations).
- Focused model/inference suites: **44 passed, 11 subtests passed**, including actual domain-router checkpoint roundtrips, invalid normalization/version rejection, unknown crops, motion, overlays, H.264, privacy and artifact setup. Router roundtrips use deterministic synthetic test fixtures, not Tâm's trained checkpoint.
- Source `age.py`, `evaluation.py`, `motion.py`, `overlay.py`, `prepare_sviro.py`, `video.py` matches BaoTam byte-for-byte. CLI defaults/import formatting are adapted as recorded in the package guide.
- Public weights: YOLOv8n, YOLOv8s and YuNet hashes match the manifest. A real official YuNet download was also exercised through the setup command. The offline checkpoint check exits 1 with MISSING and `complete=false`.
- Real CPU YOLOv8s + YuNet + MOG2 + H.264 on four repeated frames of the official public bus example: four frames processed/exported, 16 person detections (4/frame), 12 face detections across frames (3/frame), decodable H.264 output. The runner and evaluation CLI work when invoked from another directory. This correlated public fixture is not cabin/person-count accuracy or motion tracking validation.
- Ruff over src/tests and added scripts, CI YAML parse, and `git diff --check`: pass. The new Docker CI step reuses the CPU image to execute optional inference suites and load the bundled face artifact.

Sanitized machine receipt: [`evidence-baotam-models/verification.json`](evidence-baotam-models/verification.json). Public detector weights are ignored local artifacts, not binaries attached to this PR; the small YuNet model and its MIT license are attached.

## Limits / pending

- Docker daemon unavailable locally, so image build/run is **NOT_VERIFIED locally**; inspect GitHub CI after push.
- `runs/age-real-router-20261002/best.pt` has no tracked file or GitHub Release asset; it is not in either inspected source checkout. Genuine trained age inference, its latest digest/license and independent real-cabin evaluation remain missing. No random/training fixture replaces it.
- Existing REST `TamVisionProvider`, VisionPayload, rules, LangGraph, CabinService, actions, HITL, TTL and persistence remain unchanged. Age CLI output is research-only and deliberately not mapped into risk or UI. Privacy miss limitations remain.
- Hosted deployment, device/hardware, current frontend flow against a deployed package, child safety and anonymization are **NOT_VERIFIED** by this patch. Publishing this PR does not publish a hosted runtime.
- RULE-26: Phoenix cohort4 dashboard and Demo Day checked 2026-10-03; web tool could not access `https://phoenix.note.transformerlabs.ai/dashboard?cohort=cohort-4` or `https://phoenix.note.transformerlabs.ai/demo-day`. Latest rubric UNVERIFIED; owner PO. No READY_TO_SUBMIT claim.

## AGENT_HANDOFF

Changed files: six BaoTam inference modules + model-assets installer, two upstream CLI tools + preparation CLI, their tests/optional-suite discovery, manifest, pinned YuNet binary/license, Docker inclusion/CI, README and package/evidence docs/AI log. No P-068 worktree files changed.

Verified behavior/tests are listed above. Remaining assumptions: no new safety mapping adopted; supplied digest will require trusted VISION_AGENT provenance, and setup integrity reports do not constitute model validation. Next owner VISION_AGENT supplies exact newest checkpoint, hash/license and evaluation. BACKEND_AGENT verifies that genuine file offline; SAFETY_AGENT/user approves any future safety mapping. DEPLOY_AGENT verifies Docker CI and publishes only on a deployment task.

CHECKPOINT CABIN-MODELS-PR-01: code and public-asset packaging prepared/tested; trained age artifact remains a blocker to the complete model set. This is a draft PR for concrete review, not a full-model or submission-readiness claim.
