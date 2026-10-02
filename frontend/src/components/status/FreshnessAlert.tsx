import { AlertTriangle } from 'lucide-react'

export function FreshnessAlert({ dataAgeMs }: { dataAgeMs: number }) {
  if (dataAgeMs <= 3000) return null
  return <div className="connection-alert stale"><AlertTriangle /> Data is stale ({(dataAgeMs / 1000).toFixed(1)}s old). Do not assume the cabin is safe.</div>
}
