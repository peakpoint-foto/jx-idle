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
// CTC is always eligible. PHLT and 2.0 accounts are opt-in per mode through a server flag, so a stale client never assumes they are open.
const ONL_MODE_FLAGS = { phlt: "online_account_phlt", g2: "online_account_g2" };
const onlModeOpen = mode => mode === "ctc" || (Object.prototype.hasOwnProperty.call(ONL_MODE_FLAGS, mode) && typeof featureEnabled === "function" && featureEnabled(ONL_MODE_FLAGS[mode], mode));
const onlEligible = () => typeof S !== "undefined" && S && S.fac && onlModeOpen(S.mode);
const ONL = { me: null, lastSync: 0, busy: false, serverNow: 0, conflict: null, room: null, roomTimer: 0 };

async function onlApi(path, opt = {}) {
  const acc = onlGet(), headers = {};
  if (opt.body !== undefined) headers["content-type"] = "application/json";
  if (opt.auth !== false && acc) headers.authorization = "Bearer " + acc.token;
  Object.assign(headers, opt.headers || {});
  let r;
  try {
    r = await fetch(onlBase() + path, { method: opt.method || (opt.body !== undefined ? "POST" : "GET"), headers, body: opt.body !== undefined ? JSON.stringify(opt.body) : undefined, keepalive: !!opt.keepalive });
  } catch (e) { throw { code: "offline", msg: "Không kết nối được máy chủ online" } }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw { code: d.error || "http_" + r.status, msg: d.msg || "Lỗi máy chủ (" + r.status + ")", ...d };
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
  if (!S || !S.fac || (S.mode !== "ctc" && !Object.prototype.hasOwnProperty.call(ONL_MODE_FLAGS, S.mode))) throw { code: "not_ctc", msg: "Chế độ này không có tài khoản online" };
  if (S.lvl > ONL_REG_MAX_LVL) throw { code: "too_late", msg: `Chỉ đăng ký được khi nhân vật dưới cấp ${ONL_REG_MAX_LVL + 1}` };
  const cfg = await onlApi("/config?mode=" + encodeURIComponent(S.mode), { auth: false });
  if (S.mode !== "ctc") {
    if (!cfg.capabilities || !cfg.capabilities[ONL_MODE_FLAGS[S.mode]]) throw { code: "mode_not_open", msg: "Chế độ này chưa mở tài khoản online" };
    setFeatureFlags(cfg.feature_flags);
  }
  const turnstile = cfg.turnstile ? await onlTurnstile(cfg.turnstile) : "";
  const r = await onlApi("/register", { body: { name, save: pack(S), turnstile }, auth: false });
  if (r.character_id) S.cid = r.character_id;
  onlSet({ id: r.id, name: r.name, token: r.token });
  ONL.me = { char: { character_id: r.character_id, sync_rev: r.sync_rev || 1 } };
  S.online = { id: r.id, name: r.name };
  ONL.conflict = null;
  ONL.lastSync = Date.now();
  if (typeof save === "function") save();
  return r;
}

async function onlSync(quiet, force = false) {
  if (!onlEligible() || !onlGet() || ONL.busy) return null;
  if (ONL.me && ONL.me.char && ONL.me.char.character_id && S.cid && ONL.me.char.character_id !== S.cid) {
    onlSet(null); ONL.me = null;
    if (!quiet) toast("Mã online thuộc nhân vật khác — đã ngắt liên kết");
    return null;
  }
  ONL.busy = true;
  try {
    const rev = ONL.me && ONL.me.char && ONL.me.char.sync_rev;
    const r = await onlApi("/sync", { body: { save: pack(S), base_rev: rev == null ? null : rev, force } });
    ONL.lastSync = Date.now();
    ONL.conflict = null;
    if (ONL.me && ONL.me.char && r.sync_rev != null) ONL.me.char.sync_rev = r.sync_rev;
    if (ONL.me && ONL.me.char) Object.assign(ONL.me.char, { power: r.power, bracket: r.bracket, flagged: r.flagged ? 1 : 0 });
    return r;
  } catch (e) {
    if (e.code === "sync_conflict") {
      ONL.conflict = e;
      if (!quiet && typeof toast === "function") toast("Bản lưu xung đột: chọn bản máy chủ hoặc ghi đè");
      if (typeof renderMore === "function") renderMore();
      return null;
    }
    if (!quiet && typeof toast === "function") toast(e.msg || "Đồng bộ lỗi");
    if (e.code === "bad_token") onlSet(null);
    return null;
  } finally { ONL.busy = false }
}

async function onlRefreshMe() {
  if (!onlGet()) return null;
  try {
    try { const cfg = await onlApi("/config?mode=" + encodeURIComponent(modeId()), { auth: false }); setFeatureFlags(cfg.feature_flags); } catch (e) {}
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

function onlPackedState(txt) {
  try {
    const u = unpack(txt);
    if (!u || !u.ok || !u.state || (typeof S !== "undefined" && S && u.state.mode !== S.mode)) throw new Error("bad");
    return u.state;
  } catch (e) { throw { code: "bad_save", msg: "Bản lưu máy chủ không hợp lệ" } }
}

function onlApplyServerSnapshot() {
  if (!ONL.conflict || !ONL.conflict.server_save) return;
  try {
    const state = onlPackedState(ONL.conflict.server_save);
    if (!confirm("Nạp bản lưu máy chủ và bỏ thay đổi cục bộ hiện tại?")) return;
    writeSlot(SLOT, state);
    location.reload();
  } catch (e) { toast(e.msg || "Không nạp được bản lưu máy chủ") }
}

async function onlForceLocalSnapshot() {
  if (!ONL.conflict) return;
  if (await onlSync(false, true)) { toast("Đã ghi đè bản lưu máy chủ"); await onlRefreshMe(); renderMore() }
}

async function onlRenderRank() {
  const box = document.getElementById("onlRankPanel");
  if (!box) return;
  box.innerHTML = "<small class=\"dim\">Đang tải bảng xếp hạng…</small>";
  try {
    const b = ONL.me && ONL.me.char && ONL.me.char.bracket || "so";
    const d = await onlApi("/ladder?b=" + encodeURIComponent(b), { auth: false });
    box.innerHTML = `<div class="onlsub"><b>${esc((d.brackets.find(x => x.k === d.bracket) || {}).n || "Bảng hạng")}</b><button class="btn sm" id="onlRankClose">Đóng</button></div>` +
      (d.rows.length ? d.rows.map(x => `<div class="qrow"><span><b>#${x.rank} ${esc(x.name)}</b><small>Cấp ${x.lvl} · lực chiến ${fmt(x.power)} · ${x.last_sync ? new Date(x.last_sync).toLocaleDateString() : ""}</small></span><button class="btn sm" data-onl-profile="${esc(x.name)}">Hồ sơ</button></div>`).join("") : "<small class=\"dim\">Chưa có người trong bảng này.</small>");
    box.hidden = false;
    box.querySelector("#onlRankClose").onclick = () => { box.hidden = true };
    box.querySelectorAll("[data-onl-profile]").forEach(b => b.onclick = () => onlShowProfile(b.dataset.onlProfile));
  } catch (e) { box.innerHTML = `<small class="bad">${esc(e.msg || "Không tải được bảng hạng")}</small>`; box.hidden = false }
}

async function onlShowProfile(name) {
  const box = document.getElementById("onlRankPanel");
  if (!box) return;
  try {
    const p = await onlApi("/profile?name=" + encodeURIComponent(name), { auth: false });
    box.innerHTML = `<div class="onlsub"><b>Hồ sơ ${esc(p.name)}</b><button class="btn sm" id="onlBackRank">Bảng hạng</button></div><div class="card stats"><span>Cấp</span><span>${p.lvl}</span><span>Lực chiến</span><span>${fmt(p.power)}</span><span>Bậc</span><span>${esc(p.bracket || "Chưa xếp hạng")}</span><span>Trạng thái</span><span>${p.ranked ? "Đang xếp hạng" : "Tạm ẩn"}</span></div>`;
    box.querySelector("#onlBackRank").onclick = onlRenderRank;
  } catch (e) { box.innerHTML = `<small class="bad">${esc(e.msg || "Không tải được hồ sơ")}</small>` }
}

async function onlRenderDuels() {
  const box = document.getElementById("onlDuelList");
  if (!box || !onlGet()) return;
  if (!featureEnabled("async_duels")) { box.textContent = "Đấu trường đang tạm đóng"; return; }
  try {
    const d = await onlApi("/duels");
    const score = d.score || {};
    const advanced=featureEnabled('duel_modes');
    const date=t=>new Date(t).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
    const explain=x=>x.explanation?`<small>Ước lượng: ${Number(x.challenger_power).toFixed(0)} × ${x.explanation.challenger_factor.toFixed(2)} = ${Number(x.challenger_score).toFixed(1)}; ${Number(x.defender_power).toFixed(0)} × ${x.explanation.defender_factor.toFixed(2)} = ${Number(x.defender_score).toFixed(1)} · ${esc(x.rules_version)} · ${esc(x.combat_version||'legacy')}</small>`:'';
    box.innerHTML = `<small class="dim">Mùa ${esc(d.season)} · ${score.points || 0} điểm · thắng ${score.wins || 0} · thua ${score.losses || 0} · hòa ${score.draws||0}</small>` +
      (advanced?`<small>Mùa UTC: ${esc(date(d.season_start))} – ${esc(date(d.season_end))} (giờ Việt Nam). Lời mời hết hạn sau 3 ngày; ranked hết hạn khi sang mùa. Tối đa ${d.pair_daily_cap} lời mời ranked/cặp/ngày UTC kể cả từ chối. ${d.ranked_ready?'':'Ranked cần snapshot hợp lệ, cấp 40+.'}</small>`:'')+
      (advanced&&d.matches?.length?`<div class="btnrow">${d.matches.map(m=>`<button class="btn sm" data-match="${esc(m.name)}">${esc(m.name)} · Lv${m.lvl} · LC ${m.power}</button>`).join('')}</div>`:'')+
      (d.duels.length ? d.duels.slice(0, 8).map(x => `<div class="qrow"><span><b>${esc(x.direction === "incoming" ? "Từ " + x.opponent : "Đấu với " + x.opponent)} · ${x.kind==='friendly'?'Giao hữu':'Ranked'}</b><small>${esc(x.status)} · ${x.status === "resolved" ? (x.winner?"thắng: " + esc(x.winner):"hòa") : "Hạn: "+esc(date(x.expires_at))}</small>${explain(x)}</span>${x.status === "pending" && x.direction === "incoming" ? `<button class="btn sm" data-duel="accept" data-id="${esc(x.id)}">Nhận</button><button class="btn sm" data-duel="decline" data-id="${esc(x.id)}">Từ chối</button>` : ""}</div>`).join("") : "<small class=\"dim\">Chưa có trận đấu.</small>");
    box.querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>{document.getElementById('onlOpponent').value=b.dataset.match;});
    box.querySelectorAll("[data-duel]").forEach(b => b.onclick = () => onlDuelAction(b.dataset.duel, b.dataset.id));
  } catch (e) { box.innerHTML = `<small class="bad">${esc(e.msg || "Không tải được duel")}</small>` }
}

async function onlDuelAction(action, id) {
  if(ONL.duelBusy)return;ONL.duelBusy=true;
  try { await onlApi("/duel", { body: { action, id } }); await onlRenderDuels(); toast(action === "accept" ? "Đã nhận và phân xử trận đấu" : "Đã xử lý lời thách đấu") }
  catch (e) { toast(e.msg || "Xử lý duel lỗi") }
  finally{ONL.duelBusy=false;}
}

async function onlChallenge() {
  if(ONL.duelBusy)return;ONL.duelBusy=true;
  const input = document.getElementById("onlOpponent");
  try { await onlApi("/duel", { body: { action: "challenge", opponent: input && input.value,kind:document.getElementById('onlDuelKind')?.value||'ranked' } }); if (input) input.value = ""; await onlRenderDuels(); toast("Đã gửi lời thách đấu") }
  catch (e) { toast(e.msg || "Không gửi được lời thách đấu") }
  finally{ONL.duelBusy=false;}
}

async function onlRenderGuild() {
  const box = document.getElementById("onlGuildPanel");
  if (!box || !onlGet()) return;
  if (!featureEnabled("guild_online")) { box.hidden = true; return; }
  try {
    const d = await onlApi("/guild");
    ONL.guildId=d.guild?.id||null;
    if (!d.guild) {
      box.innerHTML = `<b>Bang hội online</b><small class="dim">Tạo bang hoặc tham gia bang đang có.</small><div class="btnrow"><input id="onlGuildName" maxlength="24" placeholder="Tên bang"><button class="btn sm" data-guild="create">Tạo bang</button><button class="btn sm" data-guild="join">Tham gia</button></div><small class="dim">${d.suggestions.length ? "Gợi ý: " + d.suggestions.map(x => esc(x.name)).join(" · ") : "Chưa có bang nào"}</small>`;
    } else {
      const g = d.guild, pct = g.boss_max_hp ? Math.round((1 - g.boss_hp / g.boss_max_hp) * 100) : 100;
      box.innerHTML = `<div class="onlsub"><b>${esc(g.name)}</b><small>Cấp ${g.level} · ${g.xp} XP · ${g.role}</small></div><div class="card stats"><span>Boss tuần</span><span>${fmt(g.boss_hp)} / ${fmt(g.boss_max_hp)}</span><span>Tiến độ</span><span>${pct}%</span><span>Mốc thưởng</span><span>${(g.boss_rules?.milestones||[]).map(m=>`${Math.round(m*100)}%${(g.boss_milestones||[]).includes(m)?" ✔":""}`).join(" · ")}</span><span>Đóng góp</span><span>${g.contrib}</span><span>Lượt đánh hôm nay</span><span>${g.attack_count}/3</span></div><div class="btnrow"><button class="btn sm" disabled title="Chờ ledger tài nguyên xác thực">Đóng góp tạm khóa</button><button class="btn sm" data-guild="boss_attack">Đánh boss</button>${g.role === "owner" ? "" : '<button class="btn sm" data-guild="leave">Rời bang</button>'}</div><small class="dim">${d.members.map(x => `${esc(x.name)} · ${fmt(x.power)} · ${x.weekly_damage} sát thương`).join("<br>")}</small>`;
    }
    box.hidden = false;
    if(d.guild&&featureEnabled("guild_management")&&typeof onlGuildManagementHTML==="function"){
      box.insertAdjacentHTML("beforeend",onlGuildManagementHTML(d));onlGuildManagementBind(box,d);
    }
    box.querySelectorAll("[data-guild]").forEach(b => b.onclick = () => onlGuildAction(b.dataset.guild));
  } catch (e) { box.innerHTML = `<small class="bad">${esc(e.msg || "Không tải được bang hội")}</small>`; box.hidden = false }
}

async function onlGuildAction(action) {
  const input = document.getElementById("onlGuildName");
  try { await onlGuildWrite({action,name:input&&input.value,guild_id:['create','join'].includes(action)?undefined:ONL.guildId}); await onlRenderGuild(); toast(action === "boss_attack" ? "Đã đánh boss tuần" : "Đã cập nhật bang hội") }
  catch (e) { toast(e.msg || "Xử lý bang hội lỗi") }
}

async function onlGuildWrite(body) {
  if(ONL.guildBusy)throw {msg:"Đang xử lý bang hội"};
  const key=JSON.stringify(body),previous=ONL.guildPending;
  const request_id=previous?.key===key?previous.request_id:"guild_"+(typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now()+"_"+Math.random().toString(36).slice(2));
  ONL.guildPending={key,request_id};ONL.guildBusy=true;
  try{const result=await onlApi('/guild',{body:{...body,request_id}});ONL.guildPending=null;return result;}
  finally{ONL.guildBusy=false;}
}

async function onlRenderRoom() {
  const box = document.getElementById("onlRoomPanel");
  if (!box || !onlGet()) return;
  if (!featureEnabled("room_presence")) { box.hidden = true; return; }
  try {
    let d = await onlApi("/room");
    if (d.room) d = await onlApi("/room", { body: { action: "heartbeat" } });
    ONL.room = d.room;
    if (!d.room) box.innerHTML = `<b>Phòng chơi</b><small class="dim">Tạo phòng để cùng theo dõi hoạt động với tối đa 4 người.</small><div class="btnrow"><button class="btn sm" data-room="create">Tạo phòng</button><input id="onlRoomId" placeholder="Mã phòng"><button class="btn sm" data-room="join">Tham gia</button></div>`;
    else box.innerHTML = `<div class="onlsub"><b>Phòng ${esc(d.room.id)}</b><button class="btn sm" data-room="leave">Rời phòng</button></div><small class="dim">${d.room.members.map(x => `${esc(x.name)} · ${fmt(x.power)} · ${esc(x.last_action || "đang chờ")}`).join("<br>")}</small><div class="btnrow"><button class="btn sm" data-room="action" data-value="sẵn sàng">Sẵn sàng</button><button class="btn sm" data-room="action" data-value="bắt đầu">Bắt đầu lượt</button></div>`;
    box.hidden = false;
    box.querySelectorAll("[data-room]").forEach(b => b.onclick = () => onlRoomAction(b.dataset.room, b.dataset.value));
  } catch (e) { box.innerHTML = `<small class="bad">${esc(e.msg || "Không tải được phòng")}</small>`; box.hidden = false }
}

async function onlRoomAction(action, value) {
  const input = document.getElementById("onlRoomId");
  try { await onlApi("/room", { body: { action, room_id: input && input.value, value } }); await onlRenderRoom(); toast(action === "create" ? "Đã tạo phòng" : action === "join" ? "Đã vào phòng" : "Đã cập nhật phòng") }
  catch (e) { toast(e.msg || "Xử lý phòng lỗi") }
}

setInterval(() => { if (document.visibilityState!=="hidden" && onlGet() && document.getElementById("onlRoomPanel")) onlRenderRoom() }, 5000);

// Heartbeat mỗi phút khi đã đăng ký; đồng bộ save mỗi 5 phút.
setInterval(() => {
  if (!onlEligible() || !onlGet()) return;
  onlApi("/hb", { method: "POST", keepalive: true }).then(d => { ONL.serverNow = d.server_now || 0; if (ONL.me) ONL.me.play_sec = d.play_sec }).catch(() => { });
  if (Date.now() - ONL.lastSync >= ONL_SYNC_MS) onlSync(true);
}, ONL_HB_MS);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && onlEligible() && onlGet() && Date.now() - ONL.lastSync > 60e3) onlSync(true) });

/* ---- Màn tạo nhân vật: ô đăng ký online nổi bật, chỉ bật khi chọn Công Thành Chiến ---- */
const ONL_PICK_HTML = `<div class="onlpick" id="onlPick"><label><input type="checkbox" id="pfOnline" checked> <b>Đăng ký chơi Online</b><em id="onlPickEm">đồng bộ / xếp hạng Công Thành Chiến · có tên trên bảng xếp hạng</em></label><small id="onlPickNote"></small></div>`;
const ONL_PICK_OPEN = {};
function onlPickRefresh() {
  const box = document.getElementById("onlPick");
  if (!box) return;
  const mode = typeof PICK_MODE !== "undefined" ? PICK_MODE : "ctc", ctc = mode === "ctc", cb = document.getElementById("pfOnline");
  const known = ctc || ONL_PICK_OPEN[mode];
  if (!ctc && Object.prototype.hasOwnProperty.call(ONL_MODE_FLAGS, mode) && ONL_PICK_OPEN[mode] === undefined) {
    ONL_PICK_OPEN[mode] = false;
    onlApi("/config?mode=" + encodeURIComponent(mode), { auth: false }).then(cfg => {
      ONL_PICK_OPEN[mode] = !!(cfg.capabilities && cfg.capabilities[ONL_MODE_FLAGS[mode]]);
      if (ONL_PICK_OPEN[mode] && cb) cb.checked = false;
      onlPickRefresh();
    }).catch(() => { delete ONL_PICK_OPEN[mode]; });
  }
  box.classList.toggle("off", !known);
  if (cb) cb.disabled = !known;
  const em = document.getElementById("onlPickEm");
  if (em) em.textContent = ctc ? "đồng bộ / xếp hạng Công Thành Chiến · có tên trên bảng xếp hạng" : "đồng bộ và đo giờ chơi · không vào bảng xếp hạng CTC";
  const note = document.getElementById("onlPickNote");
  if (note) note.textContent = ctc ? "Không đăng ký vẫn chơi CTC cục bộ được, nhưng không có tên trên bảng xếp hạng. Chỉ đăng ký được trước cấp 40." : known ? "Tài khoản online của chế độ này phục vụ tính năng riêng của chế độ; mặc định không đăng ký. Chỉ đăng ký được trước cấp 40." : "Chế độ này chưa mở tài khoản online.";
}
document.addEventListener("click", e => { if (e.target.closest && e.target.closest("#mPick")) setTimeout(onlPickRefresh, 0) }, true);
function onlWantsRegister() { const cb = document.getElementById("pfOnline"); return !!(cb && cb.checked && !cb.disabled) }
function onlAfterCreate(want) {
  if (!want || !S || !S.fac) return;
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
// PHLT / 2.0: sync and server-measured play time only. Ladder, PvP, guild and room are CTC-only on the server, so no controls are drawn for them.
function onlModeCardHTML(acc, recoverBox) {
  if (!acc) {
    if (S.lvl > ONL_REG_MAX_LVL) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Nhân vật đã quá cấp ${ONL_REG_MAX_LVL}, không đăng ký tài khoản online được.</small></div>`;
    return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <input id="onlName" maxlength="16" value="${esc(S.name || "")}" style="flex:1"></div>
    <div class="btnrow"><button class="btn" id="onlRegBtn">Đăng ký chơi Online</button></div><small class="dim">Chỉ đăng ký được trước cấp 40. Không vào bảng xếp hạng CTC.</small></div>${recoverBox}`;
  }
  const me = ONL.me, ago = ONL.lastSync ? Math.round((Date.now() - ONL.lastSync) / 60e3) + " phút trước" : "chưa";
  return `<h3>Chơi Online · ${esc(MODES[S.mode].short)}</h3><div class="card lootf onlcard"><div class="row">Tên online <b>${esc(acc.name)}</b></div>
    <div class="row">Giờ chơi đã đo <b>${me ? fmtHours(me.play_sec) : "…"}</b></div><div class="row">Đồng bộ gần nhất <span>${ago}</span></div>
    <div class="row">Phiên bản save <span>${me && me.char ? me.char.sync_rev : "…"}</span></div>
    ${me && me.flags && me.flags.length ? `<div class="onlflag"><b>Nhân vật đang bị gắn cờ xác minh</b>${me.flags.map(f => `<small>${esc(f.detail || f.code)}</small>`).join("")}</div>` : ""}
    ${ONL.conflict ? `<div class="onlflag"><b>Phát hiện bản lưu mới hơn trên máy chủ.</b><div class="btnrow"><button class="btn sm" id="onlPullConflict">Nạp bản máy chủ</button><button class="btn sm" id="onlPushConflict">Ghi đè bằng bản này</button></div></div>` : ""}
    <div class="btnrow"><button class="btn" id="onlSyncBtn">Đồng bộ ngay</button><button class="btn" id="onlCodeBtn">Mã khôi phục</button></div>
    <small class="dim" id="onlCode" hidden>Giữ kín mã này, nó thay cho mật khẩu: <code>${esc(acc.token)}</code></small>
    <small class="dim">Tài khoản này khóa theo chế độ ${esc(MODES[S.mode].n)}; không vào bảng xếp hạng, PvP, bang hay phòng của Công Thành Chiến.</small>
    ${featureEnabled("room_presence") ? '<div id="onlRoomPanel" class="onlpanel"></div>' : ""}</div>`;
}
function onlCardHTML() {
  const recoverBox = `<div class="card"><small class="dim">Đã có mã khôi phục? Nhập để liên kết an toàn với slot này.</small><div class="btnrow"><input id="onlRecoverToken" placeholder="Mã khôi phục" autocomplete="off"><button class="btn" id="onlRecoverBtn">Khôi phục liên kết</button></div></div>`;
  if (!onlEligible()) return `<h3>Chơi Online</h3><div class="card"><small class="dim">${S && S.mode && S.mode !== "ctc" ? "Tài khoản online của chế độ này chưa mở." : "Đồng bộ / xếp hạng chỉ dành cho nhân vật Công Thành Chiến."}</small></div>`;
  const acc = onlGet();
  if (S.mode !== "ctc") return onlModeCardHTML(acc, recoverBox);
  if (acc) {
    const me = ONL.me, ago = ONL.lastSync ? Math.round((Date.now() - ONL.lastSync) / 60e3) + " phút trước" : "chưa";
    return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <b>${esc(acc.name)}</b></div>
      <div class="row">Giờ chơi đã đo <b>${me ? fmtHours(me.play_sec) : "…"}</b></div><div class="row">Đồng bộ gần nhất <span>${ago}</span></div>
      <div class="row">Phiên bản save <span>${me && me.char ? me.char.sync_rev : "…"}</span></div>
      ${me && me.char ? `<div class="row">Bậc xếp hạng <b>${ONL_BRACKET[me.char.bracket] || "Chưa đủ cấp 40"}</b></div><div class="row">Lực chiến (máy chủ tính) <b>${fmt(me.char.power || 0)}</b></div>` : ""}
      ${me && me.char && me.char.validation_status === "pending_verification" ? `<div class="onlflag"><b>Đang chờ xác minh lịch sử chuyển sinh</b><small>${esc(me.char.validation_note || "Chưa đủ lịch sử server để đưa vào bảng xếp hạng.")}</small></div>` : ""}
      ${me && me.flags && me.flags.length ? `<div class="onlflag"><b>Đang bị loại khỏi bảng xếp hạng vì nghi gian lận</b>${me.flags.map(f => `<small>${esc(f.detail || f.code)}</small>`).join("")}</div>` : ""}
      ${ONL.conflict ? `<div class="onlflag"><b>Phát hiện bản lưu mới hơn trên máy chủ.</b><small>Chọn nạp bản máy chủ hoặc ghi đè bằng bản đang mở.</small><div class="btnrow"><button class="btn sm" id="onlPullConflict">Nạp bản máy chủ</button><button class="btn sm" id="onlPushConflict">Ghi đè máy chủ</button></div></div>` : ""}
      <div class="btnrow"><button class="btn" id="onlSyncBtn">Đồng bộ ngay</button><button class="btn" id="onlRankBtn">Bảng xếp hạng</button><button class="btn" id="onlCodeBtn">Mã khôi phục</button></div>
      <small class="dim" id="onlCode" hidden>Giữ kín mã này, nó thay cho mật khẩu: <code>${esc(acc.token)}</code></small><div id="onlRankPanel" class="onlpanel" hidden></div>
      <div id="onlDuelPanel" class="onlpanel"><b>PvP bất đồng bộ</b><small class="dim">Phân xử bất đồng bộ bằng ước lượng lực chiến và hệ số cố định theo mã trận. Giao hữu không cộng điểm; ranked cần cùng bậc, lực chiến gần nhau.</small><div class="btnrow">${featureEnabled("duel_modes")?'<select id="onlDuelKind" aria-label="Loại thách đấu"><option value="ranked">Ranked</option><option value="friendly">Giao hữu</option></select>':""}<input id="onlOpponent" maxlength="16" placeholder="Tên đối thủ"><button class="btn sm" id="onlChallengeBtn">Thách đấu</button></div><div id="onlDuelList"></div></div>
      <div id="onlGuildPanel" class="onlpanel"></div><div id="onlRoomPanel" class="onlpanel"></div></div>`;
  }
  if (S.lvl > ONL_REG_MAX_LVL) return `<h3>Chơi Online</h3><div class="card"><small class="dim">Nhân vật đã quá cấp ${ONL_REG_MAX_LVL}, không đăng ký bảng xếp hạng được. Vẫn chơi CTC cục bộ được (không xếp hạng).</small></div>${recoverBox}`;
  return `<h3>Chơi Online</h3><div class="card lootf onlcard"><div class="row">Tên online <input id="onlName" maxlength="16" value="${esc(S.name || "")}" style="flex:1"></div>
    <div class="btnrow"><button class="btn" id="onlRegBtn">Đăng ký chơi Online</button></div><small class="dim">Chỉ đăng ký được trước cấp 40. Có tên trên bảng xếp hạng CTC.</small></div>${recoverBox}`;
}
function onlCardBind() {
  const b = id => document.getElementById(id);
  if (b("onlSyncBtn")) b("onlSyncBtn").onclick = async () => { if (await onlSync(false)) { toast("Đã đồng bộ"); await onlRefreshMe(); renderMore() } };
  if (b("onlCodeBtn")) b("onlCodeBtn").onclick = () => { const c = b("onlCode"); if (c) c.hidden = !c.hidden };
  if (b("onlRankBtn")) b("onlRankBtn").onclick = onlRenderRank;
  if (b("onlPullConflict")) b("onlPullConflict").onclick = onlApplyServerSnapshot;
  if (b("onlPushConflict")) b("onlPushConflict").onclick = onlForceLocalSnapshot;
  if (b("onlChallengeBtn")) b("onlChallengeBtn").onclick = onlChallenge;
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
  if (S.mode !== "ctc") { onlRenderRoom(); return; }
  onlRenderDuels();
  onlRenderGuild();
  onlRenderRoom();
}
if (typeof renderMore === "function") {
  const _renderMore = renderMore;
  renderMore = function () {
    _renderMore.apply(this, arguments);
    const t = document.getElementById("t-more");
    if (!t) return;
    t.insertAdjacentHTML("afterbegin", onlCardHTML());
    onlCardBind();
    if (onlGet() && !ONL.me) onlRefreshMe().then(me => { if (me && typeof curTab !== "undefined" && curTab === "more") renderMore() });
  };
}
