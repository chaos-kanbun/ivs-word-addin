import {
  splitClusters,
  candidatesFor,
  toSequence,
  stripVS,
  countVS,
  replaceCluster,
  cpHex,
  parseIvdSequences,
  parseStandardizedVariants,
  buildIndex,
  glyphWikiName,
  glyphWikiUrl,
} from "./ivs.js";

const $ = (id) => document.getElementById(id);
const MAX_CHIPS = 300;

const state = {
  index: null, // ivd.json の中身
  selText: "", // Word 上の選択範囲のテキスト
  clusters: [], // 現在の対象テキストのクラスタ
  target: 0, // 対象クラスタの位置
  collection: "", // 絞り込み
  inWord: false,
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

// ---------- データの保存(IndexedDB) ----------
const DB_NAME = "ivs-addin";
const STORE = "kv";

function openDb() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const q = db.transaction(STORE).objectStore(STORE).get(key);
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function setDataInfo(meta) {
  $("dataInfo").textContent = meta
    ? `(読み込み済み: ${meta.chars} 字 / ${meta.rows} 件)`
    : "(未読み込み)";
  if (!meta) $("dataBox").open = true;
}

// ---------- データ読み込み ----------
// 優先順: ① この端末に保存済みのデータ → ② サイトに置かれた data/ivd.json(任意)
async function loadIndex() {
  try {
    const saved = await idbGet("data");
    if (saved && saved.index) {
      state.index = saved.index;
      setDataInfo(saved.meta);
      return;
    }
  } catch (e) {
    console.warn("IndexedDB を読めませんでした", e);
  }
  try {
    const res = await fetch("./data/ivd.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    state.index = await res.json();
    setDataInfo({ chars: Object.keys(state.index).length, rows: "-" });
  } catch (e) {
    state.index = null;
    setDataInfo(null);
    status("異体字データが未読み込みです。下の「異体字データ」から txt ファイルを読み込んでください。", true);
  }
}

async function importData() {
  const ivdFile = $("ivdFile").files[0];
  const svFile = $("svFile").files[0];
  if (!ivdFile) return status("IVD_Sequences.txt を選んでください。", true);
  try {
    status("読み込み中…");
    const ivdRows = parseIvdSequences(await ivdFile.text());
    if (ivdRows.length === 0) {
      return status("IVD_Sequences.txt から行を読み取れませんでした。ファイルを確認してください。", true);
    }
    const svRows = svFile ? parseStandardizedVariants(await svFile.text()) : [];
    const index = buildIndex([...ivdRows, ...svRows]);
    const meta = {
      chars: Object.keys(index).length,
      rows: ivdRows.length + svRows.length,
      savedAt: new Date().toISOString(),
    };
    await idbSet("data", { index, meta });
    state.index = index;
    setDataInfo(meta);
    $("dataBox").open = false;
    recompute(true);
    status(`読み込みました(${meta.chars} 字 / ${meta.rows} 件)。`);
  } catch (e) {
    status("読み込みに失敗しました: " + e.message, true);
  }
}

// ---------- 対象テキストの決定 ----------
function sourceText() {
  const typed = $("typed").value;
  return typed ? typed : state.selText;
}

function hasCandidates(c) {
  return candidatesFor(state.index, c.base).length > 0;
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
  const all = candidatesFor(state.index, cur.base);

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
    p.textContent = state.index
      ? "この文字には登録済みの異体字がありません。"
      : "データが読み込まれていません。";
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
  $("previewMode").addEventListener("change", () => {
    try { localStorage.setItem("ivs.previewMode", $("previewMode").value); } catch {}
    render();
  });
  $("strip").addEventListener("click", stripSelection);
  $("importBtn").addEventListener("click", importData);
}

Office.onReady(async (info) => {
  state.inWord = info && info.host === Office.HostType.Word;
  try { $("font").value = localStorage.getItem("ivs.font") || ""; } catch {}
  try { $("previewMode").value = localStorage.getItem("ivs.previewMode") || "image"; } catch {}
  applyPreviewFont();
  bind();
  await loadIndex();
  recompute();
  if (state.inWord) {
    Office.context.document.addHandlerAsync(Office.EventType.DocumentSelectionChanged, readSelection);
    await readSelection();
  } else {
    status("Word 外で開いています(動作確認モード)。文字を入力欄に入れて試せます。");
  }
});
