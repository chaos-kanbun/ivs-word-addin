// 実行: node --test
// 注意: ここで使う辞書は動作確認用の小さな合成データです(常用漢字表そのものではありません)。
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { buildMaps, planConversion } from "../docs/kyushin.js";

const IVS = "\u{E0100}";
const maps = buildMaps({
  国: ["國"],
  学: ["學"],
  弁: ["辨", "瓣", "辯"],
  芸: ["藝"],
});

test("新→旧: 1対1は自動変換、それ以外はそのまま", () => {
  const p = planConversion("国と学と漢字", "toOld", maps);
  assert.equal(p.text, "國と學と漢字");
  assert.equal(p.count, 2);
  assert.deepEqual(p.ambiguous, []);
});

test("旧→新", () => {
  const p = planConversion("國學藝", "toNew", maps);
  assert.equal(p.text, "国学芸");
});

test("旧→新: 変換先が複数ある旧字体は新字体1つに戻る", () => {
  const p = planConversion("辨瓣辯", "toNew", maps);
  assert.equal(p.text, "弁弁弁");
  assert.equal(p.count, 3);
  assert.deepEqual(p.ambiguous, []);
});

test("新→旧: 変換先が複数ある字は、選ぶまで変換しない", () => {
  const p = planConversion("弁と国", "toOld", maps);
  assert.equal(p.text, "弁と國");
  assert.equal(p.count, 1);
  assert.deepEqual(p.ambiguous, [{ char: "弁", options: ["辨", "瓣", "辯"] }]);
});

test("新→旧: 選択を渡すと変換する。候補にない選択は無視", () => {
  assert.equal(planConversion("弁", "toOld", maps, { 弁: "辯" }).text, "辯");
  assert.equal(planConversion("弁", "toOld", maps, { 弁: "X" }).text, "弁");
});

test("異体字セレクタ付きの字は、セレクタを外して変換する", () => {
  const p = planConversion("国" + IVS + "国", "toOld", maps);
  assert.equal(p.text, "國國");
  assert.equal(p.changes.get("国" + IVS), "國");
  assert.equal(p.changes.get("国"), "國");
});

test("parts は変換箇所の印を持つ", () => {
  const p = planConversion("あ国", "toOld", maps);
  assert.deepEqual(p.parts, [
    { text: "あ", changed: false },
    { text: "國", changed: true },
  ]);
});

// 同梱辞書(docs/data/shinkyu.json)があるときの基本チェック
const dictUrl = new URL("../docs/data/shinkyu.json", import.meta.url);
test("同梱辞書: 形式と往復変換", { skip: !existsSync(dictUrl) }, () => {
  const table = JSON.parse(readFileSync(dictUrl, "utf8"));
  for (const [n, olds] of Object.entries(table)) {
    assert.equal(Array.from(n).length, 1, `キーが1文字でない: ${n}`);
    assert.ok(Array.isArray(olds) && olds.length > 0, `旧字体が空: ${n}`);
    for (const o of olds) assert.equal(Array.from(o).length, 1, `旧字体が1文字でない: ${n}`);
  }
  const m = buildMaps(table);
  for (const [n, olds] of Object.entries(table)) {
    for (const o of olds) assert.ok(m.toNew.get(o).includes(n), `${o} → ${n} に戻れない`);
  }
});

// ---- 同梱辞書(文化庁 常用漢字表 平成22年告示 の本表から作成)での確認 ----
import { svsFromIndex } from "../docs/kyushin.js";
const ivdUrl = new URL("../docs/data/ivd.json", import.meta.url);
const haveBoth = existsSync(dictUrl) && existsSync(ivdUrl);

test("同梱辞書: 新字体362字・旧字体364組", { skip: !existsSync(dictUrl) }, () => {
  const table = JSON.parse(readFileSync(dictUrl, "utf8"));
  assert.equal(Object.keys(table).length, 362);
  assert.equal(Object.values(table).reduce((a, v) => a + v.length, 0), 364);
  assert.deepEqual(table["弁"], ["辨", "瓣", "辯"]);
  assert.deepEqual(table["亀"], ["龜"]);
  assert.deepEqual(table["餅"], ["餠"]);
  for (const [n, o] of Object.entries({ 国: "國", 学: "學", 恋: "戀", 台: "臺", 真: "眞" })) {
    assert.deepEqual(table[n], [o]);
  }
});

test("同梱辞書: 旧字体が互換漢字の字(逸)は、互換漢字へ変換し、戻せる", { skip: !existsSync(dictUrl) }, () => {
  const maps = buildMaps(JSON.parse(readFileSync(dictUrl, "utf8")));
  assert.equal(planConversion("逸", "toOld", maps).text, "逸");
  assert.equal(planConversion("逸", "toNew", maps).text, "逸");
});

test("標準化異体字(逸+VS2)も旧字体として新字体に変換できる", { skip: !haveBoth }, () => {
  const maps = buildMaps(
    JSON.parse(readFileSync(dictUrl, "utf8")),
    svsFromIndex(JSON.parse(readFileSync(ivdUrl, "utf8")))
  );
  const p = planConversion("逸︁と逸", "toNew", maps);
  assert.equal(p.text, "逸と逸");
  assert.equal(p.count, 1);
  // 新字体→旧字体は、セレクタ付きでも互換漢字に変換される
  assert.equal(planConversion("逸︁", "toOld", maps).text, "逸");
});

test("svsFromIndex: 合成データ", () => {
  const m = svsFromIndex({
    "9038": [["FE01", "StandardizedVariants", "CJK COMPATIBILITY IDEOGRAPH-FA67"], ["E0100", "Adobe-Japan1", "CID+1"]],
  });
  assert.equal(m.get("逸︁"), "逸");
  assert.equal(m.size, 1);
});
