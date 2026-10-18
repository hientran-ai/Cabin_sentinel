import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(repositoryRoot, 'dist')
const operationsBuild = join(repositoryRoot, 'apps', 'operations-web', 'dist')
const cockpitBuild = join(repositoryRoot, 'apps', 'cockpit-web', 'dist')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(operationsBuild, join(outputDirectory, 'admin'), { recursive: true })
// End-to-end demo (cockpit + owner phone). Vite base is /cockpit/, so it is served from the same origin as /api.
await cp(cockpitBuild, join(outputDirectory, 'cockpit'), { recursive: true })
// The demo is VinFast only: Tesla's Figma exports are copied from public/ by Vite but nothing in the VinFast build uses them.
await rm(join(outputDirectory, 'cockpit', 'tesla-figma'), { recursive: true, force: true })
// Workers Static Assets handles both SPA fallbacks; Pages-style redirects would loop.
await rm(join(outputDirectory, 'admin', '_redirects'), { force: true })

console.log('Assembled Cloudflare Workers bundle in dist/')
