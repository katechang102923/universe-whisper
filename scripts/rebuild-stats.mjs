#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// 安全的每日統計手動重建工具
//
//   npm run admin:rebuild-stats -- --start=2026-06-09 --end=2026-06-12
//
// 規則（與後台規格一致）：
//   1. 只「重新產生」daily_admin_stats（呼叫既有 generate API，period=full）。
//   2. 不刪除 raw events、不刪除 orders、不刪除任何資料。
//   3. 不假造數字——所有數值由 generate API 從現有資料源即時彙總。
//   4. 區間最多 90 天。
//   5. 若該日期沒有原始事件來源（例如以前沒有記錄免費使用），仍會誠實產生
//      「以現有資料能算到的數字」，無法回補的部分會是 0，不會被捏造。
//
// 需要環境變數：
//   STATS_BASE_URL  目標站台（預設 http://localhost:3000；正式機請設線上網址）
//   CRON_SECRET     與伺服器相同的 generate 授權密鑰
// ─────────────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 90;

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

// 以 Asia/Taipei 計算日期位移（中午對齊，避免 UTC 切日錯位）
function addDays(dateKey, days) {
  const [y, mo, d] = dateKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days, 4));
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dt);
}

function listDates(start, end) {
  if (start > end) return null;
  const out = [];
  let cur = start;
  for (let i = 0; i < MAX_RANGE_DAYS; i++) {
    out.push(cur);
    if (cur === end) return out;
    cur = addDays(cur, 1);
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const start = args.start;
  const end = args.end ?? args.start;

  if (!start || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    console.error("用法：npm run admin:rebuild-stats -- --start=YYYY-MM-DD [--end=YYYY-MM-DD]");
    process.exit(1);
  }

  const baseUrl = (process.env.STATS_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) {
    console.error("缺少環境變數 CRON_SECRET（generate API 授權密鑰）。");
    process.exit(1);
  }

  const lo = start <= end ? start : end;
  const hi = start <= end ? end : start;
  const dates = listDates(lo, hi);
  if (!dates) {
    console.error(`區間最多 ${MAX_RANGE_DAYS} 天。`);
    process.exit(1);
  }

  console.log(`重建 daily_admin_stats：${lo} ～ ${hi}（共 ${dates.length} 天） @ ${baseUrl}`);
  console.log("注意：只重新產生快照，不會刪除或竄改任何原始資料。\n");

  let okCount = 0;
  for (const date of dates) {
    const url = `${baseUrl}/api/admin/daily-stats/generate?period=full&date=${date}`;
    try {
      const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` } });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.ok) {
        okCount++;
        console.log(
          `✓ ${date}  訪客=${json.visitors ?? 0} 免費=${json.freeDraws ?? 0} 付費=${json.paidUnlocks ?? 0} 收入=${json.revenue ?? 0} 三重星座=${json.astroProfileCount ?? 0}`,
        );
      } else {
        console.warn(`✗ ${date}  失敗：${json.error ?? res.status}`);
      }
    } catch (err) {
      console.warn(`✗ ${date}  例外：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n完成：${okCount}/${dates.length} 天已重建。`);
  console.log("提醒：若某日早期未記錄免費使用／三重星座事件，該日對應數字無法回補（顯示為 0），未捏造。");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
