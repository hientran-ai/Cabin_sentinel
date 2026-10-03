import { Check, CircleDashed, Clock3, FlaskConical, LoaderCircle, TriangleAlert, X } from 'lucide-react'
import type { ToolResult } from '../../types/agent'

const labels: Record<ToolResult['action'], string> = {
  TRIGGER_HORN: 'Sound horn',
  CRACK_WINDOW: 'Crack window',
  SEND_SMS: 'Notify contacts',
  SEND_NOTIFICATION: 'Send notification',
  REQUEST_UNLOCK: 'Request unlock',
  UNKNOWN_ACTION: 'Unrecognized backend action',
}

export function ActionProgress({ tools }: { tools: ToolResult[] }) {
  return <div className="action-progress" aria-label="Emergency action progress" aria-live="polite" aria-atomic="false">
    {tools.map((tool, index) => {
      const Icon = tool.status === 'SUCCESS' ? Check : tool.status === 'FAILED' ? X : tool.status === 'RUNNING' ? LoaderCircle : tool.status === 'SIMULATED' ? FlaskConical : tool.status === 'PENDING_CONFIRMATION' ? Clock3 : CircleDashed
      return <div className={`tool-row tool-${tool.status.toLowerCase()}`} key={tool.actionKey ?? `${tool.action}-${index}`}>
        <Icon aria-hidden="true" className={tool.status === 'RUNNING' ? 'spin' : ''} />
        <div><strong>{labels[tool.action]}</strong><span>{tool.message ?? tool.status.toLowerCase()}</span></div>
        {tool.revision !== undefined && <small>Recorded at revision {tool.revision} · {tool.incidentId ?? 'no incident'}</small>}
        <small>{tool.latencyMs ? `${tool.latencyMs} ms` : tool.status}</small>
      </div>
    })}
    {tools.some((tool) => tool.status === 'FAILED') && <p className="fallback" role="alert"><TriangleAlert /> One or more actions failed. Call emergency services and keep this event active.</p>}
  </div>
}
