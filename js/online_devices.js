"use strict";
/* Thiết bị & bảo mật — UI quản lý device token (W1-5).
   - Liệt kê phiên đăng nhập, thu hồi phiên lạ, đổi mã khôi phục chính.
   - NGUYÊN TẮC BẢO MẬT: token/hash KHÔNG BAO GIỜ xuất hiện trong HTML, log hay test.
   - Logic thuần (dev*) không chạm DOM để test được bằng node:test + vm.
   - API giữ nguyên hành vi: GET /api/devices, POST /api/devices/revoke, POST /api/token/rotate. */

/* ---------- Logic thuần ---------- */
function devPad2(n) { return String(n).padStart(2, "0"); }
function devFmtDate(ts) {
  const t = +ts;
  if (!(t > 0)) return "—";
  const d = new Date(t);
  return devPad2(d.getDate()) + "/" + devPad2(d.getMonth() + 1) + "/" + d.getFullYear() + " " + devPad2(d.getHours()) + ":" + devPad2(d.getMinutes());
}
function devAgo(ts, nowMs) {
  const t = +ts;
  if (!(t > 0)) return "—";
  const now = nowMs == null ? Date.now() : +nowMs;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return Math.floor(s / 60) + " phút trước";
  if (s < 86400) return Math.floor(s / 3600) + " giờ trước";
  return devFmtDate(t);
}
/* API /api/devices -> view model cho UI. Không bao giờ giữ token/hash. */
function devViewModel(data, nowMs) {
  const d = data || {};
  const prim = d.primary || {};
  const via = prim.via === "device" ? "device" : "primary";
  const devs = Array.isArray(d.devices) ? d.devices : [];
  return {
    via: via,
    // Chỉ phiên dùng mã khôi phục chính mới được đổi mã chính.
    // Phiên token thiết bị mà gọi rotate thì server sẽ xoay token của chính nó
    // (phiên hiện tại chết ngay) — UI không gọi trong trường hợp đó.
    canRotate: via === "primary",
    primary: {
      createdTxt: devFmtDate(prim.created_at),
      graceTxt: prim.grace_until ? devFmtDate(prim.grace_until) : null,
    },
    devices: devs.map(function (x) {
      const revoked = x.revoked_at != null && +x.revoked_at > 0;
      const current = !!x.current;
      const label = String(x.device_label || "").trim() || "Thiết bị không tên";
      return {
        id: String(x.id || ""),
        label: label,
        createdTxt: devFmtDate(x.created_at),
        lastUsedTxt: devAgo(x.last_used_at, nowMs),
        current: current,
        revoked: revoked,
        canRevoke: !revoked && !!x.id,
        statusTxt: revoked ? "Đã thu hồi" : (current ? "Thiết bị này" : "Đang hoạt động"),
      };
    }),
  };
}
function devRevokeReq(deviceId) {
  return { path: "/api/devices/revoke", body: { device_id: String(deviceId || "") } };
}
function devRotateReq() {
  return { path: "/api/token/rotate", body: {} };
}
/* Lỗi API -> thông điệp tiếng Việt thân thiện. Không lộ chi tiết nội bộ. */
function devErrMsg(e, action) {
  const code = e && (e.code || e.error) || "";
  if (code === "offline") return "Không kết nối được máy chủ online";
  if (code === "rate_limited") return "Thao tác quá nhiều, thử lại sau ít phút";
  if (code === "device_not_found") return "Thiết bị đã được thu hồi trước đó";
  if (code === "forbidden") return action === "revoke"
    ? "Phiên này chỉ được thu hồi chính thiết bị đang dùng"
    : "Phiên này không có quyền làm việc đó";
  if (code === "bad_request") return "Yêu cầu không hợp lệ";
  if (code === "device_cannot_provision") return "Token thiết bị không được cấp token cho thiết bị khác";
  if (e && e.msg) return String(e.msg);
  return action === "load" ? "Không tải được danh sách thiết bị" : "Lỗi máy chủ, thử lại sau";
}
/* Tải danh sách thiết bị. deps = { api, now }. */
async function devFetchDevices(deps) {
  try {
    const data = await deps.api("/api/devices");
    return { ok: true, vm: devViewModel(data, deps.now ? deps.now() : Date.now()) };
  } catch (e) {
    return { ok: false, msg: devErrMsg(e, "load") };
  }
}
/* Thu hồi 1 thiết bị. deps = { api }. row = view model row (để biết có phải thiết bị hiện tại). */
async function devDoRevoke(deps, deviceId, row) {
  const r = devRevokeReq(deviceId);
  try {
    const d = await deps.api(r.path, { body: r.body });
    return { ok: true, device_id: (d && d.device_id) || String(deviceId), wasCurrent: !!(row && row.current) };
  } catch (e) {
    return { ok: false, msg: devErrMsg(e, "revoke") };
  }
}
/* Đổi mã khôi phục chính. deps = { api, getAcc, setAcc }.
   - rotated==="primary": lưu token mới vào session hiện tại, trả token để HIỆN 1 LẦN cho user copy.
   - rotated==="device" (phiên thiết bị): KHÔNG đụng session hiện tại, không trả token. */
async function devDoRotate(deps) {
  const r = devRotateReq();
  try {
    const d = await deps.api(r.path, { body: r.body });
    if (!d || !d.token) return { ok: false, msg: "Máy chủ không trả mã mới" };
    if (d.rotated === "primary") {
      const acc = deps.getAcc ? deps.getAcc() : null;
      if (acc && deps.setAcc) { acc.token = d.token; deps.setAcc(acc); }
      return { ok: true, rotated: "primary", token: d.token, grace_hours: d.grace_hours || 24 };
    }
    return { ok: true, rotated: "device", token: null, note: "device_session" };
  } catch (e) {
    return { ok: false, msg: devErrMsg(e, "rotate") };
  }
}
/* HTML danh sách thiết bị (thuần, không DOM). Input là view model — không chứa token/hash. */
function devListHTML(vm) {
  if (!vm.devices.length) return '<small class="dim">Chưa có thiết bị nào được cấp token. Phiên hiện tại đang dùng mã khôi phục chính.</small>';
  return vm.devices.map(function (x) {
    return '<div class="row" style="' + (x.revoked ? "opacity:.5;" : "") + 'justify-content:space-between;align-items:flex-start;padding:6px 0">'
      + '<div><b>' + esc(x.label) + "</b>"
      + (x.current ? ' <b class="up">· thiết bị này</b>' : "")
      + (x.revoked ? ' <span class="dim">· đã thu hồi</span>' : "")
      + '<br><small class="dim">Tạo ' + esc(x.createdTxt) + " · dùng gần nhất " + esc(x.lastUsedTxt) + "</small></div>"
      + (x.canRevoke ? '<button class="btn sm red" data-devrev="' + esc(x.id) + '">Thu hồi</button>' : "")
      + "</div>";
  }).join("");
}

/* ---------- UI (DOM) ---------- */
function onlOpenDevices() {
  if (typeof onlGet !== "function" || !onlGet()) { if (typeof toast === "function") toast("Chưa đăng nhập online"); return; }
  onlDevicesModal();
}
async function onlDevicesModal() {
  modal('<h3>Thiết bị & bảo mật</h3><div class="card"><small class="dim">Đang tải danh sách thiết bị…</small></div>', null);
  const res = await devFetchDevices({ api: onlApi, now: Date.now });
  if (!res.ok) {
    // Token hiện tại có thể đã bị thu hồi ở nơi khác -> onlApi đã 401 và onlGuarded401 đã dọn session.
    if (typeof onlGet === "function" && !onlGet()) {
      closeModal(true);
      if (typeof renderMore === "function") renderMore();
      return;
    }
    modal('<h3>Thiết bị & bảo mật</h3><div class="card"><small class="bad">' + esc(res.msg) + '</small></div>'
      + '<div class="btnrow"><button class="btn" id="devRetry">Thử lại</button><button class="btn" id="devClose">Đóng</button></div>', function () {
      document.getElementById("devRetry").onclick = onlDevicesModal;
      document.getElementById("devClose").onclick = function () { closeModal(true); };
    });
    return;
  }
  onlDevicesShow(res.vm);
}
function onlDevicesShow(vm) {
  const grace = vm.primary.graceTxt
    ? '<div class="row"><small class="dim">Mã khôi phục cũ còn hiệu lực tới ' + esc(vm.primary.graceTxt) + "</small></div>" : "";
  const rotateBox = vm.canRotate
    ? '<div class="btnrow"><button class="btn" id="devRotateBtn">Đổi mã khôi phục</button></div>'
    : '<small class="dim">Phiên này đang dùng token thiết bị — chỉ đổi được mã khôi phục chính khi đăng nhập bằng mã chính.</small>';
  modal("<h3>Thiết bị & bảo mật</h3>"
    + '<div class="card"><div class="row"><b>Mã khôi phục chính</b></div>'
    + '<div class="row"><small class="dim">Tạo ' + esc(vm.primary.createdTxt) + "</small></div>" + grace + rotateBox + "</div>"
    + '<div class="card"><div class="row"><b>Phiên đăng nhập (' + vm.devices.length + ")</b></div>"
    + devListHTML(vm)
    + '<small class="dim">Thu hồi = ngắt phiên trên thiết bị đó ngay lập tức.</small></div>'
    + '<div class="btnrow"><button class="btn" id="devClose">Đóng</button></div>', function () {
    document.getElementById("devClose").onclick = function () { closeModal(true); };
    const rb = document.getElementById("devRotateBtn");
    if (rb) rb.onclick = onlDevicesRotateAsk;
    Array.prototype.forEach.call(document.querySelectorAll("[data-devrev]"), function (btn) {
      btn.onclick = function () { onlDevicesRevokeAsk(btn.getAttribute("data-devrev"), vm); };
    });
  });
}
function onlDevicesRevokeAsk(deviceId, vm) {
  const row = vm.devices.filter(function (d) { return d.id === deviceId; })[0];
  const label = row ? row.label : "";
  const selfNote = row && row.current ? " Đây là <b>thiết bị đang dùng</b> — thu hồi xong phiên này sẽ đăng xuất." : "";
  modal("<h3>Thu hồi thiết bị?</h3>"
    + '<p class="desc">Ngắt phiên đăng nhập của <b>' + esc(label) + "</b> ngay lập tức." + selfNote + "</p>"
    + '<div class="btnrow"><button class="btn red" id="devRevokeYes">Thu hồi</button><button class="btn" id="devRevokeNo">Hủy</button></div>', function () {
    document.getElementById("devRevokeNo").onclick = function () { closeModal(true); onlDevicesShow(vm); };
    const yes = document.getElementById("devRevokeYes");
    yes.onclick = async function () {
      yes.disabled = true;
      const res = await devDoRevoke({ api: onlApi }, deviceId, row);
      if (!res.ok) { toast(res.msg); onlDevicesModal(); return; }
      if (res.wasCurrent) {
        // Token của phiên này đã chết -> dọn session ngay, không đợi 401 ở call sau.
        if (typeof onlGuarded401 === "function") onlGuarded401(true);
        toast("Đã thu hồi — phiên đăng nhập này đã kết thúc");
        closeModal(true);
        if (typeof renderMore === "function") renderMore();
        return;
      }
      toast("Đã thu hồi thiết bị " + label);
      onlDevicesModal();
    };
  });
}
function onlDevicesRotateAsk() {
  modal("<h3>Đổi mã khôi phục?</h3>"
    + '<p class="desc">Mã mới sẽ <b>hiện 1 lần duy nhất</b> — lưu ngay vào nơi an toàn, đóng khung này là mất. '
    + "Mã cũ vẫn dùng được thêm <b>24 giờ</b> cho các tab đang mở, sau đó hết hiệu lực.</p>"
    + '<div class="btnrow"><button class="btn" id="devRotateYes">Đổi mã</button><button class="btn" id="devRotateNo">Hủy</button></div>', function () {
    document.getElementById("devRotateNo").onclick = function () { closeModal(true); };
    const yes = document.getElementById("devRotateYes");
    yes.onclick = async function () {
      yes.disabled = true;
      const res = await devDoRotate({ api: onlApi, getAcc: onlGet, setAcc: onlSet });
      if (!res.ok) { toast(res.msg); closeModal(true); return; }
      if (res.rotated !== "primary" || !res.token) { toast("Phiên này không đổi được mã khôi phục chính"); closeModal(true); return; }
      onlDevicesShowToken(res.token, res.grace_hours);
    };
  });
}
/* Hiện token mới 1 lần duy nhất (modal khóa, gán qua textContent). */
function onlDevicesShowToken(token, graceHours) {
  modal("<h3>Mã khôi phục mới</h3>"
    + '<p class="desc"><b class="bad">Chỉ hiện 1 lần duy nhất.</b> Lưu ngay vào nơi an toàn. '
    + "Mã cũ còn hiệu lực " + (graceHours || 24) + " giờ.</p>"
    + '<div class="card"><div class="row"><code id="devNewToken" style="flex:1;word-break:break-all;user-select:all"></code>'
    + '<button class="btn sm" id="devCopyToken">Sao chép</button></div></div>'
    + '<div class="btnrow"><button class="btn" id="devTokenDone">Đã lưu xong</button></div>', function () {
    document.getElementById("devNewToken").textContent = token;
    document.getElementById("devCopyToken").onclick = async function () {
      try { await navigator.clipboard.writeText(token); toast("Đã sao chép mã"); }
      catch (e) { toast("Sao chép lỗi — bôi đen mã rồi copy tay"); }
    };
    document.getElementById("devTokenDone").onclick = function () { closeModal(true); onlDevicesModal(); };
  }, true);
}
