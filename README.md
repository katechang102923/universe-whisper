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
- LINE Webhook：`/api/line/webhook`
- Firebase 架構：`src/lib/firebase.ts` 預留 `users` 與 `tarot_logs` collection
- API：`/api/tarot/draw`、`/api/ai/reading`、`/api/user/profile`

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
```

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

測試 build：

```bash
npm run lint
npm run build
```
