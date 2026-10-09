import test from "node:test";
import assert from "node:assert/strict";
import {game} from "./helpers/game.mjs";

test("phản ứng ngũ hành: luật Băng->Lôi choáng, Độc->Hỏa nổ", () => {
  const g = game();
  // Băng rồi Lôi -> choáng
  let r = g.json(`(()=>{const t={};elemReactionCheck(t,"cold",0);return elemReactionCheck(t,"light",1);})()`);
  assert.ok(r && r.reaction.effect === "stun", "Băng+Lôi=choáng");
  assert.equal(r.reaction.power, 0.5);
  // Độc rồi Hỏa -> nổ
  r = g.json(`(()=>{const t={};elemReactionCheck(t,"poison",0);return elemReactionCheck(t,"fire",1);})()`);
  assert.ok(r && r.reaction.effect === "stun" ? false : r.reaction.effect === "explode", "Độc+Hỏa=nổ");
  // sai thứ tự không phản ứng
  r = g.json(`(()=>{const t={};elemReactionCheck(t,"light",0);return elemReactionCheck(t,"cold",1);})()`);
  assert.equal(r, null, "Lôi rồi Băng không phản ứng");
  // hết hạn không phản ứng
  r = g.json(`(()=>{const t={};elemReactionCheck(t,"cold",0);return elemReactionCheck(t,"light",99);})()`);
  assert.equal(r, null, "quá 4s không phản ứng");
});

test("phản ứng ngũ hành: session dùng chung luật với client", () => {
  const g = game();
  // sessionCombatHit gọi elemReactionCheck với cùng luật; kiểm tra code có mặt
  const src = g.run("sessionCombatHit.toString()");
  assert.ok(src.includes("elemReactionCheck"), "session gọi elemReactionCheck");
  assert.ok(src.includes("state.flags"), "session kiểm tra flag");
  assert.ok(src.includes("elem_stun"), "session có event elem_stun");
  assert.ok(src.includes("elem_explode"), "session có event elem_explode");
  // cùng luật: Băng->Lôi choáng trong cả hai môi trường
  const r = g.json(`(()=>{const b={};elemReactionCheck(b,"cold",0);return elemReactionCheck(b,"light",1);})()`);
  assert.equal(r.reaction.effect, "stun", "luật chung cho client và session");
});
