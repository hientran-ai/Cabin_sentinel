// Build and host switches shared by the camera code and the screens that explain it.

/** Frames of a real camera may be SENT to the backend only when this is true. Real faces must not go to a hosted demo server by
 * default (COMPLIANCE DP-03 mask before leaving the device, DP-07 data abroad). It is on when the page is served from this machine
 * (localhost, so the frames stay on it) or when a build opts in with VITE_ENABLE_DEVICE_CAMERA=true; =false switches it off everywhere.
 * It does NOT control the local camera preview: the preview never leaves the browser and works on any https page. */
const FLAG = import.meta.env.VITE_ENABLE_DEVICE_CAMERA
const LOCAL_HOST = typeof location !== 'undefined' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
export const DEVICE_UPLOAD_ENABLED = FLAG === 'true' || (FLAG !== 'false' && LOCAL_HOST)

/** Kept for the SU7 / Tesla screens that still import the old name. */
export const DEVICE_CAMERA_ENABLED = DEVICE_UPLOAD_ENABLED
