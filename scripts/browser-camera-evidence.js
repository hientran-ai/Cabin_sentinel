// Test observer only: keeps metadata, never image bytes or session credentials.
window.__cameraEvidence = []
const cameraOriginalFetch = window.fetch.bind(window)
window.fetch = async (...args) => {
  const response = await cameraOriginalFetch(...args)
  const url = String(args[0])
  if (url.includes('/gradio_api/call/') && (args[1]?.method || 'GET') === 'GET') {
    void response.clone().text().then(text => {
      const raw = text.split(/\r?\n\r?\n/).find(x => x.includes('event: complete'))?.split(/\r?\n/).find(x => x.startsWith('data:'))?.slice(5)
      if (raw) {
        const s = JSON.parse(raw)[0]
        window.__cameraEvidence.push({ op: url.split('/call/')[1].split('/')[0], at: new Date().toISOString(), revision: s.revision,
          risk: s.risk_level, current: s.decision_current, camera: s.camera, frame: s.frame, detections: s.vision_detections,
          actions: s.actions, quality: s.data_quality, error: s.code })
      }
    }).catch(() => {})
    if (window.__delayCameraStopMs && url.includes('/call/camera_stop/')) {
      window.__cameraStopDelayed = true
      await new Promise(resolve => setTimeout(resolve, window.__delayCameraStopMs))
      window.__cameraStopDelivered = true
    }
  }
  return response
}
