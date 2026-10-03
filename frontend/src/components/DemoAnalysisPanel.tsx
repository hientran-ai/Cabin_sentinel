import { useState, type FormEvent } from 'react'
import { ImageUp, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { DemoScenario } from '../types/agent'

const scenarios: { value: DemoScenario; label: string; description: string }[] = [
  { value: 'normal', label: 'Normal driving', description: '25°C · engine on · driver present' },
  { value: 'parked_locked', label: 'Parked & locked', description: '25°C · engine off · locked' },
  { value: 'hot_locked', label: 'Hot & locked', description: '40°C · engine off · locked' },
]

export function DemoAnalysisPanel({ pending, visionReady = true, disabledReason, error, onAnalyze }: {
  pending: boolean
  disabledReason?: string
  visionReady?: boolean
  error?: string
  onAnalyze: (image: File, scenario: DemoScenario) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [scenario, setScenario] = useState<DemoScenario>('hot_locked')
  const [validation, setValidation] = useState<string>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (disabledReason || pending) return
    if (!file) { setValidation('Choose a JPEG or PNG cabin image.'); return }
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setValidation('Only JPEG and PNG images are supported.'); return }
    if (file.size === 0) { setValidation('The image file is empty.'); return }
    if (file.size > 5 * 1024 * 1024) { setValidation('Choose an image smaller than 5 MiB.'); return }
    setValidation(undefined)
    void onAnalyze(file, scenario)
  }

  return <section className="panel demo-panel" id="backend-demo">
    <div className="panel-heading"><div><span className="eyebrow">Live backend integration</span><h2><ImageUp /> Analyze cabin image</h2></div><span className="backend-chip">API</span></div>
    <p className={`demo-readiness ${visionReady ? 'ready' : 'unavailable'}`} role="status">
      {disabledReason || (visionReady ? 'Vision model ready for image analysis.' : 'Vision model unavailable. Backend availability refreshes automatically.')}
    </p>
    <form onSubmit={submit}>
      <label className="file-picker" htmlFor="demo-image">
        <span>Cabin image</span>
        <input id="demo-image" aria-label="Cabin image" type="file" accept="image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'JPEG or PNG · backend limit 5 MiB'}</small>
      </label>
      <label className="select-label" htmlFor="demo-scenario"><span>Vehicle scenario</span><select id="demo-scenario" aria-label="Vehicle scenario" value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)}>{scenarios.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.description}</option>)}</select></label>
      {(validation || error) && <p className="form-error" role="alert">{validation || error}</p>}
      <button className="button analyze-button" type="submit" disabled={Boolean(disabledReason) || pending || !visionReady}>{pending ? <><LoaderCircle className="spin" /> Analyzing with backend… (up to 90s)</> : <><ShieldCheck /> Analyze with CabinSentinel</>}</button>
    </form>
    <p className="sim-note">Choose a real cabin photo. The vehicle scenario is simulated; risk and detections come from backend analysis. Raw image bytes are not previewed or stored by this UI.</p>
  </section>
}
