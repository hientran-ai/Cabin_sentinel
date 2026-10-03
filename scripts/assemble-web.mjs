import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const outputDirectory = join(repositoryRoot, 'dist')
const ownerBuild = join(repositoryRoot, 'apps', 'owner-web', 'dist')
const operationsBuild = join(repositoryRoot, 'apps', 'operations-web', 'dist')

await rm(outputDirectory, { recursive: true, force: true })
await mkdir(outputDirectory, { recursive: true })
await cp(ownerBuild, outputDirectory, { recursive: true })
await cp(operationsBuild, join(outputDirectory, 'admin'), { recursive: true })
await writeFile(
  join(outputDirectory, '_redirects'),
  '/admin/* /admin/index.html 200\n/* /index.html 200\n',
  'utf8',
)

console.log('Assembled Cloudflare web bundle in dist/')
