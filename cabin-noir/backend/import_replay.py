#!/usr/bin/env python3
"""Put analysed test videos into the cabin log of a separate demo vehicle (never a real one).

Usage (inside the API container, as the app user):
  docker exec -i -u 10001 cabin-noir-api python /srv/import_replay.py - 0912345678 < replay_episodes.json
("-" reads the JSON from stdin.)
The episodes come from scripts/replay_video.py. Only labels, seats, confidences and times are stored, never frames.
Every row is labelled "simulated" (shown as "Mô phỏng"), and running it twice does not duplicate a clip."""
import json
import sys
import time

sys.path.insert(0, "/srv")
sys.path.insert(0, ".")
from app import cabinlog, db, logic            # noqa: E402

PLATE = "DEMO-VIDEO"


def main(path: str, phone: str) -> int:
    data = json.load(sys.stdin if path == "-" else open(path))
    user = db.one("SELECT id,phone,name FROM users WHERE phone=?", phone)
    if user is None:
        print("Không có tài khoản với số này.", file=sys.stderr)
        return 1
    veh = db.one("SELECT v.id FROM vehicles v JOIN members m ON m.vehicle_id=v.id WHERE m.user_id=? AND m.role='owner' AND v.plate=?", user["id"], PLATE)
    with db.tx() as conn:
        if veh is None:
            vid = logic.new_id("veh")
            conn.execute("INSERT INTO vehicles(id,pair_code,model,plate,name,color,image) VALUES(?,?,?,?,?,?,?)",
                         (vid, "CS-DEMO" + vid[-4:].upper(), "VinFast VF 8", PLATE, "Xe demo (video thử)", "white", "vf8"))
            conn.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                         (logic.new_id("mem"), vid, user["id"], user["phone"], user["name"], "owner", "active", logic.now()))
            base = logic.base_state()
            base.update({"connection": "offline", "last_seen": 0.0, "source": None, "temp_known": False, "lock_known": False, "outside_temp": None})
            logic.save_state(conn, vid, base)
            logic.add_event(conn, vid, None, "device", "Xe demo cho video thử nghiệm", "Không có thiết bị thật. Mọi dòng nhật ký ở đây là Mô phỏng.")
            print("Đã tạo xe demo", vid)
        else:
            vid = veh["id"]
        clips = data["clips"]
        total = sum(float(c["duration_s"] or 0) + 5 for c in clips)
        t = time.time() - total                      # the clips are laid end to end, all finished before now
        added = 0
        for c in clips:
            if cabinlog.import_replay(conn, vid, c, data["model"], data["sample_fps"], t):
                added += 1
            t += float(c["duration_s"] or 0) + 5
    print(f"Đã thêm {added}/{len(clips)} dòng vào nhật ký của xe {vid}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1], sys.argv[2]))
