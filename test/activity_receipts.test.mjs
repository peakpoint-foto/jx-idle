import test from "node:test";
import assert from "node:assert/strict";
import { game } from "./helpers/game.mjs";

test("activity receipts survive an offline send and retry idempotently in order", async () => {
  const g = game();
  g.run("fixture('ctc');onlSet({id:'account',token:'token'});activityReceiptEnqueue({id:'tower-20261008-abc12345',kind:'tower',stage:{floor:3},contribution:{kills:12,cleared:2}})");
  g.run("globalThis.receiptCalls=[];globalThis.receiptFail=true;onlApi=async (path,opt)=>{receiptCalls.push(opt.body);if(receiptFail)throw {code:'offline'};return {accepted:true,duplicate:receiptCalls.length>1}}");
  assert.equal(await g.run("activityRetryReceipts()"), 0);
  assert.equal(g.json("activityReceiptRead().length"), 1);
  g.run("receiptFail=false");
  assert.equal(await g.run("activityRetryReceipts()"), 1);
  assert.equal(g.json("activityReceiptRead().length"), 0);
  assert.equal(g.json("receiptCalls.map(x=>x.event_key)" ).length, 2);
  assert.equal(JSON.stringify(g.json("receiptCalls[0]")), JSON.stringify(g.json("receiptCalls[1]")));
});

test("activity receipt queue deduplicates event keys and stays bounded", () => {
  const g = game();
  g.run("fixture('ctc')");
  for (let i = 0; i < 20; i++) g.run(`activityReceiptEnqueue({id:'tower-20261008-${String(i).padStart(8,'0')}',kind:'tower',stage:{},contribution:{kills:1,cleared:1}})`);
  g.run("activityReceiptEnqueue({id:'tower-20261008-00000019',kind:'tower',stage:{},contribution:{kills:1,cleared:1}})");
  assert.equal(g.json("activityReceiptRead().length"), 16);
  assert.equal(g.json("new Set(activityReceiptRead().map(x=>x.event_key)).size"), 16);
  assert.equal(g.json("activityReceiptRead()[0].event_key"), "tower-20261008-00000004");
});

test("activity receipts do not enqueue outside CTC or for malformed run IDs", async () => {
  const g = game();
  assert.equal(g.run("activityReceiptEnqueue({id:'bad',kind:'tower',stage:{},contribution:{}})"), false);
  assert.equal(g.json("activityReceiptRead().length"), 0);
  assert.equal(g.run("fixture('phlt');activityReceiptEnqueue({id:'tower-20261008-abc12345',kind:'tower',stage:{},contribution:{}})"), false);
  assert.equal(g.json("activityReceiptRead().length"), 0);
  assert.equal(await g.run("activityRetryReceipts()"), 0);
});
