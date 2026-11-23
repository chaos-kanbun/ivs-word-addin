// 新字体・旧字体の変換ロジック(純粋関数。ブラウザ・Node 両方で動く ES module)
//
// 辞書(data/shinkyu.json)の形式: { "亜": ["亞"], "弁": ["辨", "瓣", "辯"], ... }
//   キー = 常用漢字表の通用字体(新字体)、値 = 旧字体(康熙字典体)の配列

import { splitClusters } from "./ivs.js";

/**
 * 辞書から、新→旧・旧→新の両方向の対応表を作る。
 * @param {Object<string,string[]>} table 辞書
 * @param {Map<string,string>} [svs] 標準化異体字 → 対応する CJK 互換漢字(例: "逸\uFE01" → "\uFA67")。
 *   旧字体が互換漢字で書かれている字について、「基底文字 + 異体字セレクタ」の形も旧字体として扱うために使う。
 */
export function buildMaps(table, svs = new Map()) {
  const toOld = new Map();
  const toNew = new Map();
  for (const [n, olds] of Object.entries(table)) {
    toOld.set(n, olds.slice());
    for (const o of olds) {
      const arr = toNew.get(o) || [];
      if (!arr.includes(n)) arr.push(n);
      toNew.set(o, arr);
    }
  }
  for (const [seq, compat] of svs) {
    if (toNew.has(compat) && !toNew.has(seq)) toNew.set(seq, toNew.get(compat));
  }
  return { toOld, toNew };
}

/** ivd.json(StandardizedVariants を含む)から、標準化異体字 → CJK 互換漢字 の対応を作る */
export function svsFromIndex(index) {
  const out = new Map();
  if (!index) return out;
  for (const [baseHex, list] of Object.entries(index)) {
    for (const [vsHex, collection, id] of list) {
      if (collection !== "StandardizedVariants") continue;
      const m = /^CJK COMPATIBILITY IDEOGRAPH-([0-9A-F]+)$/.exec(id);
      if (!m) continue;
      out.set(
        String.fromCodePoint(parseInt(baseHex, 16), parseInt(vsHex, 16)),
        String.fromCodePoint(parseInt(m[1], 16))
      );
    }
  }
  return out;
}

/**
 * 変換の計画を立てる(文書にはまだ触らない)。
 * @param {string} text 対象のテキスト
 * @param {"toOld"|"toNew"} direction
 * @param {{toOld:Map, toNew:Map}} maps
 * @param {Object<string,string>} choices 変換先が複数ある字の選択 { "弁": "辯" }。未選択は変換しない。
 * @returns {{
 *   text: string,                       変換後のテキスト
 *   count: number,                      変換した文字数
 *   changes: Map<string,string>,        変換元(異体字セレクタ付きを含む) → 変換先(重複なし)
 *   ambiguous: {char:string, options:string[]}[],  変換先が複数ある字
 *   parts: {text:string, changed:boolean}[]        プレビュー用
 * }}
 */
export function planConversion(text, direction, maps, choices = {}) {
  const map = direction === "toOld" ? maps.toOld : maps.toNew;
  const ambiguous = new Map();
  const changes = new Map();
  const parts = [];
  let count = 0;

  for (const c of splitClusters(text)) {
    const ch = String.fromCodePoint(c.base);
    // 「基底文字 + 標準化異体字セレクタ」が旧字体にあたる場合を先に調べる(新字体へ変換するとき)
    const cand = (c.vs != null && map.get(c.text)) || map.get(ch);
    let to = null;
    if (cand) {
      if (cand.length === 1) {
        to = cand[0];
      } else {
        if (!ambiguous.has(ch)) ambiguous.set(ch, cand);
        const pick = choices[ch];
        if (pick && cand.includes(pick)) to = pick;
      }
    }
    if (to == null) {
      parts.push({ text: c.text, changed: false });
    } else {
      // 変換した字に付いていた異体字セレクタは外す(新しい字との組み合わせが未登録になるため)
      changes.set(c.text, to);
      parts.push({ text: to, changed: true });
      count++;
    }
  }
  return {
    text: parts.map((p) => p.text).join(""),
    count,
    changes,
    ambiguous: [...ambiguous].map(([char, options]) => ({ char, options })),
    parts,
  };
}
