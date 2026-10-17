// ILLUSTRATIVE ADAS FIXTURE. A fixed, hand-written scene so the vehicle pane is not an empty box.
// It is NOT connected to the cabin camera (YOLO), the risk engine, telemetry or any action, and it never changes by itself.
// Nothing here is a measurement: no distances, no detections, no collision logic, no "assist is on" claim.
export const ADAS_FIXTURE = {
  source: 'ILLUSTRATIVE_FIXTURE' as const,
  road: { width: 9.6, length: 260 },
  laneLines: [-1.95, 1.95],                      // z of the two lane lines, metres from the ego centre line
  laneStrip: { from: 3, to: 95, halfWidth: 1.7 }, // pale cyan strip over the ego lane
  distantVehicles: [                              // two sparse silhouettes, far away, never moving
    { x: 44, z: 0, length: 4.5, width: 1.8, height: 1.45 },
    { x: 72, z: 3.9, length: 4.7, width: 1.9, height: 1.5 },
  ],
  label: 'ADAS minh họa · Mô phỏng',
} as const
