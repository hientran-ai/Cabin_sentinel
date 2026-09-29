import './App.css'
import { Sidebar } from './components/layout/Sidebar'
import { CriticalModal } from './components/alerts/CriticalModal'
import { Overview } from './pages/Overview'
import { AgentProvider, useAgent } from './store/AgentContext'

function AppContent() {
  const agent = useAgent()
  return <div className="app-shell">
    <Sidebar />
    <Overview />
    <CriticalModal state={agent.current} actionPending={agent.actionPending} acknowledgementPending={agent.acknowledgementPending} onAction={agent.runEmergencyActions} onAcknowledge={agent.acknowledge} />
  </div>
}

export default function App() {
  return <AgentProvider><AppContent /></AgentProvider>
}
