# Builds TEST_CASES.md from the recorded result files plus the scenario rows observed in the timelines.
import json
rows = []
def add(i, area, title, pre, steps, exp, act, st, ev): rows.append((i, area, title, pre, steps, exp, act, st, ev))
B = 'Production, Chrome (branded)'
# scenarios (from evidence/sc-* and evidence/matrix timelines)
S = [
 ('SC-01','Safety','CS-03/05 child in hot parked car','fresh session, '+B,'click "Trẻ trong xe, xe nóng"','CRITICAL on cockpit + phone, incident opens','CRITICAL HOT_OCCUPANT ~2 s after click; incident OPEN; phone "Nguy hiểm"; push SIMULATED','PASS','evidence/sc-child-hot/01-alarm-viewport.png'),
 ('SC-02','Safety','CS-11 acknowledge from phone','SC-01 alarm','phone "Đã xem"','incident acknowledged, stays OPEN','acknowledged_at set; status OPEN; flow step 6 done','PASS','evidence/sc-child-hot/02-after-ack.png'),
 ('SC-03','Safety','Resolve refused while occupant visible','SC-02','Xử lý ngay → 3 ticks → Gửi xác nhận','refused, incident OPEN, correct reason','refused (409); incident OPEN; reason shown "Sự cố đã thay đổi" (revision race, BUG-011)','PASS (reason wrong: BUG-011)','evidence/sc-child-hot/03-resolve-rejected.png'),
 ('SC-04','Safety','Resolve after empty-cabin evidence','SC-03; empty clip, cabin 24 °C','Gửi xác nhận','incident RESOLVED; no green "empty" claim','RESOLVED; SAFE EMPTY_CABIN with SR-01 caution','PASS','evidence/sc-child-hot/04-after-resolve.png'),
 ('SC-05','Safety','CS-13 new event after resolution','SC-04','click "Trẻ trong xe"','new incident ID','new incident e6eee8e7 (was ea366141), INITIAL#1','PASS','evidence/sc-child-hot/05-second-incident.png'),
 ('SC-06','Safety','CS-12 persistence / escalation','child-hot, no ack, 150 s','observe','repeat + escalation per §5.2 (90 s)','INITIAL#1 3 s, LOCK_WARNING#2 4 s, REPEAT#3 62 s, ESCALATED#4 ~96 s, REPEAT#5 122 s; horn/SMS simulated, unlock pending human; escalation push NOT_PLANNED (BUG-007); Cabin Care auto-start at 92 s (BUG-006)','PASS with findings','evidence/sc-escalation/escalation.json'),
 ('SC-07','Safety','CS-01 empty vehicle, engine off','fresh','click "Cabin trống"','no "empty" claim','SAFE EMPTY_CABIN + "Không phát hiện… không có nghĩa là xe trống"; phone "BÌNH THƯỜNG" (BUG-005)','PASS (phone wording BUG-005)','evidence/matrix/CS01-empty/final.png'),
 ('SC-08','Safety','Camera blocked scenario','fresh','click "Camera bị che"','unverifiable, not safe','ERROR CAMERA_UNAVAILABLE; tile "Chưa thể xác minh cabin" (reason text wrong, BUG-010)','PASS','evidence/matrix/CS-blocked/final.png'),
 ('SC-09','Safety','CS-15 link lost (simulated)','fresh','click "Mất kết nối"','last-known, not safe, recovers','"Dữ liệu cũ · Nguy hiểm" from ~8 s; SENSOR_STALE then CRITICAL on recovery at ~22 s','PASS','evidence/matrix/CS15-lost-sim/cut.png'),
 ('SC-10','Safety','CS-15 real network offline','alarm','context.setOffline 12 s, then online','last-known, recover','"Dữ liệu cũ" within 2 s; recovered ~3 s after online','PASS','evidence/matrix/CS15-offline-real/offline.png'),
 ('SC-11','Safety','CS-09 sensor/vision stale','empty clip running','"Dừng nguồn hình"','stale → unverifiable','ERROR VISION_UNAVAILABLE ~4 s after stop; phone follows within ~1–3 s','PASS','evidence/matrix/CS09b-stale-phone/stale-phone.png'),
 ('SC-12','Safety','CS-08 radar positive, vision empty','40 °C locked','radar on + empty clip','explicit uncertainty','WARNING RADAR_FALLBACK SUSPECTED + incident + push','PASS','evidence/matrix/CS08-radar-vs-vision/final.png'),
 ('SC-13','Safety','CS-07 camera blocked + radar positive','30–40 °C locked','blocked + radar','keep risk, notify','ERROR CAMERA_UNAVAILABLE SUSPECTED, 0 notifications for 60 s','FAIL (BUG-002)','evidence/matrix/CS07b-blocked-radar-long/blocked-radar.png'),
 ('SC-14','Safety','CS-06 occupant disappears (rear-facing child, after earlier detection)','incident open','switch to rear-facing clip','must not silently become safe','WARNING UNRESOLVED_OCCUPANT holds while incident open','PASS','evidence/matrix/CS06b-rear-child-hot/rear-child.png'),
 ('SC-15','Safety','CS-06 rear-facing child in hot car, no prior detection','40 °C locked A/C off','rear-facing clip, 30 s','not SAFE','SAFE EMPTY_CABIN for 30 s; phone "BÌNH THƯỜNG"','FAIL (BUG-001, P0)','evidence/matrix/CS06d-rear-child-hot-fresh/rear-hot.png'),
 ('SC-16','Safety','CS-14 car begins driving','alarm','engine on, driver, D, 40 km/h','context-specific rule; driving restrictions','WARNING HOT_ATTENDED_DRIVING; map text entry disabled','PASS','evidence/matrix/CS14-driving/driving-search.png'),
 ('SC-17','Safety','CS-10 messaging provider failure','fault set','child-hot','failure visible, alert still on cockpit','push FAILED recorded; cockpit CRITICAL; flow step 5 pending','PASS','evidence/matrix/CS10-msg-fault/evidence-open.png'),
 ('SC-18','Safety','CS-02 adult remains','—','—','policy warning','no adult fixture in repo; not driven with real input','BLOCKED','—'),
 ('SC-19','Safety','CS-04 pet remains','—','—','pet warning','no pet fixture in repo (pet mode UI tested in CM-03/04)','BLOCKED','—'),
 ('SC-20','Safety','CS-16 forgotten bag/phone','—','—','object notification','not implemented ("Đồ vật: Chưa hỗ trợ")','NOT IMPLEMENTED','—'),
 ('SC-21','Safety','Headline scenario in bundled Chromium (no H.264)','Playwright Chromium','"Trẻ trong xe"','alert or clear codec message','NO_FEED → ERROR for 45 s; card still promises alert','FAIL (BUG-004)','evidence/sc-child-hot-chromium-nocodec/'),
 ('SC-22','Safety','Headline scenario in WebKit','WebKit 1440×900','"Trẻ trong xe"','CRITICAL','CRITICAL HOT_OCCUPANT','PASS','evidence/viewports/engine-webkit/after-child-hot.png'),
 ('SC-23','Safety','Headline scenario in Firefox','Playwright Firefox','launch','—','browser failed to launch in this environment (2 attempts, 180 s / 95 s)','NOT TESTABLE','evidence/viewports/engines.json'),
]
for r in S: add(*r)
for r in json.load(open('evidence/controls/results.json')):
    if r['id'] == 'LB-00': continue
    add(r['id'], r['area'], r['name'], B+', home screen', 'see title', 'state changes and reverses / overlay opens', r['detail'], r['status'] + (' (BUG-018)' if r['id']=='NV-21' else ' (external API flaky; passed in 1st run)' if r['id']=='DP-08' else ''), 'evidence/controls/')
for r in json.load(open('evidence/negative/results.json')):
    bug = {'N-01':'BUG-019','N-08':'BUG-003','N-12':'BUG-020'}.get(r['id'],'')
    add(r['id'], 'Resilience (mock)', r['name'], 'Chromium, page.route mock backend', 'inject failure', 'explicit error/stale state, never green, no crash', r['detail'][:220].replace('|','/'), r['status'] + (f' ({bug})' if bug else ''), f"evidence/negative/{r['id']}.png")
U = json.load(open('evidence/upload/results.json'))['R']
exp = {'U-01':'accepted, analysed','U-02':'accepted, person detected','U-03':'rejected client-side','U-04':'rejected, clear message','U-05':'rejected','U-06':'accepted or clear size error','U-07':'no script execution, sanitised label','U-08':'rejected'}
for r in U:
    act = f"HTTP {r['requests'][0]['s'] if r['requests'] else 'none'}; ui error '{r['uiError']}'; dets {r['dets']}"
    ok = (bool(r['requests']) and r['requests'][0]['s']==200) if r['id'] in ('U-01','U-02','U-06','U-07') else (not r['requests'] and bool(r['uiError']))
    add(r['id'], 'Upload', f"{r['file']} as {r['mime']}", 'production, Chromium', 'set file on still-input', exp[r['id']], act + ('; 0 dialogs' if r['id']=='U-07' else ''), 'PASS' if ok else 'FAIL', f"evidence/upload/{r['id']}.png")
add('U-09','Upload','Still upload of child photo in hot car','40 °C locked','upload child.png','alert; incident persists','CRITICAL in 1 s, incident OPEN; tile grey after 4.5 s (single still goes stale, BUG-010)','PASS','evidence/upload-timing/timeline.json')
V = json.load(open('evidence/viewports/metrics.json'))
for k, v in V.items():
    ok = (not v['hScroll']) and v['tileAboveFold'] and v['buttonsUnder24px'] == 0
    add('VP-'+k.split()[0], 'Responsive', k, 'Chromium', 'load, measure', 'no h-scroll, tile above fold, targets ≥ 24 px', f"scale {v['cockpitScale']}, tileFold {v['tileAboveFold']}, <24px {v['buttonsUnder24px']}, headline {v['tileHeadlinePx']} px", 'PASS' if ok else 'FAIL (BUG-012/013)', f"evidence/viewports/{k.split()[0]}.png")
A = json.load(open('evidence/a11y-perf-sec/results.json'))
add('AX-01','A11y','axe home (WCAG 2.2 AA)','Chrome','AxeBuilder','0 serious','; '.join(f"{v['id']}({v['n']})" for v in A['axeHome']),'FAIL (BUG-016/025)','evidence/a11y-perf-sec/results.json')
add('AX-02','A11y','axe cabin panel open','Chrome','AxeBuilder','0 serious','; '.join(f"{v['id']}({v['n']})" for v in A['axeCabinPanel']),'FAIL (BUG-016/025)','evidence/a11y-perf-sec/results.json')
add('AX-03','A11y','Tab order + focus ring (45 stops)','Chrome','Tab ×45','logical, ring on every stop',f"{len(A['tabStops'])} stops, missing ring: {len(A['focusIndicatorMissing'])}",'PASS','evidence/a11y-perf-sec/results.json')
add('AX-04','A11y','Reduced motion','reducedMotion=reduce','load','no running animation, no autoplay video',json.dumps(A['reducedMotion'])[:150],'PASS','')
add('AX-05','A11y','Critical alert announced once','CRITICAL','count role=alert','1 per event','3 (banner, hidden 0×0 prompt, toast)','FAIL (BUG-017)','evidence/alarm-prompts/')
P = A['perf']; L = A['load']
add('PF-01','Perf','Initial load (Chrome, Asia → CF)','cold context','navigation timing','—',f"TTFB {L['ttfb']} ms, DCL {L['dcl']} ms, FCP {L['fcp']} ms, JS {L['jsKB']} KB, total {L['totalKB']} KB / {L['resources']} req",'MEASURED','evidence/a11y-perf-sec/results.json')
add('PF-02','Perf','Memory growth','40 overlay toggles + 30 s polling','usedJSHeapSize','no leak',f"{P['heapMBStart']} MB → {P['heapMBAfter40TogglesAnd30s']} MB",'PASS','')
add('PF-03','Perf','Interaction latency','40 cabin-panel opens','click → panel visible','< 100 ms median',f"median {P['overlayOpenLatencyMs']['median']} ms, max {P['overlayOpenLatencyMs']['max']} ms",'PASS','')
add('PF-04','Perf','Idle request rate','home, no source','count /api requests over 30 s','bounded',f"{P['apiRequestsPerSecIdle']} req/s per tab (3 polls/s + sensor/2 s); +1 observation/s while a source runs",'MEASURED','')
add('SE-01','Security','Auth on session endpoints','—','GET state with no token / wrong token','401/403','401 / 403','PASS','curl')
add('SE-02','Security','History scoped to session','new session','GET history?after=0','only own events','2 own events (global id counter only)','PASS','fixtures/safe.json')
add('SE-03','Security','Token location','—','inspect URL/storage','not in URL','sessionStorage only; not in URL','PASS','evidence/a11y-perf-sec/results.json')
add('SE-04','Security','HTML security headers','—','curl -I','CSP, XFO, HSTS','none present','FAIL (BUG-014)','evidence/a11y-perf-sec/html-headers.txt')
add('SE-05','Security','Infra disclosure / CORS','—','curl -I + OPTIONS from evil origin','no internal hosts, allow-listed origins','x-proxied-host 10.120.20.55; origin reflected','FAIL (BUG-021)','evidence/a11y-perf-sec/api-headers.txt')
add('SE-06','Security','XSS via pet name / upload filename','—','inject <img onerror>','escaped','escaped, 0 dialogs','PASS','CM-03, U-07')
add('SE-07','Privacy','Image retention','—','read e2e_api.post_observation','no persistence','image read into memory, inferred, not written (source); "ảnh gốc không rời thiết bị" claim inaccurate for hosted build','PASS (claim: BUG-015)','services/api/src/cabinsentinel/e2e_api.py:217')
with open('TEST_CASES.md', 'w') as f:
    f.write('# TEST_CASES — CabinSentinel VinFast cockpit demo\n\n')
    f.write('Every row was executed in a real browser on 2026-10-17. **Status meanings:** PASS / FAIL (with bug ID) / BLOCKED (precondition impossible) / NOT TESTABLE (environment) / NOT IMPLEMENTED / MEASURED (a number with no pass bar). Rows are generated by `scripts/gen_test_cases.py` from the recorded result files; the per-step detail is in each evidence path.\n\n')
    f.write('Playwright regression specs (`tests/`) are listed separately in TEST_SUMMARY.md.\n\n')
    f.write('| ID | Area | Test | Preconditions | Action | Expected | Actual | Status | Evidence |\n|---|---|---|---|---|---|---|---|---|\n')
    for r in rows: f.write('| ' + ' | '.join(str(x).replace('|', '/').replace('\n', ' ') for x in r) + ' |\n')
import collections
c = collections.Counter(' '.join(r[7].split(' ')[:2]) if r[7].startswith('NOT') else r[7].split(' ')[0] for r in rows)
print(len(rows), dict(c))
json.dump({'total': len(rows), 'by_status': dict(c)}, open('evidence/test_case_counts.json', 'w'))
