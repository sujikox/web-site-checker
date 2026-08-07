# Webサイトチェッカー

URLを入力すると、対象ページの `title` タグと `meta description` の設定状況(有無・文字数)をチェックするツールです。

## 機能

- title タグの有無・文字数チェック(目安: 30〜60文字)
- meta description の有無・文字数チェック(目安: 70〜160文字)

## セットアップ

```bash
npm install
```

## 起動

```bash
npm start
```

`http://localhost:3000` にアクセスしてください。

## 技術構成

- サーバー: Node.js + Express
- HTML解析: cheerio
- フロントエンド: HTML / CSS / Vanilla JS
