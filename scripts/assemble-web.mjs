import { cp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(repositoryRoot, 'dist')
const operationsBuild = join(repositoryRoot, 'apps', 'operations-web', 'dist')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(operationsBuild, join(outputDirectory, 'admin'), { recursive: true })
// Workers Static Assets handles both SPA fallbacks; Pages-style redirects would loop.
await rm(join(outputDirectory, 'admin', '_redirects'), { force: true })

console.log('Assembled Cloudflare Workers bundle in dist/')
