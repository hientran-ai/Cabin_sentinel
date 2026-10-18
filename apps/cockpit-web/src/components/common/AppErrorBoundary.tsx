import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Last-resort rendering recovery. API failures are handled before they reach components. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    console.error('[CabinSentinel UI]', { event: 'render_failure', state: 'UNKNOWN' })
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main role="alert" style={{ minHeight: '100vh', background: '#081426', color: '#fff', padding: '32px', fontFamily: 'system-ui' }}>
      <h1>Chưa thể hiển thị dữ liệu cabin</h1><p>Trạng thái UNKNOWN — chưa có đủ dữ liệu để xác minh. Sự cố trên máy chủ không được tự đóng.</p>
      <button type="button" onClick={() => this.setState({ failed: false })} style={{ minHeight: 48, padding: '12px 24px' }}>Thử lại</button>
      <a href="/cockpit/vinfast/" style={{ color: '#8bc6ff', display: 'inline-block', padding: 16 }}>Tải lại trải nghiệm</a>
    </main>
  }
}
