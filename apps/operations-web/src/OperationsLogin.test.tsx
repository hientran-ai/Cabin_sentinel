import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@cabinsentinel/auth', () => ({
  LoginPage: ({ portal }: { portal: string }) => <div data-portal={portal}>Login</div>,
}))

import { OperationsLogin } from './OperationsLogin'

describe('OperationsLogin', () => {
  it('opens the shared login page in the operations portal', () => {
    const html = renderToStaticMarkup(<OperationsLogin />)

    expect(html).toContain('data-portal="operations"')
  })
})
