import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { acknowledgeEvent, analyzeDemo, BACKEND_CAPABILITIES, executeEmergencyActions, fetchEventHistory, fetchSystemHealth, subscribeToAgentState, updateSimulation, USE_MOCKS } from '../api/client'
import { cloneScenario, mockHealth } from '../mocks/scenarios'
import type { AcknowledgementReason, AgentState, ConnectionState, DemoScenario, SimulationUpdate, SystemHealth, ToolResult } from '../types/agent'

interface StoreState {
  current: AgentState
  history: AgentState[]
  health: SystemHealth
  connection: ConnectionState
  actionPending: boolean
  acknowledgementPending: boolean
  analysisPending: boolean
  lastReceivedAt: number
  clockMs: number
  error?: string
}

type Action =
  | { type: 'STATE_RECEIVED'; state: AgentState; receivedAt: number }
  | { type: 'HISTORY'; history: AgentState[] }
  | { type: 'HEALTH'; health: SystemHealth }
  | { type: 'CONNECTION'; connected: boolean }
  | { type: 'ACTION_START'; eventId: string }
  | { type: 'ACTION_END'; eventId: string; state?: AgentState; error?: string }
  | { type: 'ACK_START'; eventId: string }
  | { type: 'ACK_END'; eventId: string; startedAt: number; state?: AgentState; error?: string }
  | { type: 'SIMULATION_RESULT'; startedAt: number; state: AgentState }
  | { type: 'TICK'; now: number }
  | { type: 'ERROR'; message: string }
  | { type: 'ANALYSIS_START' }
  | { type: 'ANALYSIS_END'; state?: AgentState; error?: string }

const initialAgentState = USE_MOCKS ? cloneScenario('SAFE') : {
  ...cloneScenario('ERROR'),
  eventId: 'initializing',
  ruleId: 'SYSTEM-INIT',
  reason: 'Waiting for the first verified state from the Edge unit.',
  cameraStatus: 'NO_FEED' as const,
  dataAgeMs: 3001,
  timestamp: new Date(0).toISOString(),
}

const initialHealth: SystemHealth = USE_MOCKS ? mockHealth : {
  edgeConnected: false,
  internetAvailable: false,
  cameraStatus: 'NO_FEED',
  lastHeartbeat: new Date(0).toISOString(),
}

const initialState: StoreState = {
  current: initialAgentState,
  history: [],
  health: initialHealth,
  connection: 'RECONNECTING',
  actionPending: false,
  acknowledgementPending: false,
  analysisPending: false,
  lastReceivedAt: Date.now(),
  clockMs: Date.now(),
}

function timestamp(state: AgentState): number {
  const value = Date.parse(state.timestamp)
  return Number.isFinite(value) ? value : 0
}

const emergencyActions: ToolResult['action'][] = ['TRIGGER_HORN', 'CRACK_WINDOW', 'SEND_SMS']

function runningTools(): ToolResult[] {
  return emergencyActions.map((action) => ({ action, status: 'RUNNING' }))
}

function completedTools(result?: AgentState, requestFailed = false): ToolResult[] {
  const returned = new Map(result?.toolResults.map((tool) => [tool.action, tool]))
  return emergencyActions.map((action) => returned.get(action) ?? {
    action,
    status: 'FAILED',
    message: requestFailed ? 'Result unavailable; verify manually.' : 'Backend returned no result; verify manually.',
  })
}

function reducer(state: StoreState, action: Action): StoreState {
  switch (action.type) {
    case 'STATE_RECEIVED': {
      if (timestamp(action.state) < timestamp(state.current)) return state
      const eventChanged = action.state.eventId !== state.current.eventId
      return {
        ...state,
        current: action.state,
        lastReceivedAt: action.receivedAt,
        clockMs: action.receivedAt,
        actionPending: eventChanged ? false : state.actionPending,
        acknowledgementPending: eventChanged ? false : state.acknowledgementPending,
        error: undefined,
      }
    }
    case 'HISTORY': return { ...state, history: action.history }
    case 'HEALTH': return { ...state, health: action.health }
    case 'CONNECTION': return { ...state, connection: action.connected ? 'CONNECTED' : 'RECONNECTING' }
    case 'ACTION_START': return action.eventId !== state.current.eventId ? state : {
      ...state,
      actionPending: true,
      current: { ...state.current, toolResults: runningTools() },
    }
    case 'ACTION_END': {
      if (action.eventId !== state.current.eventId) return state
      const failedTools = completedTools(action.state, Boolean(action.error))
      // Action success is never treated as event resolution; only realtime/HITL state may change risk.
      return { ...state, actionPending: false, current: { ...state.current, toolResults: failedTools }, error: action.error }
    }
    case 'ACK_START': return action.eventId === state.current.eventId ? { ...state, acknowledgementPending: true } : state
    case 'ACK_END': {
      if (action.eventId !== state.current.eventId) return state
      const receivedNewerState = state.lastReceivedAt > action.startedAt
      return {
        ...state,
        acknowledgementPending: false,
        current: action.state && !receivedNewerState ? action.state : {
          ...state.current,
          acknowledgementStatus: action.state?.acknowledgementStatus ?? state.current.acknowledgementStatus,
        },
        error: action.error,
      }
    }
    case 'SIMULATION_RESULT': return state.lastReceivedAt > action.startedAt ? state : {
      ...state, current: action.state, lastReceivedAt: Date.now(), clockMs: Date.now(), error: undefined,
    }
    case 'TICK': return { ...state, clockMs: action.now }
    case 'ERROR': return { ...state, error: action.message }
    case 'ANALYSIS_START': return { ...state, analysisPending: true, error: undefined }
    case 'ANALYSIS_END': return action.state ? {
      ...state,
      analysisPending: false,
      current: action.state,
      lastReceivedAt: Date.now(),
      clockMs: Date.now(),
      connection: 'CONNECTED',
      error: undefined,
    } : { ...state, analysisPending: false, error: action.error }
  }
}

interface AgentContextValue extends StoreState {
  runEmergencyActions: () => Promise<void>
  acknowledge: (reason: AcknowledgementReason) => Promise<void>
  simulate: (update: SimulationUpdate) => Promise<void>
  effectiveDataAgeMs: number
  analyze: (image: File, scenario: DemoScenario) => Promise<void>
  capabilities: typeof BACKEND_CAPABILITIES
}

const AgentContext = createContext<AgentContextValue | null>(null)

export function AgentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const actionFlights = useRef(new Set<string>())
  const acknowledgementFlights = useRef(new Set<string>())

  useEffect(() => subscribeToAgentState(
    (current) => dispatch({ type: 'STATE_RECEIVED', state: current, receivedAt: Date.now() }),
    (connected) => dispatch({ type: 'CONNECTION', connected }),
  ), [])

  useEffect(() => {
    void fetchEventHistory().then((history) => dispatch({ type: 'HISTORY', history })).catch(() => undefined)
    void fetchSystemHealth().then((health) => dispatch({ type: 'HEALTH', health })).catch(() => undefined)
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => dispatch({ type: 'TICK', now: Date.now() }), 500)
    return () => window.clearInterval(timer)
  }, [])

  const runEmergencyActions = useCallback(async () => {
    const eventId = state.current.eventId
    if (actionFlights.current.has(eventId)) return
    actionFlights.current.add(eventId)
    dispatch({ type: 'ACTION_START', eventId })
    try {
      dispatch({ type: 'ACTION_END', eventId, state: await executeEmergencyActions(eventId) })
    } catch (error) {
      dispatch({ type: 'ACTION_END', eventId, error: error instanceof Error ? error.message : 'Emergency action failed' })
    } finally {
      actionFlights.current.delete(eventId)
    }
  }, [state.current.eventId])

  const acknowledge = useCallback(async (reason: AcknowledgementReason) => {
    const eventId = state.current.eventId
    if (acknowledgementFlights.current.has(eventId)) return
    acknowledgementFlights.current.add(eventId)
    const startedAt = Date.now()
    dispatch({ type: 'ACK_START', eventId })
    try {
      dispatch({ type: 'ACK_END', eventId, startedAt, state: await acknowledgeEvent(eventId, reason) })
    } catch (error) {
      dispatch({ type: 'ACK_END', eventId, startedAt, error: error instanceof Error ? error.message : 'Acknowledgement failed' })
    } finally {
      acknowledgementFlights.current.delete(eventId)
    }
  }, [state.current.eventId])

  const simulate = useCallback(async (update: SimulationUpdate) => {
    const startedAt = Date.now()
    try {
      dispatch({ type: 'SIMULATION_RESULT', startedAt, state: await updateSimulation(update) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Simulation update failed'
      dispatch({ type: 'ERROR', message })
    }
  }, [])

  const analyze = useCallback(async (image: File, scenario: DemoScenario) => {
    dispatch({ type: 'ANALYSIS_START' })
    try {
      dispatch({ type: 'ANALYSIS_END', state: await analyzeDemo(image, scenario) })
    } catch (error) {
      dispatch({ type: 'ANALYSIS_END', error: error instanceof Error ? error.message : 'Image analysis failed' })
    }
  }, [])

  const effectiveDataAgeMs = state.current.dataAgeMs + Math.max(0, state.clockMs - state.lastReceivedAt)
  const value = useMemo(() => ({ ...state, effectiveDataAgeMs, runEmergencyActions, acknowledge, simulate, analyze, capabilities: BACKEND_CAPABILITIES }), [state, effectiveDataAgeMs, runEmergencyActions, acknowledge, simulate, analyze])
  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- Provider and its typed hook are one public store API.
export function useAgent(): AgentContextValue {
  const context = useContext(AgentContext)
  if (!context) throw new Error('useAgent must be used within AgentProvider')
  return context
}
