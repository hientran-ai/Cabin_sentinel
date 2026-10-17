// node shot.mjs <url> <out.png> <w> <h> [js steps...]
import { writeFileSync } from 'node:fs'
import { open, sleep } from './cdp.mjs'
const [url, out, w = '1920', h = '1080', ...steps] = process.argv.slice(2)
const p = await open(url, +w, +h)
for (const s of steps) { const v = await p.ev(s); if (v !== undefined) console.log(JSON.stringify(v)); await sleep(1000) }
writeFileSync(out, Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'))
await p.close()
