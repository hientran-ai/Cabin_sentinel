import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '@cabinsentinel/api-client'
import { ownerPlatformClient } from './ownerRepository'
import type { Incident, Locale } from './model'

const message = (error: unknown) => error instanceof ApiError ? error.message : error instanceof Error ? error.message : 'Request failed'

function CommandHistoryItem({ command, vehicleId, locale }: { command: Record<string, unknown>; vehicleId: string; locale: Locale }) {
  const queryClient = useQueryClient()
  const commandId = String(command.command_id)
  const pending = /pending|requested/i.test(String(command.status))
  const action = useMutation({ mutationFn: (kind: 'confirm' | 'cancel') => kind === 'confirm' ? ownerPlatformClient.v1ConfirmCommand(commandId) : ownerPlatformClient.v1CancelCommand(commandId), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vehicle-commands', vehicleId] }) })
  return <div><strong>{String(command.type).toUpperCase()}</strong><span>{String(command.status)}</span><small>{String(command.requested_at)}</small>{pending && <div className="command-row-actions"><button disabled={action.isPending} onClick={() => action.mutate('confirm')}>{locale === 'vi' ? 'Xác nhận' : 'Confirm'}</button><button disabled={action.isPending} onClick={() => action.mutate('cancel')}>{locale === 'vi' ? 'Hủy' : 'Cancel'}</button></div>}{action.error && <small>{message(action.error)}</small>}</div>
}

export function AddVehiclePanel({ locale }: { locale: Locale }) {
  const vi = locale === 'vi'
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', plate: '', model: '' })
  const create = useMutation({ mutationFn: () => ownerPlatformClient.v1CreateVehicle(form), onSuccess: () => { setForm({ name: '', plate: '', model: '' }); setOpen(false); void queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] }) } })
  const submit = (event: FormEvent) => { event.preventDefault(); create.mutate() }
  if (!open) return <button className="secondary-button" onClick={() => setOpen(true)}>+ {vi ? 'Thêm xe' : 'Add vehicle'}</button>
  return <form className="vehicle-create" onSubmit={submit}><input required placeholder={vi ? 'Tên xe' : 'Vehicle name'} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/><input placeholder={vi ? 'Biển số' : 'Plate'} value={form.plate} onChange={event => setForm({ ...form, plate: event.target.value })}/><input placeholder="Model" value={form.model} onChange={event => setForm({ ...form, model: event.target.value })}/><button className="primary-button" disabled={create.isPending}>{vi ? 'Tạo' : 'Create'}</button><button type="button" className="secondary-button" onClick={() => setOpen(false)}>{vi ? 'Hủy' : 'Cancel'}</button>{create.error && <span>{message(create.error)}</span>}</form>
}

export function IncidentControls({ incident, locale }: { incident: Incident; locale: Locale }) {
  const vi = locale === 'vi'
  const queryClient = useQueryClient()
  const ack = useMutation({ mutationFn: () => ownerPlatformClient.v1AcknowledgeIncident(incident.vehicleId, incident.id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['owner-incidents'] }) })
  const resolve = useMutation({ mutationFn: () => ownerPlatformClient.v1ResolveIncident(incident.vehicleId, incident.id, incident.revision ?? 0), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['owner-incidents'] }); void queryClient.invalidateQueries({ queryKey: ['owner-vehicles'] }) } })
  if (incident.status === 'RESOLVED') return <div className="backend-action-note">{vi ? 'Incident đã được backend ghi nhận là RESOLVED.' : 'The backend records this incident as RESOLVED.'}</div>
  return <section className="surface backend-controls"><div><span className="eyebrow">{vi ? 'Vòng đời incident' : 'Incident lifecycle'}</span><h2>{vi ? 'Hành động được backend xác minh' : 'Backend-verified actions'}</h2><p>{vi ? 'Acknowledge không đánh dấu cabin an toàn. Resolve chỉ thành công khi backend xác minh đúng revision và cabin đã được kiểm tra.' : 'Acknowledgement never marks the cabin safe. Resolution succeeds only when the backend verifies the exact revision and cabin check.'}</p></div><div><button className="secondary-button" disabled={ack.isPending || Boolean(incident.acknowledgedAt)} onClick={() => ack.mutate()}>{incident.acknowledgedAt ? (vi ? 'Đã xác nhận' : 'Acknowledged') : (vi ? 'Xác nhận đã nhận cảnh báo' : 'Acknowledge')}</button><button className="primary-button" disabled={resolve.isPending || incident.revision == null} onClick={() => resolve.mutate()}>{vi ? 'Xác nhận đã kiểm tra cabin' : 'Confirm cabin checked'}</button></div>{(ack.error || resolve.error) && <div className="account-notice is-error">{message(ack.error || resolve.error)}</div>}</section>
}

export function CommandPanel({ vehicleId, incidentId, locale }: { vehicleId: string; incidentId?: string; locale: Locale }) {
  const vi = locale === 'vi'
  const queryClient = useQueryClient()
  const commands = useQuery({ queryKey: ['vehicle-commands', vehicleId], queryFn: () => ownerPlatformClient.v1VehicleCommands(vehicleId), refetchInterval: 5_000 })
  const request = useMutation({ mutationFn: (type: 'horn' | 'sms' | 'unlock') => ownerPlatformClient.v1RequestCommand(vehicleId, type, incidentId), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['vehicle-commands', vehicleId] }) })
  const pairing = useMutation({ mutationFn: () => ownerPlatformClient.v1IssuePairingCode(vehicleId) })
  return <section className="surface command-panel"><div className="section-heading"><div><span className="eyebrow">{vi ? 'Phản ứng từ xa' : 'Remote response'}</span><h2>Command lifecycle</h2><p>{vi ? 'Backend có thể khóa toàn bộ command theo chính sách production.' : 'Production policy may lock all remote commands.'}</p></div></div><div className="command-buttons"><button disabled={request.isPending} onClick={() => request.mutate('horn')}>{vi ? 'Yêu cầu còi' : 'Request horn'}</button><button disabled={request.isPending} onClick={() => request.mutate('sms')}>{vi ? 'Yêu cầu SMS' : 'Request SMS'}</button><button disabled={request.isPending} onClick={() => request.mutate('unlock')}>{vi ? 'Yêu cầu mở khóa' : 'Request unlock'}</button><button disabled={pairing.isPending} onClick={() => pairing.mutate()}>{vi ? 'Tạo mã ghép thiết bị' : 'Create pairing code'}</button></div>{pairing.data && <div className="backend-action-note"><strong>{vi ? 'Mã dùng một lần:' : 'One-time code:'} {String(pairing.data.code)}</strong><span>{vi ? 'Hết hạn:' : 'Expires:'} {String(pairing.data.expires_at)}</span></div>}{(request.error || pairing.error) && <div className="account-notice is-error">{message(request.error || pairing.error)}</div>}<div className="command-history">{commands.data?.commands.map(command => <CommandHistoryItem key={String(command.command_id)} command={command} vehicleId={vehicleId} locale={locale}/>)}</div></section>
}
