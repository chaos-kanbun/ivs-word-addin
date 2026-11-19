# 異体字セレクタ Word アドイン(ターミナル不要版)

Word で選択した漢字の異体字(IVS)を一覧表示し、クリックで置換するアドインです。
Office.js 製なので、Mac / Windows / ブラウザ版 Word で同じファイルが動きます。

## 全体の方針

1. アドイン本体(`docs/`)は静的ファイルだけ。GitHub Pages で公開します(HTTPS が必須のため)。
2. Word には、公開 URL を書いた `manifest.xml` を登録します。
3. 異体字データは Unicode 公式の txt を、アドインの画面から読み込みます(初回のみ。端末内に保存)。

コマンド操作は一切不要です。

## 中身

```
manifest.xml        Word に登録する設定ファイル(URL の書き換えが必要)
docs/               公開するファイル一式(taskpane.html / .js / .css, ivs.js, assets/)
test/ivs.test.mjs   開発者向けのテスト(使うだけなら不要)
```

## 手順

### A. 公開する(GitHub Pages)

1. GitHub で新しいリポジトリを作ります。名前は `ivs-word-addin` を推奨、**Public** にします。
2. リポジトリの [Add file] → [Upload files] で、この zip を解凍した中身(`docs` フォルダ、`manifest.xml`、`README.md`)をドラッグして [Commit changes]。
3. [Settings] → [Pages] で、Source を「Deploy from a branch」、Branch を `main` / フォルダを `/docs` にして Save。
4. 数分後、`https://あなたのユーザー名.github.io/ivs-word-addin/taskpane.html` をブラウザで開いて、画面が表示されれば公開完了です。

### B. manifest.xml の URL を書き換える

テキストエディタ(メモ帳、テキストエディット等)で `manifest.xml` を開き、
`YOUR-USER` をすべて自分の GitHub ユーザー名に置換して保存します。
リポジトリ名を変えた場合は `ivs-word-addin` の部分も置換してください。

### C. Word に登録する

**Mac**
1. Finder のメニュー [移動] → [フォルダへ移動…] で、次を貼り付けて開きます。
   `~/Library/Containers/com.microsoft.Word/Data/Documents/wef`
   (開けなければ、`Documents` フォルダの中に `wef` フォルダを作ります)
2. `manifest.xml` をそのフォルダにコピーします。
3. Word を再起動 → [挿入] → [アドイン] → [個人用アドイン] の右の ▼ →「異体字セレクタ」。

**Windows**
1. 任意の場所に共有フォルダを作り(例 `C:\WordAddins`)、`manifest.xml` を入れます。フォルダを右クリック →「プロパティ」→「共有」で、自分のPCで共有を有効にします(ネットワークパス `\\PC名\WordAddins` を控えます)。
2. Word の [ファイル] → [オプション] → [セキュリティ センター] → [セキュリティ センターの設定] → [信頼されたアドイン カタログ] に、そのネットワークパスを追加し「メニューに表示する」にチェック。
3. Word を再起動 → [挿入] → [アドイン] → [個人用アドイン] → [共有フォルダー] →「異体字セレクタ」を追加。

**Word on the web(補助)**
[挿入] → [アドイン] → [個人用アドイン] → [マイ アドインのアップロード] で `manifest.xml` を指定。

### D. 異体字データを読み込む(初回のみ)

次の2つをブラウザで開き、txt を保存します。

- IVD_Sequences.txt(必須): https://www.unicode.org/ivd/ のデータ一覧から最新版の `IVD_Sequences.txt`
- StandardizedVariants.txt(任意): https://www.unicode.org/Public/UCD/latest/ucd/StandardizedVariants.txt

アドインの画面下部「異体字データ」を開き、ファイルを選んで [読み込む]。
読み込んだデータは各端末(Mac と Windows それぞれ)に保存されます。端末ごとに1回ずつ必要です。

## 使い方

- Word で漢字を選択 → 候補が並ぶ → クリックでその文字だけ置換。
- 「基本字形」を選ぶと、異体字セレクタなしに戻せます。
- 入力欄に文字を入れて試すこともできます。
- 「選択範囲の異体字セレクタをすべて除去」で一括除去。

## 注意点

- 字形はフォント次第です。IVS 対応フォント(ヒラギノ、游明朝、IPAmj明朝、源ノ明朝など)を Word で指定してください。
- 複数文字を選んで置換すると、文字ごとの書式が失われることがあります。1文字ずつ選ぶのが確実です。
- 「置換した文字にフォントを適用」は、環境によって日本語フォントに効かないことがあります。
- 異体字データは Unicode の IVD / StandardizedVariants のみです。
- 公開した URL は誰でも開けますが、含まれるのはアドインのプログラムだけです(あなたの文書やデータは送信されません)。
- ブラウザ版のデータ保存が消えた場合は、データを読み込み直してください。
- 古い Word(Edge WebView2 でない Windows 版)では動かない可能性があります。

## 開発者向け

`node --test` でロジックのテストが走ります(サンプルは合成データ)。
