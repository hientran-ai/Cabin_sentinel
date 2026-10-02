import { useState, type FormEvent } from 'react'
import { ShieldCheck } from 'lucide-react'
import type { AcknowledgementReason } from '../../types/agent'

const reasons: { value: AcknowledgementReason; label: string }[] = [
  { value: 'CABIN_CLEAR', label: 'Cabin is clear' },
  { value: 'OCCUPANT_WITH_OWNER', label: 'Occupant is with owner' },
  { value: 'KEEP_ACTIVE', label: 'Keep event active' },
]

export function ResolutionForm({ onSubmit, pending, status, disabled = false }: {
  onSubmit: (reason: AcknowledgementReason) => Promise<void>
  pending: boolean
  status: 'NONE' | 'PENDING' | 'ACKNOWLEDGED'
  disabled?: boolean
}) {
  const [reason, setReason] = useState<AcknowledgementReason | ''>('')
  const submit = (event: FormEvent) => { event.preventDefault(); if (reason) void onSubmit(reason) }
  return <form className="resolution-form" onSubmit={submit}>
    <div className="section-title"><ShieldCheck /><div><h3>Human verification</h3><p>Confirm what you observe. The backend remains the authority for risk state.</p></div></div>
    <fieldset disabled={disabled}><legend>Resolution reason</legend>{reasons.map((item) => <label key={item.value} className="radio-option"><input type="radio" name="reason" value={item.value} checked={reason === item.value} onChange={() => setReason(item.value)} /> <span>{item.label}</span></label>)}</fieldset>
    <button className="button secondary" type="submit" disabled={disabled || !reason || pending || status === 'ACKNOWLEDGED'}>{disabled ? 'Backend endpoint unavailable' : pending ? 'Sending…' : status === 'ACKNOWLEDGED' ? 'Acknowledgement sent' : 'Send acknowledgement'}</button>
    {status === 'ACKNOWLEDGED' && <p className="form-success">Acknowledgement received. Waiting for backend state update.</p>}
  </form>
}
