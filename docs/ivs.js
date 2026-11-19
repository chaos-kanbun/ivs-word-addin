// IVS / 異体字セレクタ関連の純粋関数(ブラウザ・Node 両方で動く ES module)

/** 異体字セレクタ(VS1-16: FE00-FE0F, VS17-256: E0100-E01EF)か */
export function isVS(cp) {
  return (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
}

export function cpHex(cp) {
  return cp.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * 文字列を「基底文字 + 後続の異体字セレクタ(0〜1個)」のクラスタに分割する。
 * 先頭が VS 単独の場合は、それ自体を基底文字として扱う。
 * @returns {{base:number, vs:number|null, text:string}[]}
 */
export function splitClusters(text) {
  const cps = Array.from(text, (ch) => ch.codePointAt(0));
  const out = [];
  for (let i = 0; i < cps.length; i++) {
    const base = cps[i];
    let vs = null;
    if (!isVS(base) && i + 1 < cps.length && isVS(cps[i + 1])) {
      vs = cps[i + 1];
      i++;
    }
    const str = String.fromCodePoint(base) + (vs !== null ? String.fromCodePoint(vs) : "");
    out.push({ base, vs, text: str });
  }
  return out;
}

/** 文字列からすべての異体字セレクタを取り除く */
export function stripVS(text) {
  return Array.from(text)
    .filter((ch) => !isVS(ch.codePointAt(0)))
    .join("");
}

export function countVS(text) {
  return Array.from(text).filter((ch) => isVS(ch.codePointAt(0))).length;
}

/** クラスタ列のうち index 番目を newText に差し替えた全体の文字列を返す */
export function replaceCluster(clusters, index, newText) {
  return clusters.map((c, i) => (i === index ? newText : c.text)).join("");
}

// ---- データ (ivd.json) ----
// 形式: { "845B": [["E0100","Adobe-Japan1","CID+1481"], ...], ... }
// キーは基底文字のコードポイント(16進・大文字)。

const CJK_RANGES = [
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0x20000, 0x3ffff],
];
const inCJK = (cp) => CJK_RANGES.some(([a, b]) => cp >= a && cp <= b);

/**
 * IVD_Sequences.txt をパースする。
 * 行形式: `845B E0100; Adobe-Japan1; CID+1481`
 */
export function parseIvdSequences(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [seq, collection, id] = line.split(";").map((s) => s.trim());
    if (!seq || !collection) continue;
    const [b, v] = seq.split(/\s+/);
    if (!b || !v) continue;
    const base = parseInt(b, 16);
    const vs = parseInt(v, 16);
    if (Number.isNaN(base) || !isVS(vs)) continue;
    rows.push({ base, vs, collection, id: id || "" });
  }
  return rows;
}

/**
 * StandardizedVariants.txt から CJK 漢字のみを取り出す。
 * 行形式: `<base> <vs>; <説明>; <字形環境>`
 */
export function parseStandardizedVariants(text) {
  const rows = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const [seq, desc] = line.split(";").map((s) => s.trim());
    if (!seq) continue;
    const [b, v] = seq.split(/\s+/);
    if (!b || !v) continue;
    const base = parseInt(b, 16);
    const vs = parseInt(v, 16);
    if (Number.isNaN(base) || !isVS(vs) || !inCJK(base)) continue;
    rows.push({ base, vs, collection: "StandardizedVariants", id: desc || "" });
  }
  return rows;
}

export function buildIndex(rows) {
  const index = {};
  const seen = new Set();
  for (const r of rows) {
    const key = cpHex(r.base);
    const vsHex = cpHex(r.vs);
    const dedup = `${key}|${vsHex}|${r.collection}|${r.id}`;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    (index[key] ||= []).push([vsHex, r.collection, r.id]);
  }
  for (const k of Object.keys(index)) {
    index[k].sort((a, b) => parseInt(a[0], 16) - parseInt(b[0], 16) || a[1].localeCompare(b[1]));
  }
  return index;
}

/** 基底文字に対する候補 [{vs, collection, id}] */
export function candidatesFor(index, baseCp) {
  const list = (index && index[cpHex(baseCp)]) || [];
  return list.map(([vs, collection, id]) => ({ vs: parseInt(vs, 16), collection, id }));
}

export function toSequence(baseCp, vsCp) {
  return String.fromCodePoint(baseCp) + (vsCp == null ? "" : String.fromCodePoint(vsCp));
}
