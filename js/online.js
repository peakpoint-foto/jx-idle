"use strict";
/* Chơi online (đồng bộ / xếp hạng Công Thành Chiến): đăng ký tài khoản, heartbeat đo giờ chơi, đồng bộ save lên Worker.
   Token lưu riêng theo slot (saveKey()+"_online"), không nằm trong S, nên xuất/nhập save không mang theo token. */
const ONL_HB_MS = 60e3, ONL_SYNC_MS = 5 * 60e3, ONL_REG_MAX_LVL = 39;
// Default to the current origin, including Wrangler local. Static development
// needs an explicit local JX_API override; never silently write to production.
function onlBase() {
  return (window.JX_API || "").replace(/\/$/, "") + "/api";
}
const onlKey = () => (typeof saveKey === "function" ? saveKey() : "jx") + "_online";
function onlGet() { try { const v = JSON.parse(localStorage.getItem(onlKey()) || "null"); return v && v.token ? v : null } catch (e) { return null } }
function onlSet(v) { try { v ? localStorage.setItem(onlKey(), JSON.stringify(v)) : localStorage.removeItem(onlKey()) } catch (e) { } }
const onlEligible = () => typeof S !== "undefined" && S && S.fac && S.mode === "ctc";
const ONL = { me: null, lastSync: 0, busy: false, serverNow: 0 };

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
  if (r.character_id) S.cid = r.character_id;
  onlSet({ id: r.id, name: r.name, token: r.token });
  S.online = { id: r.id, name: r.name };
  ONL.lastSync = Date.now();
  if (typeof save === "function") save();
  return r;
}

async function onlSync(quiet) {
  if (!onlEligible() || !onlGet() || ONL.busy) return null;
  if (ONL.me && ONL.me.char && ONL.me.char.character_id && S.cid && ONL.me.char.character_id !== S.cid) {
    onlSet(null); ONL.me = null;
    if (!quiet) toast("Mã online thuộc nhân vật khác — đã ngắt liên kết");
    return null;
  }
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
  try {
    const me = await onlApi("/me");
    if (me && me.char && me.char.character_id && S.cid && me.char.character_id !== S.cid) {
      onlSet(null); ONL.me = null;
      return null;
    }
    ONL.me = me;
  } catch (e) { if (e.code === "bad_token") onlSet(null) }
  return ONL.me;
}

async function onlRecover(token) {
  const old = onlGet(), value = String(token || "").trim();
  if (value.length < 16) throw { code: "bad_token", msg: "Mã khôi phục không hợp lệ" };
  onlSet({ token: value });
  try {
    let me = await onlApi("/me");
    if (!me || !me.char || me.char.fac !== S.fac) throw { code: "character_mismatch", msg: "Mã không thuộc nhân vật cùng môn phái" };
    if (me.char.character_id && S.cid && me.char.character_id !== S.cid)
      throw { code: "character_mismatch", msg: "Mã khôi phục thuộc nhân vật khác" };
    if (!me.char.character_id) {
      await onlApi("/recover", { method: "POST", body: { character_id: S.cid, fac: S.fac } });
      me = await onlApi("/me");
    }
    onlSet({ id: me.id, name: me.name, token: value });
    ONL.me = me; ONL.lastSync = Date.now(); save();
    return me;
  } catch (e) { onlSet(old); throw e }
}

// Heartbeat mỗi phút khi đã đăng ký; đồng bộ save mỗi 5 phút.
setInterval(() => {
  if (!onlEligible() || !onlGet()) return;
  onlApi("/hb", { method: "POST", keepalive: true }).then(d => { ONL.serverNow = d.server_now || 0; if (ONL.me) ONL.me.play_sec = d.play_sec }).catch(() => { });
  if (Date.now() - ONL.lastSync >= ONL_SYNC_MS) onlSync(true);
}, ONL_HB_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && onlEligible() && onlGet() && Date.now() - ONL.lastSync > 60e3) onlSync(true) });

/* ---- Màn tạo nhân vật: ô đăng ký online nổi bật, chỉ bật khi chọn Công Thành Chiến ---- */
const ONL_PICK_HTML = `<div class="onlpick" id="onlPick"><label><input type="checkbox" id="pfOnline" checked> <b>Đăng ký chơi Online</b><em>đồng bộ / xếp hạng Công Thành Chiến · có tên trên bảng xếp hạng</em></label><small id="onlPickNote"></small></div>`;
function onlPickRefresh() {
  const box = document.getElementById("onlPick");
  if (!box) return;
  const ctc = typeof PICK_MODE !== "undefined" && PICK_MODE === "ctc", cb = document.getElementById("pfOnline");
  box.classList.toggle("off", !ctc);
  if (cb) cb.disabled = !ctc;
  const note = document.getElementById("onlPickNote");
  if (note) note.textContent = ctc ? "Không đăng ký vẫn chơi CTC cục bộ được, nhưng không có tên trên bảng xếp hạng. Chỉ đăng ký được trước cấp 40." : "Chỉ dành cho chế độ Công Thành Chiến.";
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
  const recoverBox = `<div class="card"><small class="dim">Đã có mã khôi phục? Nhập để liên kết an toàn với slot này.</small><div class="btnrow"><input id="onlRecoverToken" placeholder="Mã khôi phục" autocomplete="off"><button class="btn" id="onlRecoverBtn">Khôi phục liên kết</button></div></div>`;
  if (!onlEligible()) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Đồng bộ / xếp hạng chỉ dành cho nhân vật Công Thành Chiến.</small></div>`;
  const acc = onlGet();
  if (acc) {
    const me = ONL.me, ago = ONL.lastSync ? Math.round((Date.now() - ONL.lastSync) / 60e3) + " phút trước" : "chưa";
    return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <b>${esc(acc.name)}</b></div>
      <div class="row">Giờ chơi đã đo <b>${me ? fmtHours(me.play_sec) : "…"}</b></div><div class="row">Đồng bộ gần nhất <span>${ago}</span></div>
      ${me && me.char ? `<div class="row">Bậc xếp hạng <b>${ONL_BRACKET[me.char.bracket] || "Chưa đủ cấp 40"}</b></div><div class="row">Lực chiến (máy chủ tính) <b>${fmt(me.char.power || 0)}</b></div>` : ""}
      ${me && me.validation_status === "pending_verification" ? `<div class="onlflag"><b>Đang chờ xác minh lịch sử chuyển sinh</b><small>${esc(me.validation_note || "Chưa đủ lịch sử server để đưa vào bảng xếp hạng.")}</small></div>` : ""}
      ${me && me.flags && me.flags.length ? `<div class="onlflag"><b>Đang bị loại khỏi bảng xếp hạng vì nghi gian lận</b>${me.flags.map(f => `<small>${esc(f.detail || f.code)}</small>`).join("")}</div>` : ""}
      <div class="btnrow"><button class="btn" id="onlSyncBtn">Đồng bộ ngay</button><button class="btn" id="onlCodeBtn">Mã khôi phục</button></div>
      <small class="dim" id="onlCode" hidden>Giữ kín mã này, nó thay cho mật khẩu: <code>${esc(acc.token)}</code></small></div>${recoverBox}`;
  }
  if (S.lvl > ONL_REG_MAX_LVL) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Nhân vật đã quá cấp ${ONL_REG_MAX_LVL}, không đăng ký bảng xếp hạng được. Vẫn chơi CTC cục bộ được (không xếp hạng).</small></div>${recoverBox}`;
  return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <input id="onlName" maxlength="16" value="${esc(S.name || "")}" style="flex:1"></div>
    <div class="btnrow"><button class="btn" id="onlRegBtn">Đăng ký chơi Online</button></div><small class="dim">Chỉ đăng ký được trước cấp 40. Có tên trên bảng xếp hạng CTC.</small></div>${recoverBox}`;
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
  if (b("onlRecoverBtn")) b("onlRecoverBtn").onclick = async () => {
    const btn = b("onlRecoverBtn"); btn.disabled = true;
    try { await onlRecover((b("onlRecoverToken") || {}).value); toast("Đã khôi phục liên kết online"); await onlRefreshMe() }
    catch (e) { toast(e.msg || "Khôi phục liên kết lỗi") }
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
