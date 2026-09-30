import { useState, type FormEvent } from 'react'
import { ImageUp, LoaderCircle, ShieldCheck } from 'lucide-react'
import type { DemoScenario } from '../types/agent'

const scenarios: { value: DemoScenario; label: string; description: string }[] = [
  { value: 'normal', label: 'Normal driving', description: '25°C · engine on · driver present' },
  { value: 'parked_locked', label: 'Parked & locked', description: '25°C · engine off · locked' },
  { value: 'hot_locked', label: 'Hot & locked', description: '40°C · engine off · locked' },
]

export function DemoAnalysisPanel({ pending, onAnalyze }: {
  pending: boolean
  onAnalyze: (image: File, scenario: DemoScenario) => Promise<void>
}) {
  const [file, setFile] = useState<File | null>(null)
  const [scenario, setScenario] = useState<DemoScenario>('hot_locked')
  const [validation, setValidation] = useState<string>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!file) { setValidation('Choose a JPEG or PNG cabin image.'); return }
    if (!['image/jpeg', 'image/png'].includes(file.type)) { setValidation('Only JPEG and PNG images are supported.'); return }
    setValidation(undefined)
    void onAnalyze(file, scenario)
  }

  return <section className="panel demo-panel" id="backend-demo">
    <div className="panel-heading"><div><span className="eyebrow">Live backend integration</span><h2><ImageUp /> Analyze cabin image</h2></div><span className="backend-chip">API</span></div>
    <form onSubmit={submit}>
      <label className="file-picker" htmlFor="demo-image">
        <span>Cabin image</span>
        <input id="demo-image" aria-label="Cabin image" type="file" accept="image/jpeg,image/png" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        <small>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : 'JPEG or PNG · backend limit 5 MB'}</small>
      </label>
      <label className="select-label" htmlFor="demo-scenario"><span>Vehicle scenario</span><select id="demo-scenario" aria-label="Vehicle scenario" value={scenario} onChange={(event) => setScenario(event.target.value as DemoScenario)}>{scenarios.map((item) => <option key={item.value} value={item.value}>{item.label} — {item.description}</option>)}</select></label>
      {validation && <p className="form-error" role="alert">{validation}</p>}
      <button className="button analyze-button" type="submit" disabled={pending}>{pending ? <><LoaderCircle className="spin" /> Analyzing with backend…</> : <><ShieldCheck /> Analyze with CabinSentinel</>}</button>
    </form>
    <p className="sim-note">The file is sent directly to `/api/v1/demo/analyze`. This UI does not preview, persist or log raw image bytes. Risk and actions come from the backend response.</p>
  </section>
}
