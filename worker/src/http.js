// Tiện ích HTTP dùng chung cho các route /api/*.

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

// API xác thực bằng header Bearer (không dùng cookie) nên cho phép mọi origin:
// bản chạy cục bộ (start_game.bat) cũng gọi được API trên Worker.
export const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-admin-key",
  "access-control-max-age": "86400",
};

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...CORS,
    },
  });

export async function readJson(req, maxBytes = 1 << 20) {
  const len = +req.headers.get("content-length") || 0;
  if (len > maxBytes) throw new HttpError(413, "too_large");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large");
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== "object" || Array.isArray(v)) throw 0;
    return v;
  } catch {
    throw new HttpError(400, "bad_json");
  }
}

export function bearer(req) {
  const h = req.headers.get("authorization") || "";
  const m = /^Bearer ([A-Za-z0-9_-]{20,80})$/.exec(h);
  return m ? m[1] : null;
}

const enc = new TextEncoder();

export async function sha256Hex(s) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 24) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// IP chỉ lưu dạng băm (kèm muối), dùng làm tín hiệu giới hạn tốc độ, không dùng để phạt.
export async function ipHash(req, env) {
  const ip = req.headers.get("cf-connecting-ip") || "0.0.0.0";
  return (await sha256Hex((env.IP_SALT || "jx-idle-ip") + "|" + ip)).slice(0, 24);
}
