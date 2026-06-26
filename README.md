# mahjong-calculation

半荘終わった後の最終持ち点を入力し、Mリーグ式の順位点とオカを反映した全員分のスコアを記録・管理するNext.jsアプリです。

## 主な機能

- 自分を下、下家を右、対面を上、上家を左に配置した一般的な卓レイアウトで入力
- 各席の入力項目は「名前」「点数」「起家かどうか」の3つ
- 25,000点持ち / 30,000点返し / 順位点 +50 / +10 / ▲10 / ▲30 / トップへのオカ +20 でスコアを自動計算
- 日付と「何試合目」つきで半荘結果を保存
- 保存したスコア履歴を画面上で確認
- Supabaseの環境変数がある場合は `games` / `game_results` テーブルへ保存

## セットアップ

```bash
npm install
npm run dev
```

`.env.local` に以下を設定するとSupabaseへ保存できます。Supabaseの新しいAPI Keys画面では publishable key を使います。

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Supabase SQL Editorで `supabase/schema.sql` を実行してテーブルを作成してください。

## デプロイ

Vercelにリポジトリを接続し、上記の環境変数をProject Settingsに登録してデプロイします。
