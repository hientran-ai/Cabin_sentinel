import type { RiskLevel } from '@cabinsentinel/contracts'

export const tokens = {
  font: { sans: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif", mono: "'SFMono-Regular', Consolas, monospace" },
  space: { 1: '0.25rem', 2: '0.5rem', 3: '0.75rem', 4: '1rem', 6: '1.5rem', 8: '2rem', 12: '3rem' },
  radius: { sm: '0.375rem', md: '0.75rem', lg: '1rem' },
  breakpoint: { tablet: '48rem', desktop: '72rem' },
  elevation: { raised: '0 8px 28px rgba(17, 24, 39, 0.08)', critical: '0 0 0 3px rgba(190, 24, 24, 0.18)' },
} as const

export const severityTokens: Record<RiskLevel, { foreground: string; background: string; border: string }> = {
  SAFE: { foreground: '#166534', background: '#f0fdf4', border: '#86efac' },
  NOTICE: { foreground: '#1e40af', background: '#eff6ff', border: '#93c5fd' },
  WARNING: { foreground: '#854d0e', background: '#fffbeb', border: '#fcd34d' },
  CRITICAL: { foreground: '#991b1b', background: '#fef2f2', border: '#f87171' },
  ERROR: { foreground: '#3f3f46', background: '#fafafa', border: '#a1a1aa' },
}
