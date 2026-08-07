# Webサイトチェッカー

URLを入力すると、対象ページの `title` タグと `meta description` の設定状況(有無・文字数)をチェックするツールです。
Cloudflare Pages(静的ホスティング + Pages Functions)上で動作します。

## 機能

- title タグの有無・文字数チェック(目安: 30〜60文字)
- meta description の有無・文字数チェック(目安: 70〜160文字)

## 構成

- `public/` … フロントエンド(HTML / CSS / Vanilla JS)。Cloudflare Pagesが静的配信する
- `functions/api/check.js` … `/api/check` のAPI(Cloudflare Pages Functions)

## セットアップ

```bash
npm install
```

## ローカル開発

```bash
npm run dev
```

`http://localhost:8788` にアクセスしてください(Wranglerによるローカルエミュレーション)。

## デプロイ

```bash
npx wrangler login   # 初回のみ
npm run deploy
```

Cloudflare Pagesダッシュボードでカスタムドメイン(`wsc.o-saka.jp`)を設定してください。

## 技術構成

- ホスティング: Cloudflare Pages
- API: Cloudflare Pages Functions
- HTML解析: cheerio
- フロントエンド: HTML / CSS / Vanilla JS
