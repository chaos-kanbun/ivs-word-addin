import {
  splitClusters,
  candidatesFor,
  toSequence,
  stripVS,
  countVS,
  replaceCluster,
  cpHex,
  glyphWikiName,
  glyphWikiUrl,
} from "./ivs.js";
import { buildMaps, planConversion, svsFromIndex } from "./kyushin.js";

const $ = (id) => document.getElementById(id);
const MAX_CHIPS = 300;

const state = {
  index: null, // ivd.json の中身
  selText: "", // Word 上の選択範囲のテキスト
  clusters: [], // 現在の対象テキストのクラスタ
  target: 0, // 対象クラスタの位置
  collection: "", // 絞り込み
  inWord: false,
  kyushin: null, // 新旧字体の対応表(buildMaps の結果)
  kdir: null, // 直近の変換方向 "toOld" | "toNew"
};

// ---------- 表示ユーティリティ ----------
function status(msg, isErr = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (isErr ? " err" : "");
}

const visible = (s) => (s === "\r" || s === "\n" ? "↵" : s === "\t" ? "⇥" : s === " " ? "␣" : s);

// ---------- データ読み込み ----------
// 同梱の data/ivd.json(Unicode IVD + StandardizedVariants から生成)を起動時に読み込む。
async function loadIndex() {
  try {
    const res = await fetch("./data/ivd.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.index = await res.json();
  } catch (e) {
    state.index = null;
    status("異体字データ(data/ivd.json)を読み込めませんでした。ネット接続と、データファイルの公開状況を確認してください。", true);
  }
}

// ---------- 対象テキストの決定 ----------
function sourceText() {
  return state.selText;
}

// 「Moji_Joho のみ表示」が ON のとき、候補を Moji_Joho コレクションに限定する
const isMojiJoho = (name) => /^moji[_-]?joho$/i.test(name);

function visibleCandidates(baseCp) {
  const all = candidatesFor(state.index, baseCp);
  return $("mjOnly").checked ? all.filter((c) => isMojiJoho(c.collection)) : all;
}

function hasCandidates(c) {
  return visibleCandidates(c.base).length > 0;
}

function recompute(keepTarget = false) {
  const text = sourceText();
  const prevLen = state.clusters.length;
  state.clusters = splitClusters(text);
  if (!(keepTarget && state.clusters.length === prevLen && state.target < prevLen)) {
    const i = state.clusters.findIndex(hasCandidates);
    state.target = i >= 0 ? i : 0;
  }
  render();
}

// ---------- 描画 ----------
function render() {
  // 対象文字のチップ
  const chips = $("chips");
  chips.textContent = "";
  const cl = state.clusters;
  if (cl.length === 0) {
    const p = document.createElement("span");
    p.className = "muted";
    p.textContent = "Word で文字を選択してください";
    chips.appendChild(p);
  }
  cl.slice(0, MAX_CHIPS).forEach((c, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "chip" + (i === state.target ? " on" : "") + (hasCandidates(c) ? " has" : " dim");
    b.textContent = visible(c.text);
    b.title = "U+" + [c.base, c.vs].filter((x) => x != null).map(cpHex).join(" U+");
    b.addEventListener("click", () => {
      state.target = i;
      render();
    });
    chips.appendChild(b);
  });
  if (cl.length > MAX_CHIPS) status(`先頭 ${MAX_CHIPS} 文字のみ表示しています。`);

  // 現在の状態
  const cur = cl[state.target];
  $("current").textContent = cur
    ? `U+${cpHex(cur.base)}` + (cur.vs != null ? ` + U+${cpHex(cur.vs)}` : "(異体字セレクタなし)")
    : "";

  renderCandidates(cur);
}

function renderCandidates(cur) {
  const cards = $("cards");
  cards.textContent = "";
  const sel = $("collection");

  if (!cur) {
    sel.replaceChildren();
    return;
  }
  const all = visibleCandidates(cur.base);

  // コレクション絞り込みの選択肢
  const cols = [...new Set(all.map((c) => c.collection))];
  if (state.collection && !cols.includes(state.collection)) state.collection = "";
  sel.replaceChildren(new Option("すべて", ""), ...cols.map((c) => new Option(c, c)));
  sel.value = state.collection;

  // 基本字形(IVSなし)
  cards.appendChild(makeCard(cur.base, null, "基本字形", "", cur.vs == null));

  const list = state.collection ? all.filter((c) => c.collection === state.collection) : all;
  for (const c of list) {
    cards.appendChild(makeCard(cur.base, c.vs, c.collection, c.id, cur.vs === c.vs));
  }
  if (all.length === 0) {
    const p = document.createElement("div");
    p.className = "empty";
    const hiddenOthers = state.index && $("mjOnly").checked && candidatesFor(state.index, cur.base).length > 0;
    p.textContent = !state.index
      ? "データが読み込まれていません。"
      : hiddenOthers
        ? "この文字には Moji_Joho の異体字がありません(他のコレクションは、チェックを外すと表示されます)。"
        : "この文字には登録済みの異体字がありません。";
    cards.appendChild(p);
  }
}

function makeCard(base, vs, collection, id, isCurrent) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "card" + (isCurrent ? " cur" : "");
  const seq = toSequence(base, vs);
  const g = document.createElement("span");
  g.className = "glyph";
  g.textContent = seq;
  const fb = document.createElement("span");
  fb.className = "fb";
  fb.textContent = "フォント表示";
  fb.hidden = true;
  let visual = g;
  {
    // GlyphWiki の字形画像。読み込めなければフォント表示に戻す
    const img = new Image();
    img.className = "gimg";
    img.alt = seq;
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.replaceWith(g);
      fb.hidden = false;
    });
    img.src = glyphWikiUrl(glyphWikiName(base, vs));
    visual = img;
  }
  const cp = document.createElement("span");
  cp.className = "cp";
  cp.textContent = "U+" + cpHex(base) + (vs != null ? " U+" + cpHex(vs) : "");
  const col = document.createElement("span");
  col.className = "col";
  col.textContent = id ? `${collection} ${id}` : collection;
  b.append(visual, cp, col, fb);
  b.title = col.textContent;
  b.addEventListener("click", () => applyVariant(toSequence(base, vs)));
  return b;
}

// ---------- Word 操作 ----------
async function readSelection(keepTarget = true) {
  if (!state.inWord) return;
  try {
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load("text");
      await ctx.sync();
      state.selText = sel.text || "";
    });
    recompute(keepTarget);
  } catch (e) {
    status("選択範囲を読み取れませんでした: " + e.message, true);
  }
}

// 選択範囲の中の指定した文字だけを、検索・置換で差し替える。
// 周りの文字や書式には触れないので、フォントなどの体裁は元のまま保たれる。
// ops: [{from, to, nth}]  nth が null なら該当をすべて、数字ならその番目だけ置換する。
// 終わったら、元の選択範囲を選択し直す(見えない しおり で範囲を覚えておく)。
const BOOKMARK = "_ivsSel";
async function replaceInSelection(ops) {
  const len = (o) => Array.from(o.from).length;
  await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    let marked = false;
    try {
      sel.insertBookmark(BOOKMARK);
      await ctx.sync();
      marked = true;
    } catch (e) { /* しおりが使えなくても置換は続ける */ }
    // 異体字セレクタ付きの文字を先に、そのあとに単独の文字を処理する
    const replaced = []; // 置換後の範囲(選択し直すときに使う)
    for (const pass of [ops.filter((o) => len(o) > 1), ops.filter((o) => len(o) === 1)]) {
      if (pass.length === 0) continue;
      const found = pass.map((o) => {
        const r = sel.search(o.from, { matchCase: true });
        r.load("items");
        return r;
      });
      await ctx.sync();
      pass.forEach((o, i) => {
        const items = found[i].items;
        const targets = o.nth == null ? items : items.slice(o.nth, o.nth + 1);
        for (const it of targets) replaced.push(it.insertText(o.to, "Replace"));
      });
      await ctx.sync();
    }
    // 元の選択範囲を選択し直す。しおりの範囲と、置換した範囲をすべて含む範囲を選ぶので、
    // しおりが端で縮んでも、選択が外れたり欠けたりしない。
    let base = sel;
    if (marked) {
      const r = ctx.document.getBookmarkRangeOrNullObject(BOOKMARK);
      r.load("isNullObject");
      await ctx.sync();
      if (!r.isNullObject) base = r;
    }
    let whole = base;
    for (const nr of replaced) whole = whole.expandTo(nr);
    whole.select();
    await ctx.sync();
    if (marked) {
      ctx.document.deleteBookmark(BOOKMARK);
      await ctx.sync();
    }
  });
}

// 対象の字(クラスタ i)が、選択範囲の中で「何番目の該当」かを数える
function nthOf(cl, i) {
  const t = cl[i];
  let n = 0;
  for (let k = 0; k < i; k++) {
    if (t.vs != null ? cl[k].text === t.text : cl[k].base === t.base) n++;
  }
  return n;
}

async function applyVariant(seq) {
  const cl = state.clusters;
  const t = cl[state.target];
  if (!t || !state.inWord) return;
  const newText = replaceCluster(cl, state.target, seq);
  try {
    await replaceInSelection([{ from: t.text, to: seq, nth: nthOf(cl, state.target) }]);
    state.selText = newText;
    recompute(true);
    status("置換しました。");
  } catch (e) {
    status("置換に失敗しました: " + e.message, true);
  }
}

async function stripSelection() {
  const text = sourceText();
  if (!text) return status("文字が選択されていません。", true);
  const n = countVS(text);
  if (n === 0) return status("異体字セレクタは含まれていません。");
  if (!state.inWord) return;
  const ops = [...new Set(splitClusters(text).filter((c) => c.vs != null).map((c) => c.text))].map(
    (from) => ({ from, to: stripVS(from), nth: null })
  );
  try {
    await replaceInSelection(ops);
    state.selText = stripVS(text);
    recompute();
    status(`異体字セレクタを ${n} 個除去しました。`);
  } catch (e) {
    status("除去に失敗しました: " + e.message, true);
  }
}

// ---------- 新字体・旧字体の変換 ----------
async function loadKyushin() {
  try {
    const res = await fetch("./data/shinkyu.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.kyushin = buildMaps(await res.json(), svsFromIndex(state.index));
  } catch (e) {
    state.kyushin = null;
    $("toOld").disabled = true;
    $("toNew").disabled = true;
    status("新旧字体の辞書(data/shinkyu.json)を読み込めませんでした。", true);
  }
}

// 変換を文書に反映する(変えた文字だけを置換し、体裁はそのまま)
async function applyConversion(plan) {
  if (!state.inWord) return;
  const ops = [...plan.changes].map(([from, to]) => ({ from, to, nth: null }));
  await replaceInSelection(ops);
  state.selText = plan.text;
  await readSelection(false); // 変換後の選択範囲から、異体字の候補をすぐに出す
}

// 押したらすぐ変換する。変換先が複数ある字(弁など)だけは、下に候補を出して1クリックで選ぶ。
async function runKyushin(dir, choices = {}) {
  if (!state.kyushin) return;
  const text = sourceText();
  if (!text) return status("文字が選択されていません。", true);
  state.kdir = dir;
  const label = dir === "toOld" ? "旧字体" : "新字体";
  const plan = planConversion(text, dir, state.kyushin, choices);
  try {
    if (plan.count > 0) await applyConversion(plan);
  } catch (e) {
    return status("変換に失敗しました: " + e.message, true);
  }
  // まだ選ぶ必要のある字(変換先が複数ある字)
  const rest = planConversion(plan.text, dir, state.kyushin, {}).ambiguous;
  renderKyushinChoices(rest);
  const hint = rest.length ? "変換先が複数ある字は、下の候補から選んでください。" : "";
  if (plan.count > 0) status(`${plan.count} 文字を${label}に変換しました。${hint}`);
  else status(rest.length ? hint : "変換する字がありません。");
}

function renderKyushinChoices(ambiguous) {
  const panel = $("kyushinPanel");
  const box = $("kyushinChoices");
  box.textContent = "";
  panel.hidden = ambiguous.length === 0;
  for (const a of ambiguous) {
    const row = document.createElement("div");
    row.className = "choice";
    const from = document.createElement("span");
    from.className = "from";
    from.textContent = a.char;
    row.append(from, document.createTextNode("→"));
    for (const o of a.options) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = o;
      b.addEventListener("click", () => runKyushin(state.kdir, { [a.char]: o }));
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}

// ---------- 起動 ----------
function bind() {
  $("collection").addEventListener("change", (e) => {
    state.collection = e.target.value;
    render();
  });
  $("mjOnly").addEventListener("change", () => {
    try { localStorage.setItem("ivs.mjOnly", $("mjOnly").checked ? "1" : "0"); } catch {}
    state.collection = "";
    recompute(true);
  });
  $("toOld").addEventListener("click", () => runKyushin("toOld"));
  $("toNew").addEventListener("click", () => runKyushin("toNew"));
  $("kyushinCancel").addEventListener("click", () => { $("kyushinPanel").hidden = true; });
  $("strip").addEventListener("click", stripSelection);
}

Office.onReady(async (info) => {
  state.inWord = info && info.host === Office.HostType.Word;
  try { $("mjOnly").checked = localStorage.getItem("ivs.mjOnly") !== "0"; } catch {}
  bind();
  await loadIndex();
  await loadKyushin();
  recompute();
  if (state.inWord) {
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, readSelection);
    await readSelection();
  } else {
    status("Word の中で開いてください(Word 外では動作しません)。");
  }
});
