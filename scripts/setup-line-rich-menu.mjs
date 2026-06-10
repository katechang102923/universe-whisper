/**
 * 建立並啟用 LINE 圖文選單（Rich Menu）。
 *
 * 這支 script 會：
 *   1. 用 LINE Messaging API 建立 rich menu（3 區塊，URI action 連到官網/抽牌/查詢）
 *   2. 上傳圖文選單圖片 public/line-rich-menu-universe-whisper.png
 *   3. 設為 default rich menu（所有加入好友的人都會看到）
 *   4. console.log 出 richMenuId
 *
 * 安全性：
 *   - Channel Access Token 只從環境變數讀取，絕不寫死在程式碼裡，也不會被印出。
 *   - 官網網址從 NEXT_PUBLIC_SITE_URL 讀取，沒有就用正式站網址。
 *
 * 執行前準備：
 *   1. 先產生圖片：用瀏覽器打開 scripts/export-rich-menu-png.html，按「下載 PNG」，
 *      把 line-rich-menu-universe-whisper.png 放到 public/ 底下。
 *      （或自行準備一張 2500×843 的 PNG，放到同一個路徑。）
 *   2. 設定環境變數 LINE_CHANNEL_ACCESS_TOKEN。
 *
 * 執行方式（Node 18+）：
 *   # PowerShell
 *   $env:LINE_CHANNEL_ACCESS_TOKEN="你的token"; node scripts/setup-line-rich-menu.mjs
 *
 *   # macOS / Linux
 *   LINE_CHANNEL_ACCESS_TOKEN="你的token" node scripts/setup-line-rich-menu.mjs
 *
 * 可選環境變數：
 *   NEXT_PUBLIC_SITE_URL  官網網址（預設 https://universe-whisper.vercel.app）
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) {
  console.error("❌ 缺少環境變數 LINE_CHANNEL_ACCESS_TOKEN，請先設定後再執行（不要把 token 寫進程式碼或 git）。");
  process.exit(1);
}

const SITE = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://universe-whisper.vercel.app"
).replace(/\/+$/, "");

const IMAGE_PATH = fileURLToPath(new URL("../public/line-rich-menu-universe-whisper.png", import.meta.url));

const richMenu = {
  size: { width: 2500, height: 843 },
  selected: true,
  name: "宇宙偷偷話主選單",
  chatBarText: "開啟選單",
  areas: [
    { bounds: { x: 0, y: 0, width: 833, height: 843 }, action: { type: "uri", label: "回到官網", uri: `${SITE}/` } },
    { bounds: { x: 833, y: 0, width: 834, height: 843 }, action: { type: "uri", label: "開始抽牌", uri: `${SITE}/tarot` } },
    { bounds: { x: 1667, y: 0, width: 833, height: 843 }, action: { type: "uri", label: "查詢結果", uri: `${SITE}/tarot/lookup` } },
  ],
};

async function main() {
  // 1. 讀取圖片
  let imageBuffer;
  try {
    imageBuffer = await readFile(IMAGE_PATH);
  } catch {
    console.error(`❌ 找不到圖片：${IMAGE_PATH}`);
    console.error("   請先用瀏覽器打開 scripts/export-rich-menu-png.html 下載 PNG，並放到 public/ 底下。");
    process.exit(1);
  }

  // 2. 建立 rich menu
  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(richMenu),
  });
  if (!createRes.ok) {
    console.error("❌ 建立 rich menu 失敗：", createRes.status, await createRes.text().catch(() => ""));
    process.exit(1);
  }
  const { richMenuId } = await createRes.json();
  console.log("✅ 已建立 rich menu：", richMenuId);

  // 3. 上傳圖片（注意：圖片上傳用的是 api-data.line.me）
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "image/png" },
    body: imageBuffer,
  });
  if (!uploadRes.ok) {
    console.error("❌ 上傳圖片失敗：", uploadRes.status, await uploadRes.text().catch(() => ""));
    console.error("   （rich menu 已建立但沒有圖片，可到 LINE Official Account Manager 刪除，或修正圖片後重跑。）");
    process.exit(1);
  }
  console.log("✅ 已上傳圖文選單圖片");

  // 4. 設為 default rich menu
  const defaultRes = await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!defaultRes.ok) {
    console.error("❌ 設為預設選單失敗：", defaultRes.status, await defaultRes.text().catch(() => ""));
    process.exit(1);
  }

  console.log("✅ 已設為 default rich menu");
  console.log("");
  console.log("🎉 完成！richMenuId =", richMenuId);
  console.log("   官網連結：", `${SITE}/`);
  console.log("   開始抽牌：", `${SITE}/tarot`);
  console.log("   查詢結果：", `${SITE}/tarot/lookup`);
  console.log("   手機版 LINE 重新進入聊天室即可看到圖文選單。");
}

main().catch((err) => {
  console.error("❌ 執行失敗：", err?.message || err);
  process.exit(1);
});
