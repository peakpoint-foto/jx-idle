"use strict";
/* Chơi online (PvP Công Thành Chiến): đăng ký tài khoản, heartbeat đo giờ chơi, đồng bộ save lên Worker.
   Token lưu riêng theo slot (saveKey()+"_online"), không nằm trong S, nên xuất/nhập save không mang theo token. */
const ONL_HOST = "https://jx-idle-final.khoa-vnd92.workers.dev";
const ONL_HB_MS = 60e3, ONL_SYNC_MS = 5 * 60e3, ONL_REG_MAX_LVL = 39;
// Chạy từ Worker thì gọi cùng origin; chạy cục bộ (file://, localhost, IP) thì gọi Worker đã deploy.
// window.JX_API ghi đè địa chỉ (dùng khi thử với wrangler dev).
function onlBase() {
  const h = location.hostname, local = !/^https?:$/.test(location.protocol) || h === "localhost" || h === "[::1]" || /^[\d.]+$/.test(h);
  return (window.JX_API || (local ? ONL_HOST : "")) + "/api";
}
const onlKey = () => (typeof saveKey === "function" ? saveKey() : "jx") + "_online";
function onlGet() { try { const v = JSON.parse(localStorage.getItem(onlKey()) || "null"); return v && v.token ? v : null } catch (e) { return null } }
function onlSet(v) { try { v ? localStorage.setItem(onlKey(), JSON.stringify(v)) : localStorage.removeItem(onlKey()) } catch (e) { } }
const onlEligible = () => typeof S !== "undefined" && S && S.fac && S.mode === "ctc";
const ONL = { me: null, lastSync: 0, busy: false };

async function onlApi(path, opt = {}) {
  const acc = onlGet(), headers = {};
  if (opt.body !== undefined) headers["content-type"] = "application/json";
  if (opt.auth !== false && acc) headers.authorization = "Bearer " + acc.token;
  let r;
  try {
    r = await fetch(onlBase() + path, { method: opt.method || (opt.body !== undefined ? "POST" : "GET"), headers, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive });
  } catch (e) { throw { code: "offline", msg: "Không kết nối được máy chủ online" } }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw { code: d.error || "http_" + r.status, msg: d.msg || "Lỗi máy chủ (" + r.status + ")" };
  return d;
}

function onlTurnstile(sitekey) {
  return new Promise((res, rej) => {
    const box = document.createElement("div");
    box.id = "onlTs";
    document.body.appendChild(box);
    const done = (fn, v) => { box.remove(); fn(v) };
    const go = () => { try { window.turnstile.render(box, { sitekey, callback: t => done(res, t), "error-callback": () => done(rej, { code: "captcha", msg: "Xác minh chống bot lỗi" }) }) } catch (e) { done(rej, { code: "captcha", msg: "Không tải được xác minh chống bot" }) } };
    if (window.turnstile) return go();
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.onload = go;
    s.onerror = () => done(rej, { code: "captcha", msg: "Không tải được xác minh chống bot" });
    document.head.appendChild(s);
  });
}

async function onlRegister(name) {
  if (!onlEligible()) throw { code: "not_ctc", msg: "Chỉ nhân vật Công Thành Chiến được chơi online" };
  if (S.lvl > ONL_REG_MAX_LVL) throw { code: "too_late", msg: `Chỉ đăng ký được khi nhân vật dưới cấp ${ONL_REG_MAX_LVL + 1}` };
  const cfg = await onlApi("/config", { auth: false });
  const turnstile = cfg.turnstile ? await onlTurnstile(cfg.turnstile) : "";
  const r = await onlApi("/register", { body: { name, save: pack(S), turnstile }, auth: false });
  onlSet({ id: r.id, name: r.name, token: r.token });
  S.online = { id: r.id, name: r.name };
  ONL.lastSync = Date.now();
  if (typeof save === "function") save();
  return r;
}

async function onlSync(quiet) {
  if (!onlEligible() || !onlGet() || ONL.busy) return null;
  ONL.busy = true;
  try {
    const r = await onlApi("/sync", { body: { save: pack(S) } });
    ONL.lastSync = Date.now();
    if (ONL.me && ONL.me.char) Object.assign(ONL.me.char, { power: r.power, bracket: r.bracket, flagged: r.flagged ? 1 : 0 });
    return r;
  } catch (e) {
    if (!quiet && typeof toast === "function") toast(e.msg || "Đồng bộ lỗi");
    if (e.code === "bad_token") onlSet(null);
    return null;
  } finally { ONL.busy = false }
}

async function onlRefreshMe() {
  if (!onlGet()) return null;
  try { ONL.me = await onlApi("/me") } catch (e) { if (e.code === "bad_token") onlSet(null) }
  return ONL.me;
}

// Heartbeat mỗi phút khi đã đăng ký; đồng bộ save mỗi 5 phút.
setInterval(() => {
  if (!onlEligible() || !onlGet()) return;
  onlApi("/hb", { method: "POST", keepalive: true }).then(d => { if (ONL.me) ONL.me.play_sec = d.play_sec }).catch(() => { });
  if (Date.now() - ONL.lastSync >= ONL_SYNC_MS) onlSync(true);
}, ONL_HB_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && onlEligible() && onlGet() && Date.now() - ONL.lastSync > 60e3) onlSync(true) });

/* ---- Màn tạo nhân vật: ô đăng ký online nổi bật, chỉ bật khi chọn Công Thành Chiến ---- */
const ONL_PICK_HTML = `<div class="onlpick" id="onlPick"><label><input type="checkbox" id="pfOnline" checked> <b>Đăng ký chơi Online</b><em>PvP Công Thành Chiến · có tên trên bảng xếp hạng</em></label><small id="onlPickNote"></small></div>`;
function onlPickRefresh() {
  const box = document.getElementById("onlPick");
  if (!box) return;
  const ctc = typeof PICK_MODE !== "undefined" && PICK_MODE === "ctc", cb = document.getElementById("pfOnline");
  box.classList.toggle("off", !ctc);
  if (cb) cb.disabled = !ctc;
  const note = document.getElementById("onlPickNote");
  if (note) note.textContent = ctc ? "Không đăng ký vẫn PvP được, nhưng không có tên trên bảng xếp hạng. Chỉ đăng ký được trước cấp 40." : "Chỉ dành cho chế độ Công Thành Chiến.";
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#mPick")) setTimeout(onlPickRefresh, 0) }, true);
function onlWantsRegister() { const cb = document.getElementById("pfOnline"); return !!(cb && cb.checked && !cb.disabled) }
function onlAfterCreate(want) {
  if (!want || !onlEligible()) return;
  onlRegister(S.name).then(r => {
    toast(`Đã đăng ký chơi Online: ${r.name}`);
    log(`<span class="good">Đã đăng ký chơi Online với tên <b>${esc(r.name)}</b>. Giờ chơi bắt đầu được đo.</span>`);
  }).catch(e => {
    toast(e.msg || "Đăng ký online lỗi");
    log(`<span class="bad">Chưa đăng ký online được: ${esc(e.msg || e.code || "lỗi")}. Vào Hệ thống › Chơi Online để thử lại (trước cấp 40).</span>`);
  });
}

/* ---- Thẻ Hệ thống: trạng thái online ---- */
const fmtHours = s => (s / 3600).toFixed(1) + " giờ";
const ONL_BRACKET = { so: "Sơ cấp (40–79)", trung: "Trung cấp (80–99)", cao: "Cao cấp (100–119)", thuong: "Thượng thừa (120+)" };
function onlCardHTML() {
  if (!onlEligible()) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Chơi online (PvP) chỉ dành cho nhân vật Công Thành Chiến.</small></div>`;
  const acc = onlGet();
  if (acc) {
    const me = ONL.me, ago = ONL.lastSync ? Math.round((Date.now() - ONL.lastSync) / 60e3) + " phút trước" : "chưa";
    return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <b>${esc(acc.name)}</b></div>
      <div class="row">Giờ chơi đã đo <b>${me ? fmtHours(me.play_sec) : "…"}</b></div><div class="row">Đồng bộ gần nhất <span>${ago}</span></div>
      ${me && me.char ? `<div class="row">Bậc PvP <b>${ONL_BRACKET[me.char.bracket] || "Chưa đủ cấp 40"}</b></div><div class="row">Lực chiến (máy chủ tính) <b>${fmt(me.char.power || 0)}</b></div>` : ""}
      ${me && me.flags && me.flags.length ? `<div class="onlflag"><b>Đang bị loại khỏi bảng xếp hạng vì nghi gian lận</b>${me.flags.map(f => `<small>${esc(f.detail || f.code)}</small>`).join("")}</div>` : ""}
      <div class="btnrow"><button class="btn" id="onlSyncBtn">Đồng bộ ngay</button><button class="btn" id="onlCodeBtn">Mã khôi phục</button></div>
      <small class="dim" id="onlCode" hidden>Giữ kín mã này, nó thay cho mật khẩu: <code>${esc(acc.token)}</code></small></div>`;
  }
  if (S.lvl > ONL_REG_MAX_LVL) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Nhân vật đã quá cấp ${ONL_REG_MAX_LVL}, không đăng ký bảng xếp hạng được. Vẫn PvP được (không xếp hạng).</small></div>`;
  return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <input id="onlName" maxlength="16" value="${esc(S.name || "")}" style="flex:1"></div>
    <div class="btnrow"><button class="btn" id="onlRegBtn">Đăng ký chơi Online</button></div><small class="dim">Chỉ đăng ký được trước cấp 40. Có tên trên bảng xếp hạng PvP.</small></div>`;
}
function onlCardBind() {
  const b = id => document.getElementById(id);
  if (b("onlSyncBtn")) b("onlSyncBtn").onclick = async () => { if (await onlSync(false)) { toast("Đã đồng bộ"); await onlRefreshMe(); renderMore() } };
  if (b("onlCodeBtn")) b("onlCodeBtn").onclick = () => { const c = b("onlCode"); if (c) c.hidden = !c.hidden };
  if (b("onlRegBtn")) b("onlRegBtn").onclick = async () => {
    const btn = b("onlRegBtn"); btn.disabled = true;
    try { const r = await onlRegister((b("onlName") || {}).value || S.name); toast(`Đã đăng ký chơi Online: ${r.name}`); await onlRefreshMe() } catch (e) { toast(e.msg || "Đăng ký lỗi") }
    btn.disabled = false; renderMore();
  };
}
if (typeof renderMore === "function") {
  const _renderMore = renderMore;
  renderMore = function () {
    _renderMore.apply(this, arguments);
    const t = document.getElementById("t-more");
    if (!t || !(typeof S !== "undefined" && S && S.fac)) return;
    t.insertAdjacentHTML("afterbegin", onlCardHTML());
    onlCardBind();
    if (onlGet() && !ONL.me) onlRefreshMe().then(me => { if (me && typeof curTab !== "undefined" && curTab === "more") renderMore() });
  };
}
