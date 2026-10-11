// Which half of the History page was open last (alerts by default), remembered per browser only.
const KEY = "cn.histTab";
export function loadTab() { try { return localStorage.getItem(KEY) === "activity" ? "activity" : "alerts"; } catch { return "alerts"; } }
export function saveTab(t) { try { localStorage.setItem(KEY, t); } catch { /* optional */ } }
