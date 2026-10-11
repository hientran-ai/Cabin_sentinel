// Thin client for the CabinSentinel API. Same origin as the page, bearer token kept in localStorage (never a cookie).
const KEY = "cn.token";
let token = null;
try { token = localStorage.getItem(KEY); } catch { /* storage blocked */ }

export const auth = {
  get token() { return token; },
  set(t) { token = t; try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function api(method, path, body, opts = {}) {
  const headers = { Accept: "application/json" };
  if (!opts.anon && token) headers.Authorization = `Bearer ${token}`;
  if (opts.deviceToken) headers.Authorization = `Bearer ${opts.deviceToken}`;
  let payload;
  if (body !== undefined && body !== null) {
    if (body instanceof Blob || body instanceof ArrayBuffer) payload = body;
    else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }
  }
  let res;
  try {
    res = await fetch(path, { method, headers, body: payload, signal: opts.signal });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new ApiError(0, "network", "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.");
  }
  if (opts.raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const d = data && data.detail;
    const code = (d && d.code) || "error";
    const message = (d && d.message) || (typeof d === "string" ? d : Array.isArray(d) ? invalid(d) : `Lỗi ${res.status}`);
    if (res.status === 401 && !opts.anon && !opts.deviceToken) window.dispatchEvent(new Event("cn:signout"));
    throw new ApiError(res.status, code, message);
  }
  return data;
}

// FastAPI field errors arrive as a list. Say which field in words instead of "Lỗi 422".
const FIELD = { name: "Tên", plate: "Biển số", phone: "Số điện thoại", code: "Mã", cls: "Lớp", pickup: "Giờ đón", dropoff: "Giờ về", relation: "Quan hệ",
  lat: "Vị trí", lon: "Vị trí", radius_m: "Bán kính", model: "Dòng xe", color: "Màu" };
function invalid(list) {
  const names = [...new Set(list.map((e) => FIELD[(e.loc || []).slice(-1)[0]]).filter(Boolean))];
  return names.length ? `Kiểm tra lại: ${names.join(", ")}.` : "Thông tin chưa hợp lệ. Kiểm tra lại các ô đã nhập.";
}

export const get = (p, o) => api("GET", p, undefined, o);
export const post = (p, b, o) => api("POST", p, b ?? {}, o);
export const put = (p, b, o) => api("PUT", p, b ?? {}, o);
export const patch = (p, b, o) => api("PATCH", p, b ?? {}, o);
export const del = (p, b, o) => api("DELETE", p, b, o);
