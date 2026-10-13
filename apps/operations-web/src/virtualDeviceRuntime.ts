import { useSyncExternalStore } from 'react'
import { platformClient } from './data'
import { VirtualDevice, type VirtualDeviceApi } from './virtualDevice'
import { VirtualDeviceSession, type SessionAdminApi } from './virtualDeviceSession'

const deviceApi: VirtualDeviceApi = {
  heartbeat: (token, payload) => platformClient.v1DeviceHeartbeat(token, payload),
  ingest: (token, vehicleId, kind, payload) => platformClient.v1DeviceIngest(token, vehicleId, kind, payload),
  commands: token => platformClient.v1DeviceCommands(token),
  ack: (token, commandId, ok, detail) => platformClient.v1DeviceAck(token, commandId, ok, detail),
}

const adminApi: SessionAdminApi = {
  createVehicle: payload => platformClient.v1CreateVehicle(payload),
  issuePairingCode: vehicleId => platformClient.v1IssuePairingCode(vehicleId),
  pair: (code, serial, firmware) => platformClient.v1DevicePair(code, serial, firmware),
  revokeDevice: deviceId => platformClient.v1AdminRevokeDevice(deviceId),
  retireVehicle: vehicleId => platformClient.v1RetireVehicle(vehicleId),
}

/** One virtual device per browser tab. It lives outside React so it keeps sending while the operator browses other pages. */
export const virtualDeviceSession = new VirtualDeviceSession(adminApi, new VirtualDevice(deviceApi))

export function useVirtualDeviceSession() {
  return useSyncExternalStore(virtualDeviceSession.subscribe, virtualDeviceSession.snapshot, virtualDeviceSession.snapshot)
}

/** Closing or leaving the tab: stop at once and revoke the token with a keepalive request that survives the unload. */
function revokeOnUnload() {
  const { deviceId } = virtualDeviceSession.snapshot()
  if (!deviceId) return
  virtualDeviceSession.stopSending()
  void platformClient.request(`/api/v1/admin/devices/${encodeURIComponent(deviceId)}/revoke`, { method: 'POST', retry: false, keepalive: true }).catch(() => undefined)
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', revokeOnUnload)
