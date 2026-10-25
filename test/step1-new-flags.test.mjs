import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

// Bước 1 jx-idle: 7 flag mới, đăng ký mặc định OFF (xem BRAINSTORM-v2.3 + STEP1-REPORT).
// Bước 6 đổi luật (bật có kiểm soát, xem DECISIONS-LOG-3): cả 7 flag nay mặc định
// ON ở đúng mode đã đăng ký — test mặc định dưới đây khóa luật mới, không phải
// luật Bước 1. Nhánh OFF vẫn được bao phủ bằng override false tường minh.
// "Local" = chế độ chơi offline không đồng bộ, KHÔNG phải mode id thứ 4 trong
// registry (registry chỉ có ctc/phlt/g2). Vì vậy 3 flag Lát T đăng ký modes
// [phlt, g2] và bị từ chối ở ctc — đúng ví dụ gate trong brief bước 1; phần
// "Local" là phạm vi chạy offline không đồng bộ, loại trừ khỏi đồng bộ CTC,
// không phải một mode bật được qua featureEnabled.
// online: false cho cả 7 flag vì không flag nào tự mở kênh đồng bộ mới:
// farm_schedule ở Thủ Lĩnh CTC vẫn đi qua receipt CTC hiện có, không tạo
// kênh online mới; Lát T không chạm CTC/BXH/Thủ Lĩnh bang.
const THREE_MODE = ["loot_records", "appearance_change", "build_presets", "farm_schedule"];
const LAT_T = ["trigger_deck", "companion", "trophy_charm"];
const ALL = [...THREE_MODE, ...LAT_T];

test("7 flag mới mặc định ON ở đúng mode đã đăng ký (Bước 6); Lát T vẫn từ chối CTC", () => {
  const g = game();
  for (const flag of THREE_MODE) {
    for (const mode of ["ctc", "phlt", "g2"]) {
      assert.equal(
        g.run(`featureEnabled("${flag}","${mode}")`), true,
        `${flag} phải ON mặc định ở ${mode} (Bước 6)`);
    }
  }
  for (const flag of LAT_T) {
    assert.equal(g.run(`featureEnabled("${flag}","phlt")`), true, `${flag} phải ON mặc định ở phlt (Bước 6)`);
    assert.equal(g.run(`featureEnabled("${flag}","g2")`), true, `${flag} phải ON mặc định ở g2 (Bước 6)`);
    assert.equal(g.run(`featureEnabled("${flag}","ctc")`), false, `${flag} vẫn bị từ chối ở ctc dù mặc định ON`);
  }
});

test("override true chỉ bật đúng mode đã đăng ký; flag Lát T không bật được ở CTC", () => {
  const g = game();
  for (const flag of THREE_MODE) {
    for (const mode of ["ctc", "phlt", "g2"]) {
      assert.equal(
        g.run(`featureEnabled("${flag}","${mode}",{${flag}:true})`), true,
        `${flag} phải bật được ở ${mode} khi override true`);
    }
  }
  for (const flag of LAT_T) {
    assert.equal(g.run(`featureEnabled("${flag}","phlt",{${flag}:true})`), true,
      `${flag} phải bật được ở phlt khi override true`);
    assert.equal(g.run(`featureEnabled("${flag}","g2",{${flag}:true})`), true,
      `${flag} phải bật được ở g2 khi override true`);
    assert.equal(g.run(`featureEnabled("${flag}","ctc",{${flag}:true})`), false,
      `${flag} (Local/PHLT/2.0) không được bật ở ctc dù override true`);
  }
  assert.equal(g.run(`featureEnabled("loot_records","không_phải_mode",{loot_records:true})`), false,
    "mode không hợp lệ phải bị từ chối");
  assert.equal(g.run(`featureEnabled("chưa_đăng_ký","ctc",{chưa_đăng_ký:true})`), false,
    "flag chưa đăng ký phải bị từ chối");
});

test("override false hoặc giá trị không boolean không bật được flag; sandbox không tắt flag offline", () => {
  const g = game();
  for (const flag of ALL) {
    for (const mode of ["ctc", "phlt", "g2"]) {
      assert.equal(g.run(`featureEnabled("${flag}","${mode}",{${flag}:false})`), false,
        `${flag} override false phải vẫn OFF ở ${mode}`);
    }
    // Giá trị không boolean bị bỏ qua → rơi về mặc định (Bước 6: ON) chứ không phải OFF.
    assert.equal(g.run(`featureEnabled("${flag}","phlt",{${flag}:"true"})`), true,
      `${flag} giá trị không boolean phải rơi về mặc định ON (Bước 6)`);
  }
  // Cả 7 flag đều online:false nên sandbox không tắt chúng (khác với flag online).
  assert.equal(g.run(`featureEnabled("trigger_deck","phlt",{trigger_deck:true},true)`), true,
    "trigger_deck offline không bị sandbox tắt");
  assert.equal(g.run(`featureEnabled("loot_records","ctc",{loot_records:true},true)`), true,
    "loot_records offline không bị sandbox tắt");
});
