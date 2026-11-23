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
  kdir: null, // "toOld" | "toNew"
  kchoices: {}, // 変換先が複数ある字の選択
};

// ---------- 表示ユーティリティ ----------
function status(msg, isErr = false) {
  const el = $("status");
  el.textContent = msg;
  el.className = "status" + (isErr ? " err" : "");
}

function previewMode() {
  return $("previewMode").value === "font" ? "font" : "image";
}

function currentFont() {
  return $("font").value.trim();
}

function applyPreviewFont() {
  const f = currentFont();
  document.documentElement.style.setProperty(
    "--glyph-font",
    f ? `"${f}", "Hiragino Mincho ProN", "Yu Mincho", serif` : `"Hiragino Mincho ProN", "Yu Mincho", "IPAmjMincho", "Noto Serif CJK JP", "Source Han Serif JP", serif`
  );
}

const visible = (s) => (s === "\r" || s === "\n" ? "↵" : s === "\t" ? "⇥" : s === " " ? "␣" : s);

// ---------- データ読み込み ----------
// 同梱の data/ivd.json(Unicode IVD + StandardizedVariants から生成)を起動時に読み込む。
async function loadIndex() {
  try {
    const res = await fetch("./data/ivd.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state.index = await res.json();
    $("dataInfo").textContent = `異体字データ: ${Object.keys(state.index).length.toLocaleString()} 字分を読み込み済み`;
  } catch (e) {
    state.index = null;
    $("dataInfo").textContent = "異体字データを読み込めませんでした。";
    status("異体字データ(data/ivd.json)を読み込めませんでした。ネット接続と、データファイルの公開状況を確認してください。", true);
  }
}

// ---------- 対象テキストの決定 ----------
function sourceText() {
  const typed = $("typed").value;
  return typed ? typed : state.selText;
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
  $("source").textContent = $("typed").value ? "入力欄" : "選択範囲";

  // 対象文字のチップ
  const chips = $("chips");
  chips.textContent = "";
  const cl = state.clusters;
  if (cl.length === 0) {
    const p = document.createElement("span");
    p.className = "muted";
    p.textContent = "(文字が選択されていません)";
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
  if (previewMode() === "image") {
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
async function readSelection() {
  if (!state.inWord) return;
  try {
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      sel.load("text");
      await ctx.sync();
      state.selText = sel.text || "";
    });
    if ($("typed").value) return; // 入力欄が優先
    recompute(true);
  } catch (e) {
    status("選択範囲を読み取れませんでした: " + e.message, true);
  }
}

async function insertIntoWord(newText) {
  const fontName = $("applyFont").checked ? currentFont() : "";
  await Word.run(async (ctx) => {
    const sel = ctx.document.getSelection();
    const r = sel.insertText(newText, "Replace");
    if (fontName) r.font.name = fontName;
    r.select();
    await ctx.sync();
  });
}

async function applyVariant(seq) {
  const cl = state.clusters;
  if (!cl[state.target]) return;
  const newText = replaceCluster(cl, state.target, seq);

  if (!state.inWord) {
    // ブラウザ単体で開いたときの動作確認用: 入力欄に反映
    $("typed").value = newText;
    recompute(true);
    status("(Word外) 入力欄に反映しました。");
    return;
  }
  try {
    await insertIntoWord(newText);
    if ($("typed").value) $("typed").value = newText;
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
  const stripped = stripVS(text);
  if (!state.inWord) {
    $("typed").value = stripped;
    recompute();
    return status(`(Word外) ${n} 個除去しました。`);
  }
  try {
    await insertIntoWord(stripped);
    if ($("typed").value) $("typed").value = stripped;
    state.selText = stripped;
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

function startKyushin(dir) {
  if (!state.kyushin) return;
  if (!sourceText()) return status("文字が選択されていません。", true);
  state.kdir = dir;
  state.kchoices = {};
  renderKyushin();
}

function renderKyushin() {
  const panel = $("kyushinPanel");
  const plan = planConversion(sourceText(), state.kdir, state.kyushin, state.kchoices);
  panel.hidden = false;

  const unresolved = plan.ambiguous.filter((a) => !state.kchoices[a.char]).length;
  $("kyushinSummary").textContent =
    `${plan.count} 文字を ${state.kdir === "toOld" ? "旧字体" : "新字体"} に変換します。` +
    (unresolved ? `(変換先を選ぶと、さらに変換できる字: ${unresolved} 種)` : "");

  // 変換先が複数ある字の選択欄
  const box = $("kyushinChoices");
  box.textContent = "";
  for (const a of plan.ambiguous) {
    const row = document.createElement("label");
    row.className = "choice";
    const from = document.createElement("span");
    from.className = "from";
    from.textContent = a.char;
    const sel = document.createElement("select");
    sel.append(new Option("(変換しない)", ""), ...a.options.map((o) => new Option(o, o)));
    sel.value = state.kchoices[a.char] || "";
    sel.addEventListener("change", () => {
      state.kchoices[a.char] = sel.value;
      renderKyushin();
    });
    row.append(from, document.createTextNode("→"), sel);
    box.appendChild(row);
  }

  // プレビュー(変換される字を強調)
  const pv = $("kyushinPreview");
  pv.textContent = "";
  const MAX_PARTS = 600;
  plan.parts.slice(0, MAX_PARTS).forEach((p) => {
    if (p.changed) {
      const m = document.createElement("mark");
      m.textContent = p.text;
      pv.appendChild(m);
    } else {
      pv.appendChild(document.createTextNode(p.text));
    }
  });
  if (plan.parts.length > MAX_PARTS) pv.appendChild(document.createTextNode("…(以降省略)"));

  $("kyushinApply").disabled = plan.count === 0;
}

function closeKyushin() {
  $("kyushinPanel").hidden = true;
  state.kdir = null;
}

// 選択範囲の中の文字を、検索・置換で差し替える(文字ごとの書式をなるべく保つ)。
// 異体字セレクタ付きの文字を先に処理し、そのあとに単独の文字を処理する。
async function replaceInSelection(changes) {
  const withVS = [...changes.keys()].filter((k) => Array.from(k).length > 1);
  const bare = [...changes.keys()].filter((k) => Array.from(k).length === 1);
  for (const keys of [withVS, bare]) {
    if (keys.length === 0) continue;
    await Word.run(async (ctx) => {
      const sel = ctx.document.getSelection();
      const found = keys.map((k) => {
        const r = sel.search(k, { matchCase: true });
        r.load("items");
        return [k, r];
      });
      await ctx.sync();
      for (const [k, r] of found) {
        for (const item of r.items) item.insertText(changes.get(k), "Replace");
      }
      await ctx.sync();
    });
  }
}

async function applyKyushin() {
  if (!state.kdir) return;
  const typed = $("typed").value;
  const plan = planConversion(sourceText(), state.kdir, state.kyushin, state.kchoices);
  if (plan.count === 0) return status("変換する字がありません。");

  if (!state.inWord) {
    // ブラウザ単体で開いたときの動作確認用
    $("typed").value = plan.text;
    closeKyushin();
    recompute();
    return status(`(Word外) ${plan.count} 文字を変換しました。`);
  }
  try {
    if (typed) {
      await insertIntoWord(plan.text); // 入力欄の文字を Word に挿入
      $("typed").value = plan.text;
    } else {
      await replaceInSelection(plan.changes);
    }
    status(`${plan.count} 文字を変換しました。`);
    closeKyushin();
    await readSelection();
    if (typed) recompute();
  } catch (e) {
    status("変換に失敗しました: " + e.message, true);
  }
}

// ---------- 起動 ----------
function bind() {
  $("typed").addEventListener("input", () => recompute());
  $("collection").addEventListener("change", (e) => {
    state.collection = e.target.value;
    render();
  });
  $("font").addEventListener("input", () => {
    applyPreviewFont();
    try { localStorage.setItem("ivs.font", $("font").value); } catch {}
  });
  $("mjOnly").addEventListener("change", () => {
    try { localStorage.setItem("ivs.mjOnly", $("mjOnly").checked ? "1" : "0"); } catch {}
    state.collection = "";
    recompute(true);
  });
  $("previewMode").addEventListener("change", () => {
    try { localStorage.setItem("ivs.previewMode", $("previewMode").value); } catch {}
    render();
  });
  $("toOld").addEventListener("click", () => startKyushin("toOld"));
  $("toNew").addEventListener("click", () => startKyushin("toNew"));
  $("kyushinApply").addEventListener("click", applyKyushin);
  $("kyushinCancel").addEventListener("click", closeKyushin);
  $("strip").addEventListener("click", stripSelection);
}

Office.onReady(async (info) => {
  state.inWord = info && info.host === Office.HostType.Word;
  try { $("font").value = localStorage.getItem("ivs.font") || ""; } catch {}
  try { $("previewMode").value = localStorage.getItem("ivs.previewMode") || "image"; } catch {}
  try { $("mjOnly").checked = localStorage.getItem("ivs.mjOnly") !== "0"; } catch {}
  applyPreviewFont();
  bind();
  await loadIndex();
  await loadKyushin();
  recompute();
  if (state.inWord) {
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, readSelection);
    await readSelection();
  } else {
    status("Word 外で開いています(動作確認モード)。文字を入力欄に入れて試せます。");
  }
});
