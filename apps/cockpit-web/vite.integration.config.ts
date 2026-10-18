import { mergeConfig } from 'vite'
import base from './vite.config'
export default mergeConfig(base, { server: { host: '127.0.0.1', port: 4187, proxy: { '/api': 'http://127.0.0.1:8012', '/health': 'http://127.0.0.1:8012' } } })
