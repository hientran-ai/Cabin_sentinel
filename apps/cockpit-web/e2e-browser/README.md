# Browser smoke run

Drives the real page in headless Chrome (GPU on macOS) through: hot + child clip → phone incident → acknowledge → rejected close →
empty clip → accepted close → history → camera blocked. Needs the backend on :8000 with real weights and a web server for the page.

```bash
node apps/cockpit-web/e2e-browser/run.mjs 1920 1100 http://127.0.0.1:4177/cockpit/ apps/cockpit-web/e2e-browser/smoke-steps.json
```
Each step prints its observed result; the boolean steps must print `true`. Set `CHROME` for another browser binary and `SHOT_DIR` for screenshots.
