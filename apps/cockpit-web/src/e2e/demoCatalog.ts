// Generated from the supplied manifest. Expected observations never enter inference or risk.
export interface DemoScenario { id: string; title: string; file: string; fallbackFile: string; poster: string; objective: string; observations: string[]; telemetry: Record<string, boolean | number | null>; annotationStatus: string }
export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    "id": "DEMO-01",
    "title": "Cabin trống, có người bên ngoài",
    "file": "scenarios/videos/empty-cabin-outside-person.mp4",
    "fallbackFile": "scenarios/videos/empty-cabin-outside-person.webm",
    "poster": "scenarios/posters/empty-cabin-outside-person.jpg",
    "objective": "Do not include external person as cabin occupant; negative vision alone must not claim verified empty cabin.",
    "observations": [
      "interior:no-visible-occupant",
      "exterior:person-possible"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": false,
      "radar_presence": null
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-02",
    "title": "Cabin trống",
    "file": "scenarios/videos/empty-cabin.mp4",
    "fallbackFile": "scenarios/videos/empty-cabin.webm",
    "poster": "scenarios/posters/empty-cabin.jpg",
    "objective": "If verified-empty evidence is absent, show unverified/UNKNOWN rather than fabricating SAFE.",
    "observations": [
      "interior:no-visible-occupant",
      "child-seat:possibly-empty"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": false,
      "radar_presence": false
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-03",
    "title": "Camera bị che một phần",
    "file": "scenarios/videos/camera-occluded.mp4",
    "fallbackFile": "scenarios/videos/camera-occluded.webm",
    "poster": "scenarios/posters/camera-occluded.jpg",
    "objective": "Visibility degraded; simulated fresh radar=positive. Preserve SUSPECTED presence, notify per deterministic rule and label simulated telemetry.",
    "observations": [
      "camera:partially-occluded"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": false,
      "locked": true,
      "cabin_temp_c": 40,
      "radar_presence": true
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-04",
    "title": "Ánh sáng yếu",
    "file": "scenarios/videos/low-light.mp4",
    "fallbackFile": "scenarios/videos/low-light.webm",
    "poster": "scenarios/posters/low-light.jpg",
    "objective": "Do not infer cabin empty from low confidence; show uncertainty/degraded vision when image quality invalidates inference.",
    "observations": [
      "camera:low-light",
      "interior:occupants-not-reliably-verifiable"
    ],
    "telemetry": {
      "parked": true,
      "radar_presence": null
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-05",
    "title": "Có trẻ phía sau + môi trường nóng",
    "file": "scenarios/videos/child-hot.mp4",
    "fallbackFile": "scenarios/videos/child-hot.webm",
    "poster": "scenarios/posters/child-hot.jpg",
    "objective": "Child is visually present; temperature, vehicle lock and driver departure are DEMO SIMULATION, not inferred from pixels. Validate CRITICAL according to implemented rules.",
    "observations": [
      "interior:visible-child-rear-seat"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": false,
      "locked": true,
      "driver_departed": true,
      "cabin_temp_c": 39.8,
      "radar_presence": true
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-06",
    "title": "Nhiều đối tượng trong cabin",
    "file": "scenarios/videos/mixed-occupants-pet-items.mp4",
    "fallbackFile": "scenarios/videos/mixed-occupants-pet-items.webm",
    "poster": "scenarios/posters/mixed-occupants-pet-items.jpg",
    "objective": "Check person/age-unknown, cat, bag and phone with actual model capabilities; age/identity are not guaranteed by generic person detection. Avoid unnecessary critical alert under supervised conditions.",
    "observations": [
      "interior:visible-adult-driver",
      "interior:visible-child-rear",
      "interior:cat-rear",
      "objects:backpack-front-passenger",
      "objects:phone-center"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": true,
      "cabin_temp_c": 25.5,
      "radar_presence": true
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-07",
    "title": "Xe đang chạy với người trong cabin",
    "file": "scenarios/videos/normal-driving.mp4",
    "fallbackFile": "scenarios/videos/normal-driving.webm",
    "poster": "scenarios/posters/normal-driving.jpg",
    "objective": "Vehicle-moving data is simulated. Driver with rear-seat child must not be treated as an unattended child merely from video.",
    "observations": [
      "interior:visible-adult-driver",
      "interior:visible-child-rear"
    ],
    "telemetry": {
      "parked": false,
      "ignition_on": true,
      "vehicle_moving": true,
      "cabin_temp_c": 25.0,
      "radar_presence": true
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  },
  {
    "id": "DEMO-08",
    "title": "Đồ vật để quên sau chuyến",
    "file": "scenarios/videos/forgotten-backpack.mp4",
    "fallbackFile": "scenarios/videos/forgotten-backpack.webm",
    "poster": "scenarios/posters/forgotten-backpack.jpg",
    "objective": "Backpack remains after driver exits. Trigger one reminder only when trip-end and object persistence evidence are sufficient; no emergency alert.",
    "observations": [
      "interior:driver-exits",
      "objects:backpack-remains-rear-seat"
    ],
    "telemetry": {
      "parked": true,
      "ignition_on": false,
      "trip_ended": true,
      "driver_departed": true,
      "radar_presence": false
    },
    "annotationStatus": "NEEDS_MANUAL_GROUND_TRUTH"
  }
]
