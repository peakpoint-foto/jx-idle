// PBKDF2 password hashing via Web Crypto (Workers + Node test runtime).

const enc = new TextEncoder();
export const PBKDF2_ITERATIONS = 310_000;

export function randomSalt(bytes = 16) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64ToBytes(s) {
  const pad = (4 - (s.length % 4)) % 4;
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function hashPassword(password, saltB64) {
  const salt = b64ToBytes(saltB64);
  const key = await crypto.subtle.importKey("raw", enc.encode(String(password)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyPassword(password, saltB64, expectedHex) {
  if (!password || !saltB64 || !expectedHex) return false;
  const got = await hashPassword(password, saltB64);
  if (got.length !== expectedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}

export function recoveryCode() {
  const a = crypto.getRandomValues(new Uint8Array(15));
  const raw = btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return raw.slice(0, 4) + "-" + raw.slice(4, 8) + "-" + raw.slice(8, 12) + "-" + raw.slice(12, 20);
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export function validatePassword(pw) {
  const s = String(pw ?? "");
  if (s.length < PASSWORD_MIN) throw new Error("short");
  if (s.length > PASSWORD_MAX) throw new Error("long");
  return s;
}
