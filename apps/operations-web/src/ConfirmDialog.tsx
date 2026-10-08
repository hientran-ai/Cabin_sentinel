import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useLocale } from './i18n'

type Confirmation = {
  title: string
  description: string
  confirmLabel?: string
  tone?: 'danger' | 'warning'
  action: () => void
}

function ConfirmDialog({ confirmation, onClose }: { confirmation: Confirmation; onClose: () => void }) {
  const { bi } = useLocale()
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const panel = panelRef.current
    const focusable = panel?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
    focusable?.[0]?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !focusable?.length) return
      const first = focusable[0]!
      const last = focusable[focusable.length - 1]!
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return <div className="dialog-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <div ref={panelRef} className={`confirm-dialog ${confirmation.tone === 'danger' ? 'is-danger' : ''}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
      <span className="dialog-mark" aria-hidden="true">!</span>
      <div className="dialog-copy"><p>{bi('Xác nhận thao tác', 'Confirm operation')}</p><h2 id={titleId}>{confirmation.title}</h2><span id={descriptionId}>{confirmation.description}</span></div>
      <div className="dialog-actions"><button className="secondary-button" onClick={onClose}>{bi('Hủy', 'Cancel')}</button><button className={confirmation.tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={() => { onClose(); confirmation.action() }}>{confirmation.confirmLabel || bi('Tiếp tục', 'Continue')}</button></div>
    </div>
  </div>
}

export function useConfirmAction() {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  return {
    confirm: (options: Omit<Confirmation, 'action'>, action: () => void) => setConfirmation({ ...options, action }),
    confirmationDialog: confirmation ? <ConfirmDialog confirmation={confirmation} onClose={() => setConfirmation(null)}/> : null as ReactNode,
  }
}
