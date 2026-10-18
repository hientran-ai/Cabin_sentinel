// Cockpit side of the phone companion: what the cabin told the owner's phone and what the owner did. Read-only.
// "Đã xem" (acknowledge) and "đã kiểm tra cabin" (resolve) are different facts and are shown separately.
import { MessageSquareOff, PhoneOff, Smartphone } from 'lucide-react'
import { focusPhone } from '../../../e2e/focusPhone'
import { useE2e } from '../../../e2e/store'
import { useTick } from '../../../e2e/hooks'
import { clock } from '../../../e2e/hooks'
import { FEED_LABEL, PUSH_LABEL, RULE_VI } from '../../../e2e/view'
import { IC, Panel, Row, SimChip, Todo } from './parts'

export function VinfastPhoneFeature() {
  useTick(1000)
  const notes = useE2e((s) => s.notifications), state = useE2e((s) => s.state)
  const latest = notes[0], incident = state?.incident
  return (
    <Panel title="Điện thoại chủ xe" label="Điện thoại chủ xe" tag={<SimChip text="CONCEPT · MÔ PHỎNG" />}>
      <div className="vf-content" data-testid="vf-phone">
        <h3 className="vf-ctl" style={{ margin: '4px 0' }}>Xe và điện thoại phối hợp thế nào</h3>
        <div data-testid="vf-car-phone">
          <Row title="1 · Màn xe" sub={`Hiện kết quả của máy chủ · bản ghi #${state?.revision ?? '—'}`} />
          <Row title="2 · Điện thoại chủ xe" sub={notes.length ? `Đọc cùng bản ghi. Đã nhận ${notes.length} thông báo (mô phỏng)${incident?.acknowledged_at ? ', chủ xe đã xem' : ''}` : 'Đọc cùng bản ghi từ máy chủ. Chưa có thông báo'} />
          <Row title="3 · Chủ xe thao tác" sub="“Đã xem” và “Đã kiểm tra cabin” bấm trên điện thoại; màn xe đổi theo ngay" />
          <button type="button" className="vf-btn" data-testid="vf-go-phone" style={{ margin: '8px 0 4px' }} onClick={() => { focusPhone() }}><Smartphone {...IC} /> Mở điện thoại chủ xe</button>
          <p className="vf-note" style={{ margin: '6px 0 18px' }}>Thử: chọn tình huống nguy hiểm, bấm “Đã xem” trên điện thoại, rồi quay lại màn này để thấy chủ xe đã xem.</p>
        </div>
        <h3 className="vf-ctl" style={{ margin: '4px 0' }}>Thông báo cabin</h3>
        {latest ? <>
          <Row title={`Giai đoạn ${latest.stage} · revision ${latest.revision}`} sub={`${latest.rule_id ? RULE_VI[latest.rule_id] ?? latest.rule_id : latest.reason ?? ''} · gửi ${clock(latest.sent_at)}`}><span className="vf-chip">{latest.risk_level ?? '—'}</span></Row>
          <Row title="Ứng dụng chủ xe" sub={latest.channels.in_app_feed.delivered_at ? `nhận lúc ${clock(latest.channels.in_app_feed.delivered_at)}` : 'chưa có xác nhận đã nhận'}><span className="vf-body">{FEED_LABEL[latest.channels.in_app_feed.state]}</span></Row>
          <Row title="Push hệ điều hành" sub="Bộ gửi mô phỏng, không phải push thật"><span className="vf-body">{PUSH_LABEL[latest.channels.push.state]}</span></Row>
        </> : <Row title="Chưa có thông báo nào được gửi" sub="Cabin chưa có sự cố cần báo cho chủ xe" />}
        <h3 className="vf-ctl" style={{ margin: '22px 0 4px' }}>Phản hồi của chủ xe</h3>
        <Row title="Đã xem" sub="Chỉ ghi nhận chủ xe đã đọc. Sự cố vẫn mở"><span className="vf-body">{!incident ? '—' : incident.acknowledged_at ? `lúc ${clock(incident.acknowledged_at)}` : 'chưa'}</span></Row>
        <Row title="Đã kiểm tra cabin" sub="Chỉ chủ xe xác nhận trên điện thoại, sau khi có bằng chứng cabin mới"><span className="vf-body">{!incident ? '—' : incident.status === 'RESOLVED' ? `lúc ${clock(incident.resolved_at)}` : 'chưa'}</span></Row>
        <p className="vf-note" style={{ margin: '10px 0 22px' }}>Màn hình xe không có nút xác nhận hay đóng sự cố. Dùng ứng dụng điện thoại bên cạnh. Bật điều hòa hay phát nhạc không đóng sự cố.</p>
        <h3 className="vf-ctl" style={{ margin: '4px 0' }}>Cuộc gọi và tin nhắn</h3>
        <Row title="Gọi điện" sub="Không có cuộc gọi nào được thực hiện trong demo"><PhoneOff {...IC} /><Todo /></Row>
        <Row title="Tin nhắn" sub="Không gửi tin nhắn ra ngoài"><MessageSquareOff {...IC} /><Todo /></Row>
      </div>
    </Panel>
  )
}
