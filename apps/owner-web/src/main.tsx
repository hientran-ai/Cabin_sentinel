import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthCallback, AuthProvider, RequirePortal, UnifiedLoginRedirect, type AuthConfig, DEFAULT_MOBILE_APP_URL } from '@cabinsentinel/auth'
import { App } from './App'
import '@cabinsentinel/auth/styles.css'
import '@cabinsentinel/auth/form.css'
import './styles.css'
import './theme.css'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true }, mutations: { retry: false } } })
const authConfig: AuthConfig = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? 'http://localhost:8000' : window.location.origin),
  mode: import.meta.env.VITE_AUTH_MODE === 'mock' ? 'mock' : import.meta.env.VITE_AUTH_MODE === 'session' ? 'session' : import.meta.env.VITE_AUTH_MODE === 'v1-demo' || import.meta.env.DEV ? 'v1-demo' : 'session',
  ownerUrl: import.meta.env.VITE_OWNER_WEB_URL || `${window.location.origin}/overview`,
  operationsUrl: import.meta.env.VITE_OPERATIONS_WEB_URL || `${window.location.origin}/admin`,
  mobileAppUrl: import.meta.env.VITE_MOBILE_APP_URL || DEFAULT_MOBILE_APP_URL,
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider config={authConfig}><Routes><Route path="/login" element={<UnifiedLoginRedirect />} /><Route path="/user/login" element={<UnifiedLoginRedirect />} /><Route path="/signin" element={<UnifiedLoginRedirect />} /><Route path="/sign-in" element={<UnifiedLoginRedirect />} /><Route path="/auth/callback" element={<AuthCallback portal="owner" />} /><Route path="*" element={<RequirePortal portal="owner"><App /></RequirePortal>} /></Routes></AuthProvider></BrowserRouter></QueryClientProvider></React.StrictMode>,
)

// A replaced session/context module invalidates memory credentials and consumers.
// Reload all consumers together during development instead of retaining old context.
import.meta.hot?.on('vite:beforeUpdate', ({ updates }) => {
  if (updates.some(update => update.path.includes('AgentContext.tsx') || update.path.includes('/api/'))) window.location.reload()
})
