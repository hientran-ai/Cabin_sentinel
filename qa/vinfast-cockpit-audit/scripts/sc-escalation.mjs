// CS-12 alert persists without acknowledgement: escalation at 90 s, repeats, Cabin Care auto-start countdown.
import { open, watch } from './lib.mjs'
const h = await open({ out: 'evidence/sc-escalation' })
const extra = []
try {
  await h.page.click('[data-testid=sc-child-hot]')
  for (let i = 0; i < 150; i++) {
    const s = await h.page.evaluate(() => { const e = window.__e2e.getState(), st = e.state; return { t: Math.round(performance.now() / 1000), rev: st?.revision, risk: st?.risk_level, alert: st?.alert, care: st?.care && { status: st.care.status, auto: st.care.auto_consent, countdown: st.care.countdown, started_by: st.care.started_by, plan: st.care.plan?.map((p) => p.tool + ':' + (p.status ?? p.skipped)) }, notes: e.notifications.map((n) => `${n.notification_id}:${n.stage}#${n.sequence}:${n.risk_level}:${n.channels.push.state}`), ledger: st?.action_ledger?.slice(0, 6).map((a) => `${a.tool}:${a.status}`), climate: window.__vehicle.getState().climate.enabled } })
    extra.push(s)
    if (i % 15 === 0 || (s.alert && s.alert.escalated_at && !extra.some((x, j) => j < extra.length - 1 && x.alert?.escalated_at))) await h.shot(`t${String(i).padStart(3, '0')}`)
    await new Promise((r) => setTimeout(r, 1000))
  }
} catch (e) { extra.push({ error: String(e) }) } finally { h.save('escalation.json', extra); h.save('console.json', h.log) }
const ph = h.phone(); h.save('phone-final.txt', await ph.evaluate(() => document.body.innerText))
await h.shot('final', true)
await h.b.close()
