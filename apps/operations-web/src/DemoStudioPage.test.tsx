import { describe, expect, it, vi } from 'vitest'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '@cabinsentinel/auth'
import type { V1DemoStatus } from '@cabinsentinel/contracts'

vi.mock('./data', () => ({ vehicleId: 'VF8-DEMO-01', platformClient: {}, client: {} }))
const storage = (value: string | null) => ({ getItem: () => value, setItem: () => undefined })
vi.stubGlobal('localStorage', storage(null))

const { DemoStudioPage, DEMO_STATUS_KEY } = await import('./DemoStudioPage')
const { LocaleProvider } = await import('./i18n')

const status: V1DemoStatus = {
  enabled: true, label: 'SIMULATED',
  scenarios: ['SAFE', 'WARNING', 'CRITICAL', 'RAMP', 'OFFLINE'].map(id => ({ id, label: id.toLowerCase(), description: `${id} description` })) as V1DemoStatus['scenarios'],
  vehicles: [
    { vehicle_id: 'VF8-DEMO-01', name: 'Family SUV', scenario: 'CRITICAL', risk_level: 'CRITICAL', online: true, temperature_c: 39.2, active_incident: 'inc-1', data_source: 'SIMULATED' },
    { vehicle_id: 'VF9-DEMO-02', name: 'School-run MPV', scenario: 'WARNING', risk_level: 'SAFE', online: true, temperature_c: 24, active_incident: null, data_source: 'SIMULATED' },
  ],
  notifications: { ntfy: true, telegram: false, recent: [{ at: '2026-10-12T03:00:00Z', channel: 'ntfy', ok: true, detail: 'sent' }] },
  last_error: null,
}

function render(data: V1DemoStatus | undefined, locale: 'vi' | 'en' = 'vi') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (data) queryClient.setQueryData(DEMO_STATUS_KEY, data)
  vi.stubGlobal('localStorage', storage(locale))  // the default locale follows the browser, so pin it
  const html = renderToString(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter><AuthProvider config={{ apiBaseUrl: 'http://x', mode: 'mock', ownerUrl: 'https://cabin.example/overview', operationsUrl: 'https://cabin.example/admin' }}>
        <LocaleProvider><DemoStudioPage/></LocaleProvider>
      </AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  )
  vi.stubGlobal('localStorage', storage(null))
  return html
}

describe('DemoStudioPage', () => {
  it('shows the SIMULATED badge, the six-step flow, a card per demo vehicle, the channels and the virtual device panel in Vietnamese', () => {
    const html = render(status)
    expect(html).toContain('DỮ LIỆU MÔ PHỎNG')
    expect(html).toContain('SIMULATED')
    expect(html).toContain('Luồng thử nghiệm')
    expect((html.match(/class="studio-step /g) ?? []).length).toBe(6)
    expect(html).toContain('data-testid="demo-vehicle-VF8-DEMO-01"')
    expect(html).toContain('data-testid="demo-vehicle-VF9-DEMO-02"')
    for (const id of ['SAFE', 'WARNING', 'CRITICAL', 'RAMP', 'OFFLINE']) expect(html).toContain(`>${id}</button>`)
    expect(html).toContain('39.2 °C')
    expect(html).toContain('Gửi tin thử')
    expect(html).toContain('Đặt lại demo')
    expect(html).toContain('Thiết bị ảo')
    expect(html).toContain('Tạo xe ảo')
    expect(html).toContain('href="/admin/incidents"')
    expect(html).toContain('href="/admin/devices"')
  })

  it('marks the card as settling while the live risk has not caught up with the scenario', () => {
    expect(render(status)).toContain('đang cập nhật')
  })

  it('links the owner site and the live camera page from step 6', () => {
    const html = render(status)
    expect(html).toContain('href="https://cabin.example/overview"')
    expect(html).toContain('href="https://cabin.example/cabin#live-camera"')
  })

  it('has an English version', () => {
    const html = render(status, 'en')
    expect(html).toContain('SIMULATED DATA')
    expect(html).toContain('Test flow')
    expect(html).toContain('Send test message')
  })

  it('renders a loading state before the first status arrives, without inventing vehicles', () => {
    const html = render(undefined)
    expect(html).toContain('Đang tải')
    expect(html).not.toContain('demo-vehicle-')
  })
})
