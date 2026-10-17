import { spawnSync } from 'node:child_process'

const npmCommand = 'npm'
const productionEnv = {
  ...process.env,
  // Production browsers call the Cloudflare Worker origin. The Worker proxies
  // /api/* and /health to BACKEND_ORIGIN; never bake developer localhost URLs.
  VITE_API_BASE_URL: '',
  VITE_CAMERA_API_BASE_URL: process.env.VITE_CAMERA_API_BASE_URL || '',
  VITE_MOBILE_APP_URL: process.env.VITE_MOBILE_APP_URL || 'https://cabin-noir.duckdns.org/app/',
  VITE_AUTH_MODE: 'session',
  VITE_OWNER_WEB_URL: process.env.VITE_MOBILE_APP_URL || 'https://cabin-noir.duckdns.org/app/',
  VITE_OPERATIONS_WEB_URL: '',
}

function run(args) {
  const result = spawnSync(npmCommand, args, {
    cwd: process.cwd(), env: productionEnv, stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run(['run', 'build', '--workspace', '@cabinsentinel/operations-web'])
run(['run', 'build', '--workspace', '@cabinsentinel/cockpit-web'])
await import('./assemble-web.mjs')
