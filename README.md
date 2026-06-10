# 宇宙偷偷話 LINE 宇宙塔羅網站 MVP

深藍紫色星空風格的 Next.js + Firebase MVP，包含 Landing Page、每日運勢、宇宙塔羅抽牌、LINE Bot Webhook API 與 Vercel deploy-ready 設定。

## 技術

- Next.js App Router
- TypeScript
- TailwindCSS
- Firebase Client SDK
- Firebase Admin SDK 預留
- Vercel deploy-ready

## 功能

- 首頁：星空 Hero、今日宇宙訊息、抽牌 CTA、LINE 加好友按鈕、漂浮星星動畫
- 每日運勢：愛情、工作、財運、心情假資料
- 塔羅抽牌頁：單張牌、三張牌、感情/工作/曖昧選項、洗牌動畫、翻牌動畫
- 付費詳細解讀預留：`/api/tarot-reading` 使用 OpenAI 官方 SDK 產生完整塔羅解讀
- LINE Webhook：`/api/line/webhook`
- Firebase 架構：`src/lib/firebase.ts` 預留 `users` 與 `tarot_logs` collection
- API：`/api/tarot/draw`、`/api/tarot-reading`、`/api/ai/reading`、`/api/user/profile`

## 安裝

```bash
npm install
npm run dev
```

本地開啟：

```text
http://localhost:3000
```

## Environment Variables

複製 `.env.example` 為 `.env.local`。

必要：

```bash
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
NEXT_PUBLIC_FIREBASE_API_KEY=
```

建議一起設定：

```bash
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_LINE_ADD_FRIEND_URL=https://line.me/R/ti/p/@453gfmok
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
```

`OPENAI_MODEL` 預設可用較低成本模型；若 OpenAI 後續提供你想使用的模型 ID，可在 Vercel 環境變數中直接覆蓋。

## Firebase Collections

### `users`

```ts
{
  uid: string;
  displayName?: string;
  lineUserId?: string;
  plan: "free" | "premium";
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}
```

### `tarot_logs`

```ts
{
  userId?: string;
  topic: "感情" | "工作" | "曖昧";
  mode: "single_tarot" | "three_card";
  cardIds: string[];
  question?: string;
  createdAt?: Timestamp;
}
```

## LINE Webhook

Webhook URL：

```text
https://你的網域.vercel.app/api/line/webhook
```

收到 LINE message event 時會回覆：

```text
宇宙正在傾聽你✨
```

此外，當使用者輸入「官網／網址／首頁／抽牌／連結／網站／link／website」其中之一，webhook 會直接回覆官網網址（讓電腦版 LINE 也能看到連結）。所有結果訊息（塔羅單張／三張、三重星座、序號查詢、補發）底部也會附上「🌙 官網入口」。

## LINE 圖文選單（Rich Menu）

手機版 LINE 會顯示圖文選單；電腦版不會（所以才用上面的關鍵字回覆＋訊息底部官網入口補足）。

設定圖文選單步驟：

1. **產生圖片**：用瀏覽器打開 `scripts/export-rich-menu-png.html`，按「下載 PNG」，把 `line-rich-menu-universe-whisper.png` 放到 `public/` 底下。
   - 設計來源為 `public/line-rich-menu-universe-whisper.svg`（深藍紫星空風，三區塊：🌙 回到官網／🔮 開始抽牌／✨ 查詢結果）。要改設計改這個 SVG（並同步 `export-rich-menu-png.html` 內的 SVG）。
   - 也可自行準備一張 **2500 × 843** 的 PNG，放到同一路徑。
2. **設定環境變數** `LINE_CHANNEL_ACCESS_TOKEN`（請勿寫進程式碼或 git）。
3. **執行 script**（Node 18+）：

   ```powershell
   # PowerShell
   $env:LINE_CHANNEL_ACCESS_TOKEN="你的token"; node scripts/setup-line-rich-menu.mjs
   ```

   ```bash
   # macOS / Linux
   LINE_CHANNEL_ACCESS_TOKEN="你的token" node scripts/setup-line-rich-menu.mjs
   ```

   成功後會 `console.log` 出 `richMenuId`，並把該選單設為 default。手機版 LINE 重新進入聊天室即可看到。

   三個區塊的 URI（依 `NEXT_PUBLIC_SITE_URL`，預設正式站）：

   - 🌙 回到官網 → `/`
   - 🔮 開始抽牌 → `/tarot`
   - ✨ 查詢結果 → `/tarot/lookup`

## Vercel Deploy

1. 將專案推到 GitHub。
2. 到 Vercel 建立 New Project。
3. Framework Preset 選 Next.js。
4. 在 Vercel Project Settings -> Environment Variables 新增 `.env.example` 內的變數。
5. Deploy。
6. 到 LINE Developers，把 Webhook URL 設成 `/api/line/webhook`。
7. 啟用 Webhook，視需求關閉 Auto-reply。

## 本地測試

```bash
npm run dev
```

測試頁面：

- 首頁：`http://localhost:3000`
- 每日運勢：`http://localhost:3000/daily`
- 塔羅抽牌：`http://localhost:3000/tarot`
- LINE Webhook health check：`http://localhost:3000/api/line/webhook`
- 塔羅解讀 API：`http://localhost:3000/api/tarot-reading`

測試 build：

```bash
npm run lint
npm run build
```
