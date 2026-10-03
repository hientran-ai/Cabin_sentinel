import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// A replaced session/context module invalidates memory credentials and consumers.
// Reload all consumers together during development instead of retaining old context.
import.meta.hot?.on('vite:beforeUpdate', ({ updates }) => {
  if (updates.some(update => update.path.includes('AgentContext.tsx') || update.path.includes('/api/'))) window.location.reload()
})
