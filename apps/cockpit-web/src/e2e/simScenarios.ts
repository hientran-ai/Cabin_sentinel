// Scenarios that have NO recorded footage: each declares exactly what is real and what is simulated. They set INPUTS only
// (sensor fixture, camera status, vehicle link); risk, occupancy and incidents always come back from the backend rule engine.
// The media layer, the sensor fixture and the safety evaluation are separate fields on purpose.
export interface SimScenario {
  scenario_id: 'SIM-01' | 'SIM-02'
  title: string
  /** what is shown as "the picture": never an unrelated video */
  actual_media_source: string
  simulation_type: string
  telemetry_fixture: { parked: boolean; ignition_on: boolean; locked: boolean; cabin_temp_c: number | null; radar_presence: boolean | null; vehicle_moving: boolean }
  camera_state: 'CAMERA_OK' | 'CAMERA_OCCLUDED_SUSPECTED' | 'CAMERA_NO_FRAMES' | 'CAMERA_DISCONNECTED' | 'CAMERA_PERMISSION_DENIED' | 'CAMERA_UNKNOWN'
  connectivity_state: 'CONNECTED' | 'RECONNECTING' | 'DISCONNECTED' | 'SYNCING'
  expected_behavior: string
  cleanup_strategy: string
  objective: string
}

export const SIM_SCENARIOS: SimScenario[] = [
  {
    scenario_id: 'SIM-01', title: 'Camera bị che — Mô phỏng mất tầm nhìn',
    actual_media_source: 'NONE: không có video thật của camera bị che hoàn toàn. Hiển thị bản xem trước MÔ PHỎNG, không phát video khác.',
    simulation_type: 'SIMULATED_CAMERA_OCCLUSION (camera-status BLOCKED, origin SIMULATED_FAULT)',
    telemetry_fixture: { parked: true, ignition_on: false, locked: true, cabin_temp_c: 38, radar_presence: true, vehicle_moving: false },
    camera_state: 'CAMERA_OCCLUDED_SUSPECTED', connectivity_state: 'CONNECTED',
    expected_behavior: 'Backend dùng radar mô phỏng + nhiệt độ mô phỏng, không có hình xác nhận: nghi có người, không bao giờ SAFE.',
    cleanup_strategy: 'Phiên demo mới; đổi tình huống dừng bộ phát trạng thái camera và xoá lỗi camera giả lập.',
    objective: 'Không có hình: AI Vision không xác minh được. Radar mô phỏng dương tính, nhiệt độ mô phỏng cao.',
  },
  {
    scenario_id: 'SIM-02', title: 'Mất kết nối với xe — Vehicle Offline',
    actual_media_source: 'Clip DEMO-05 thật được phân tích trước khi mất kết nối; sau đó nguồn xe ngừng gửi (mô phỏng).',
    simulation_type: 'SIMULATED_VEHICLE_LINK_DROP (POST /link DROP cho đúng phiên này)',
    telemetry_fixture: { parked: true, ignition_on: false, locked: true, cabin_temp_c: 39.8, radar_presence: true, vehicle_moving: false },
    camera_state: 'CAMERA_OK', connectivity_state: 'RECONNECTING',
    expected_behavior: 'CONNECTED → RECONNECTING → DISCONNECTED; dữ liệu cũ; cabin Chưa thể xác minh; sự cố giữ nguyên; nối lại → SYNCING → CONNECTED.',
    cleanup_strategy: 'Phiên demo mới; hủy hẹn giờ ngắt, khôi phục liên kết xe của phiên trước.',
    objective: 'Xe ngừng gửi dữ liệu trong phiên này. Không ảnh hưởng người dùng khác và không tắt máy chủ.',
  },
]
