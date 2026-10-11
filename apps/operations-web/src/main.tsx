import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthCallback, AuthProvider, RequirePortal, type AuthConfig, DEFAULT_MOBILE_APP_URL } from '@cabinsentinel/auth'
import { App } from './App'
import { LocaleProvider } from './i18n'
import { OperationsLogin } from './OperationsLogin'
import '@cabinsentinel/auth/styles.css'
import '@cabinsentinel/auth/form.css'
import './styles.css'
import './theme.css'
import { adminDemoEnabled } from './adminDemo'
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } })
const demoMode = adminDemoEnabled()
const authConfig: AuthConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin),
  mode: demoMode || import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : import.meta.env.VITE_AUTH_MODE === 'session' ? 'session' : import.meta.env.VITE_AUTH_MODE === 'v1-demo' || import.meta.env.DEV ? 'v1-demo' : 'session',
  ownerUrl: import.meta.env.VITE_OWNER_WEB_URL || `${window.location.origin}/overview`,
  operationsUrl: import.meta.env.VITE_OPERATIONS_WEB_URL || `${window.location.origin}/admin`,
  mobileAppUrl: import.meta.env.VITE_MOBILE_APP_URL ?? DEFAULT_MOBILE_APP_URL,
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider config={authConfig}><LocaleProvider><Routes><Route path="/admin/login" element={<OperationsLogin/>} /><Route path="/admin/auth/callback" element={<AuthCallback portal="operations" />} /><Route path="*" element={<RequirePortal portal="operations" loginPath="/admin/login"><App /></RequirePortal>} /></Routes></LocaleProvider></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>)
