# mahjong-calculation

半荘終わった後の最終持ち点を入力し、Mリーグ式の順位点とオカを反映した全員分のスコアを記録・管理するNext.jsアプリです。

## 主な機能

- 自分を下、下家を右、対面を上、上家を左に配置した一般的な卓レイアウトで入力
- 各席の入力項目は「ユーザー」「点数」「起家かどうか」の3つ
- 25,000点持ち / 30,000点返し / 順位点 +50 / +10 / ▲10 / ▲30 / トップへのオカ +20 でスコアを自動計算
- ログインしたユーザーだけが利用可能
- 試合を記録する前に、保存先グループを選択
- グループ内ユーザーをメールアドレスで招待・管理
- グループ内ユーザーを選択して半荘結果を保存し、未登録名はゲストユーザーとして保存
- ゲストユーザーはグループごとに最大10人まで保持
- ゲストユーザーとして保存した記録を、後から参加したユーザーへ移行
- 日付と「何試合目」つきで半荘結果を保存
- 保存したスコア履歴をグループ単位・個人単位で確認
- グループ内ランキングを合計スコア・平均スコア・平均順位で確認
- Supabaseの環境変数がある場合は `profiles` / `groups` / `group_memberships` / `group_invitations` / `group_players` / `games` / `game_results` テーブルへ保存

## セットアップ

```bash
npm install
npm run dev
```

`.env.local` に以下を設定すると、Supabase Authでログインし、グループとスコアをSupabaseへ保存できます。Supabaseの新しいAPI Keys画面では publishable key を使います。

```bash
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Supabase SQL Editorで `supabase/schema.sql` を実行してテーブルとRLSポリシーを作成してください。Supabase AuthのEmail/Passwordログインを有効にして利用します。

## デプロイ

Vercelにリポジトリを接続し、上記の環境変数をProject Settingsに登録してデプロイします。
