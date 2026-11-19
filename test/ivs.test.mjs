// 実行: node --test test/
// 注意: 下のサンプル行は形式確認用の合成データ(実データではありません)。
import test from "node:test";
import assert from "node:assert/strict";
import {
  isVS, splitClusters, stripVS, countVS, replaceCluster,
  parseIvdSequences, parseStandardizedVariants, buildIndex, candidatesFor, toSequence,
} from "../docs/ivs.js";

const IVS1 = "\u{E0100}";
const IVS2 = "\u{E0101}";

test("isVS", () => {
  assert.ok(isVS(0xfe00) && isVS(0xe0100) && isVS(0xe01ef));
  assert.ok(!isVS(0x845b) && !isVS(0xe01f0));
});

test("splitClusters: 基底+IVS、サロゲートペアの基底、単独VS", () => {
  const t = "葛" + IVS1 + "城" + "\u{20B9F}" + IVS2 + IVS1;
  const c = splitClusters(t);
  assert.equal(c.length, 4);
  assert.equal(c[0].text, "葛" + IVS1);
  assert.equal(c[1].vs, null);
  assert.equal(c[2].base, 0x20b9f);
  assert.equal(c[2].vs, 0xe0101);
  assert.equal(c[3].base, 0xe0100); // 孤立したVSはそれ自体を1クラスタ
});

test("stripVS / countVS", () => {
  const t = "辻" + IVS1 + "斎︀";
  assert.equal(countVS(t), 2);
  assert.equal(stripVS(t), "辻斎");
});

test("replaceCluster", () => {
  const cl = splitClusters("A" + "葛" + IVS1 + "B");
  assert.equal(replaceCluster(cl, 1, "葛" + IVS2), "A葛" + IVS2 + "B");
  assert.equal(replaceCluster(cl, 1, "葛"), "A葛B");
});

test("parseIvdSequences / buildIndex / candidatesFor (合成データ)", () => {
  const txt = [
    "# comment",
    "",
    "845B E0100; Test-Coll-A; ID-1",
    "845B E0101; Test-Coll-A; ID-2",
    "845B E0100; Test-Coll-B; ID-9 # trailing",
    "xxxx E0100; Bad; line",
    "845B 0041; Bad; notVS",
  ].join("\n");
  const rows = parseIvdSequences(txt);
  assert.equal(rows.length, 3);
  const idx = buildIndex([...rows, ...rows]); // 重複は除去される
  assert.deepEqual(idx["845B"], [
    ["E0100", "Test-Coll-A", "ID-1"],
    ["E0100", "Test-Coll-B", "ID-9"],
    ["E0101", "Test-Coll-A", "ID-2"],
  ]);
  const c = candidatesFor(idx, 0x845b);
  assert.equal(c.length, 3);
  assert.equal(toSequence(0x845b, c[2].vs), "葛" + IVS2);
  assert.equal(candidatesFor(idx, 0x4e00).length, 0);
});

test("parseStandardizedVariants: CJK以外は除外 (合成データ)", () => {
  const txt = ["4FAE FE00; TEST DESC; # c", "0030 FE00; digit; x", "0041 FE0E; text; y"].join("\n");
  const rows = parseStandardizedVariants(txt);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].base, 0x4fae);
  assert.equal(rows[0].collection, "StandardizedVariants");
});
