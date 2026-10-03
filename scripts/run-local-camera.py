"""Local verification server using existing camera contract and real YOLO on CPU.
Not a replacement or publication of the Hugging Face deployment.
"""
import os
import sys
from pathlib import Path

workspace = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(workspace / 'deploy/huggingface'))
os.environ.setdefault('CABINSENTINEL_DB_PATH', '/private/tmp/cabinsentinel-realtime-test.db')
os.environ.setdefault('MODEL_PATH', str(workspace / 'handoff/CabinSentinel-V1-demo-assets/yolov8n.pt'))
os.environ.setdefault('APP_ENV', 'development')
os.environ.setdefault('CORS_ORIGINS', 'http://127.0.0.1:5173,http://127.0.0.1:5183')
os.environ.setdefault('YOLO_CONFIG_DIR', '/private/tmp/cabinsentinel-yolo-config')
os.environ.setdefault('YOLO_AUTOINSTALL', 'false')

import gradio as gr
from src.cabinsentinel.camera import CameraSessions, CameraError
from src.cabinsentinel.service import CabinService
from src.cabinsentinel.timer import SafetyTimer
from src.vision.provider import TamVisionProvider

provider = TamVisionProvider(os.environ['MODEL_PATH'], confidence=0.25, device='cpu')
# Warm the model before capture; no camera evidence is fabricated or ingested.
provider.infer((workspace / 'Cabin-frontend/docs/integration-evidence/synthetic-empty.png').read_bytes())
sessions = CameraSessions(CabinService(os.environ['CABINSENTINEL_DB_PATH']))
timer = SafetyTimer(sessions)

def run(method, *args):
    try: return getattr(sessions, method)(*args)
    except CameraError as exc: return {'error': exc.message, 'code': exc.code, 'decision_current': False}

def start(scenario, source): return run('start', scenario, source)
def status(session_id, session_token): return run('status', session_id, session_token)
def stop(session_id, session_token): return run('stop', session_id, session_token)
def report(session_id, session_token, device_status): return run('report', session_id, session_token, device_status)
def frame(session_id, session_token, image, sequence, captured_at): return run('frame', session_id, session_token, image, sequence, captured_at, provider.infer)

with gr.Blocks() as demo:
    gr.Markdown('Local camera integration verification · YOLO CPU · vehicle/actions SIMULATED')
    scenario = gr.Textbox(value='hot_locked'); source = gr.Textbox(value='browser'); sid = gr.Textbox(); token = gr.Textbox(type='password')
    image = gr.Image(type='pil'); sequence = gr.Number(precision=0); captured = gr.Textbox(); device = gr.Textbox(); result = gr.JSON()
    for name, fn, inputs in [('camera_start', start, [scenario, source]), ('camera_status', status, [sid, token]), ('camera_stop', stop, [sid, token]), ('camera_report', report, [sid, token, device])]:
        gr.Button(name).click(fn, inputs=inputs, outputs=result, api_name=name, queue=False)
    gr.Button('camera_frame').click(frame, inputs=[sid, token, image, sequence, captured], outputs=result, api_name='camera_frame', concurrency_limit=1)

timer.start()
try:
    demo.queue().launch(server_name='127.0.0.1', server_port=7861, show_error=False, allowed_paths=[])
finally:
    timer.stop()
