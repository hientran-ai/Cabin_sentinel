import { useEffect, useState } from 'react'
import './App.css'
import './theme.css'
import { Sidebar } from './components/layout/Sidebar'
import { viewFromHash, type View } from './routing'
import { FleetView } from './pages/FleetView'
import { GuardianView } from './pages/GuardianView'
import { Overview } from './pages/Overview'
import { AgentProvider } from './store/AgentContext'

function AppContent() {
  const [view, setView] = useState<View>(() => viewFromHash(window.location.hash))
  useEffect(() => {
    const update = () => setView(viewFromHash(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  // Leaving the owner view unmounts the live camera, which stops capture.
  return <div className="app-shell">
    <Sidebar view={view} />
    {view === 'fleet' ? <FleetView /> : view === 'guardian' ? <GuardianView /> : <Overview />}
  </div>
}

export default function App() {
  return <AgentProvider><AppContent /></AgentProvider>
}
