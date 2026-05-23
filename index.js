const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

/**
 * 快取：避免每次 LINE 傳訊息都重新抓 TWSE
 */
let twseCache = {
  sectorReport: null,
  updatedAt: 0
};

const CACHE_TIME_MS = 10 * 60 * 1000;

/**
 * 備援產業分類表
 * TWSE 公司基本資料如果被擋，至少常見股票還能分類。
 */
const FALLBACK_SECTOR_MAP = {
  "2330": "半導體業",
  "2454": "半導體業",
  "2303": "半導體業",
  "3034": "半導體業",
  "3443": "半導體業",
  "3661": "半導體業",
  "2344": "半導體業",
  "2408": "半導體業",
  "2379": "半導體業",
  "3711": "半導體業",
  "6770": "半導體業",

  "2317": "其他電子業",
  "2382": "電腦及週邊設備業",
  "3231": "電腦及週邊設備業",
  "2356": "電腦及週邊設備業",
  "6669": "電腦及週邊設備業",
  "2376": "電腦及週邊設備業",
  "2301": "電腦及週邊設備業",
  "2357": "電腦及週邊設備業",
  "3324": "電腦及週邊設備業",

  "2383": "電子零組件業",
  "2368": "電子零組件業",
  "3037": "電子零組件業",
  "2367": "電子零組件業",
  "8046": "電子零組件業",
  "4958": "電子零組件業",
  "6274": "電子零組件業",
  "3013": "電子零組件業",
  "5434": "電子零組件業",
  "2308": "電子零組件業",

  "3653": "其他電子業",
  "6239": "其他電子業",
  "6415": "其他電子業",
  "6805": "其他電子業",

  "1504": "電機機械",
  "1513": "電機機械",
  "1519": "電機機械",
  "1605": "電器電纜",
  "1609": "電器電纜",

  "2881": "金融保險",
  "2882": "金融保險",
  "2883": "金融保險",
  "2884": "金融保險",
  "2885": "金融保險",
  "2886": "金融保險",
  "2887": "金融保險",
  "2890": "金融保險",
  "2891": "金融保險",
  "2892": "金融保險",
  "5880": "金融保險",
  "5876": "金融保險",

  "2603": "航運業",
  "2609": "航運業",
  "2615": "航運業",
  "2618": "航運業",
  "2637": "航運業",

  "1101": "水泥工業",
  "1102": "水泥工業",
  "1216": "食品工業",
  "1301": "塑膠工業",
  "1303": "塑膠工業",
  "2002": "鋼鐵工業",
  "2207": "汽車工業",
  "2912": "貿易百貨",
  "6505": "油電燃氣業"
};

app.get("/", (req, res) => {
  res.send("YORU LAB LINE Bot is running.");
});

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userText = event.message.text.trim();

        let replyText = "";

        if (userText === "台股") {
          replyText = await createTaiwanStockAnalysis();
        } else if (
          userText === "資金" ||
          userText === "資金排行" ||
          userText === "上市資金"
        ) {
          replyText = await createTWSESectorRankingReport();
        } else if (userText === "20MA" || userText === "均線") {
          replyText = await createMA20StrategyNote();
        } else if (userText === "美股") {
          replyText = await createUSStockAnalysis();
        } else if (userText === "BTC") {
          replyText = await createBTCAnalysis();
        } else {
          replyText = createHelpMessage();
        }

        await replyMessage(event.replyToken, replyText);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

function createHelpMessage() {
  return (
    "【YORU LAB 投資機器人】\n\n" +
    "你可以輸入：\n\n" +
    "台股｜AI 台股盤勢觀察\n" +
    "資金｜TWSE 上市資金排行＋20MA＋法人買超\n" +
    "資金排行｜同上\n" +
    "上市資金｜同上\n" +
    "20MA｜20 日均線觀察邏輯\n" +
    "美股｜AI 美股觀察\n" +
    "BTC｜AI 加密貨幣觀察\n\n" +
    "提醒：目前「資金」功能先以 TWSE 上市股票為主，尚未包含上櫃股票。內容僅供研究紀錄與市場觀察，不構成投資建議。"
  );
}

/**
 * TWSE 官方資料版：上市資金排行
 */
async function createTWSESectorRankingReport() {
  try {
    const now = Date.now();

    if (twseCache.sectorReport && now - twseCache.updatedAt < CACHE_TIME_MS) {
      return twseCache.sectorReport;
    }

    const dailyRows = await fetchTWSEDailyAll();

    if (!dailyRows || dailyRows.length === 0) {
      return (
        "【YORU LAB 上市資金排行】\n\n" +
        "目前沒有抓到 TWSE 上市每日成交資料。\n\n" +
        "可能原因：\n" +
        "1. TWSE API 暫時無回應\n" +
        "2. Render 被 TWSE 安全性機制阻擋\n" +
        "3. 官方資料尚未更新\n\n" +
        "請稍後再試，或到 Render Logs 查看錯誤。"
      );
    }

    const sectorMap = await fetchTWSECompanySectorMap();

    const normalized = dailyRows
      .map((row) => normalizeTWSEDailyRow(row, sectorMap))
      .filter((item) => {
        return (
          item &&
          /^\d{4}$/.test(item.stockId) &&
          item.close > 0 &&
          item.tradingValue > 0 &&
          item.sector
        );
      });

    if (normalized.length === 0) {
      return (
        "【YORU LAB 上市資金排行】\n\n" +
        "有抓到 TWSE 資料，但整理後沒有可用股票資料。\n\n" +
        "可能是 TWSE 欄位名稱更新，請到 Render Logs 查看原始資料。"
      );
    }

    const latestDateText = getTWSELatestDateText(dailyRows);
    const sectorRanking = buildSectorRanking(normalized).slice(0, 6);

    const candidates = pickMA20Candidates(normalized, sectorRanking, 5);
    const belowMA20List = await buildBelowMA20List(candidates);

    const institutionalList = await fetchTWSEInstitutionalTopBuys();

    let reply = "";
    reply += "【YORU LAB 上市資金排行｜TWSE 官方資料版】\n";
    reply += `資料日期：${latestDateText || "以 TWSE 最新資料為準"}\n\n`;

    reply += "一、成交金額集中族群排行\n";
    sectorRanking.forEach((sector, index) => {
      reply +=
        `${index + 1}. ${sector.sector}｜約 ${formatTWMoney(
          sector.totalTradingValue
        )}｜檔數 ${sector.count}\n`;
    });

    reply += "\n二、熱門族群中低於 20MA 的股票\n";
    if (belowMA20List.length === 0) {
      reply +=
        "目前在本次篩選範圍內，沒有明顯低於 20MA 的股票，或歷史資料不足。\n";
    } else {
      belowMA20List.slice(0, 18).forEach((stock) => {
        reply +=
          `${stock.stockId} ${stock.name}｜${stock.sector}｜收 ${stock.close}｜20MA ${stock.ma20}｜差距 ${stock.diffPct}%\n`;
      });
    }

    reply += "\n三、三大法人買超排行\n";
    if (institutionalList.length === 0) {
      reply +=
        "目前沒有抓到三大法人買超資料，可能是 TWSE 安全性阻擋 Render 存取、今日資料尚未更新，或官方資料暫時無回應。\n";
    } else {
      institutionalList.slice(0, 10).forEach((item, index) => {
        reply +=
          `${index + 1}. ${item.stockId} ${item.name}｜買超 ${formatShares(
            item.netBuy
          )}\n`;
      });
    }

    reply +=
      "\nYORU LAB 筆記：\n" +
      "成交金額集中代表市場注意力，不等於一定會上漲。\n" +
      "低於 20MA 不是便宜保證，仍要看族群強弱、量價與結構。\n" +
      "法人買超只能作為輔助觀察，不能直接當成買進理由。\n\n" +
      "內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。";

    reply = reply.slice(0, 4900);

    twseCache.sectorReport = reply;
    twseCache.updatedAt = now;

    return reply;
  } catch (error) {
    console.error("createTWSESectorRankingReport error:", error);

    return (
      "【YORU LAB 上市資金排行】\n\n" +
      "TWSE 官方資料抓取或計算時發生錯誤。\n\n" +
      "可能原因：\n" +
      "1. TWSE 回傳安全性阻擋頁\n" +
      "2. TWSE API 欄位或路徑調整\n" +
      "3. Render 免費主機連線不穩\n\n" +
      "請到 Render Logs 查看錯誤。"
    );
  }
}

/**
 * TWSE OpenAPI：上市個股每日成交資訊
 */
async function fetchTWSEDailyAll() {
  const url = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
  const json = await fetchJSON(url);

  if (!Array.isArray(json)) {
    console.error("STOCK_DAY_ALL returned no usable JSON.");
    return [];
  }

  return json;
}

/**
 * TWSE 上市公司基本資料：用來取得產業別
 * 若失敗，會使用 FALLBACK_SECTOR_MAP。
 */
async function fetchTWSECompanySectorMap() {
  const map = {};

  try {
    const url = "https://openapi.twse.com.tw/v1/opendata/t187ap03_L";
    const json = await fetchJSON(url);

    if (Array.isArray(json)) {
      for (const row of json) {
        const stockId =
          row["公司代號"] ||
          row["出表日期公司代號"] ||
          row["代號"] ||
          row["股票代號"] ||
          "";

        const sector =
          row["產業別"] ||
          row["產業類別"] ||
          row["公司產業別"] ||
          "";

        const id = String(stockId).trim();

        if (/^\d{4}$/.test(id) && sector) {
          map[id] = String(sector).trim();
        }
      }
    } else {
      console.error("Company sector API returned no usable JSON.");
    }
  } catch (error) {
    console.error("fetchTWSECompanySectorMap error:", error);
  }

  for (const [stockId, sector] of Object.entries(FALLBACK_SECTOR_MAP)) {
    if (!map[stockId]) {
      map[stockId] = sector;
    }
  }

  return map;
}

function normalizeTWSEDailyRow(row, sectorMap) {
  const stockId = cleanText(row["證券代號"] || row["Code"] || row["股票代號"]);
  const name = cleanText(row["證券名稱"] || row["Name"] || row["股票名稱"]);

  const close = toNumber(
    row["收盤價"] ||
      row["ClosingPrice"] ||
      row["Close"] ||
      row["收盤"]
  );

  const tradingValue = toNumber(
    row["成交金額"] ||
      row["TradeValue"] ||
      row["TradingValue"] ||
      row["成交值"]
  );

  const sector = sectorMap[stockId] || FALLBACK_SECTOR_MAP[stockId] || "";

  if (!stockId || !name) return null;

  return {
    stockId,
    name,
    close,
    tradingValue,
    sector
  };
}

function getTWSELatestDateText(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";

  const row = rows[0] || {};
  return (
    row["日期"] ||
    row["Date"] ||
    row["資料日期"] ||
    row["交易日期"] ||
    ""
  );
}

function buildSectorRanking(stocks) {
  const grouped = {};

  for (const stock of stocks) {
    if (!grouped[stock.sector]) {
      grouped[stock.sector] = {
        sector: stock.sector,
        totalTradingValue: 0,
        count: 0
      };
    }

    grouped[stock.sector].totalTradingValue += stock.tradingValue;
    grouped[stock.sector].count += 1;
  }

  return Object.values(grouped)
    .filter((item) => item.totalTradingValue > 0)
    .sort((a, b) => b.totalTradingValue - a.totalTradingValue);
}

function pickMA20Candidates(stocks, sectorRanking, perSectorLimit) {
  const targetSectors = sectorRanking.map((item) => item.sector);
  const result = [];

  for (const sector of targetSectors) {
    const sectorStocks = stocks
      .filter((stock) => stock.sector === sector)
      .sort((a, b) => b.tradingValue - a.tradingValue)
      .slice(0, perSectorLimit);

    result.push(...sectorStocks);
  }

  return result;
}

async function buildBelowMA20List(candidates) {
  const result = [];

  for (const stock of candidates) {
    try {
      const history = await fetchTWSEStockHistory(stock.stockId);
      const ma = calculateMA20(history);

      if (!ma) continue;

      if (ma.close < ma.ma20) {
        result.push({
          stockId: stock.stockId,
          name: stock.name,
          sector: stock.sector,
          close: ma.close,
          ma20: ma.ma20,
          diffPct: ma.diffPct
        });
      }
    } catch (error) {
      console.error(`MA20 error ${stock.stockId}:`, error.message);
    }
  }

  result.sort((a, b) => a.diffPct - b.diffPct);
  return result;
}

/**
 * 個股歷史日 K：抓近三個月，計算 20MA
 */
async function fetchTWSEStockHistory(stockId) {
  const months = getRecentMonthStartDates(3);
  const allRows = [];

  for (const monthDate of months) {
    const url =
      "https://www.twse.com.tw/exchangeReport/STOCK_DAY" +
      `?response=json&date=${monthDate}&stockNo=${stockId}`;

    try {
      const json = await fetchJSON(url);

      if (json && Array.isArray(json.data)) {
        for (const item of json.data) {
          allRows.push({
            date: item[0],
            close: toNumber(item[6])
          });
        }
      }
    } catch (error) {
      console.error(`fetchTWSEStockHistory ${stockId} ${monthDate}:`, error.message);
    }
  }

  return allRows.filter((row) => row.close > 0);
}

function calculateMA20(history) {
  if (!Array.isArray(history) || history.length < 20) return null;

  const sorted = history.slice().sort((a, b) => {
    return String(a.date).localeCompare(String(b.date));
  });

  const last20 = sorted.slice(-20);
  const latest = last20[last20.length - 1];

  const ma20 =
    last20.reduce((sum, item) => sum + item.close, 0) / last20.length;

  return {
    close: round(latest.close, 2),
    ma20: round(ma20, 2),
    diffPct: round(((latest.close - ma20) / ma20) * 100, 2)
  };
}

/**
 * TWSE 三大法人買賣超日報
 */
async function fetchTWSEInstitutionalTopBuys() {
  const dates = getRecentDates(7);

  for (const date of dates) {
    try {
      const url =
        "https://www.twse.com.tw/rwd/zh/fund/T86" +
        `?date=${date}&selectType=ALLBUT0999&response=json`;

      const json = await fetchJSON(url);

      if (!json || !Array.isArray(json.data) || json.data.length === 0) {
        continue;
      }

      const fields = json.fields || [];
      const rows = json.data;

      const stockIdIndex = findFieldIndex(fields, ["證券代號", "股票代號"]);
      const nameIndex = findFieldIndex(fields, ["證券名稱", "股票名稱"]);
      const totalIndex = findFieldIndex(fields, [
        "三大法人買賣超股數",
        "三大法人合計買賣超股數",
        "合計買賣超股數"
      ]);

      if (stockIdIndex < 0 || totalIndex < 0) {
        console.error("T86 fields not matched:", fields);
        continue;
      }

      const result = rows
        .map((row) => {
          const stockId = cleanText(row[stockIdIndex]);
          const name = nameIndex >= 0 ? cleanText(row[nameIndex]) : "";
          const netBuy = toNumber(row[totalIndex]);

          return {
            stockId,
            name,
            netBuy
          };
        })
        .filter((item) => /^\d{4}$/.test(item.stockId) && item.netBuy > 0)
        .sort((a, b) => b.netBuy - a.netBuy)
        .slice(0, 10);

      if (result.length > 0) {
        return result;
      }
    } catch (error) {
      console.error(`fetchTWSEInstitutionalTopBuys ${date}:`, error.message);
    }
  }

  return [];
}

function findFieldIndex(fields, possibleNames) {
  for (const name of possibleNames) {
    const index = fields.findIndex((field) => String(field).includes(name));
    if (index >= 0) return index;
  }

  return -1;
}

async function createTaiwanStockAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的市場分析助理。

請產生一則 LINE 用的「台股盤勢觀察」。

重要前提：
這個指令不抓即時行情資料，因此你不能捏造：
加權指數點位、成交量、外資買賣超、個股價格、即時漲跌幅、今日實際資金流向、實際強勢族群。

請用繁體中文輸出。
語氣要像一位理性、有市場經驗的投資筆記作者。
不要太像 AI，不要空泛，不要喊單。
內容要精簡，適合 LINE 閱讀。

請按照以下格式輸出：

【YORU LAB 台股觀察｜AI 測試版】

一、盤勢重點
二、技術面觀察
三、資金族群觀察
四、20MA 篩選邏輯
五、YORU LAB 筆記

限制：
- 不提供買進或賣出建議
- 不提供目標價
- 不保證漲跌
- 不捏造即時數據
- 不列出假的個股名單
- 最後必須加入：
內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。
`;

  return await askOpenAI(prompt);
}

async function createMA20StrategyNote() {
  const prompt = `
你是「YORU LAB 投資筆記」的技術分析教學助理。

請產生一則 LINE 用的「20 日均線觀察筆記」。

請用繁體中文輸出。
語氣要像實戰投資筆記，不要太像教科書。
內容要精簡，適合 LINE 閱讀。

格式：

【YORU LAB 20MA 觀察筆記】

一、20MA 代表什麼？
二、低於 20MA 不等於便宜
三、比較好的觀察方式
四、危險訊號
五、YORU LAB 筆記

最後加入：
內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。
`;

  return await askOpenAI(prompt);
}

async function createUSStockAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的美股市場觀察助理。

請產生一則 LINE 用的「美股觀察」。
目前沒有接入即時行情 API，因此不能捏造 SPY、QQQ、DIA、VIX、個股價格、即時漲跌幅或最新經濟數據。

格式：

【YORU LAB 美股觀察｜AI 測試版】

一、市場觀察重點
二、技術面方向
三、資金與族群
四、風險提醒
五、YORU LAB 筆記

最後加入：
內容僅供研究紀錄與市場觀察，不構成投資建議。
`;

  return await askOpenAI(prompt);
}

async function createBTCAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的加密貨幣市場觀察助理。

請產生一則 LINE 用的「BTC 觀察」。
目前沒有接入即時行情 API，因此不能捏造 BTC 價格、即時漲跌幅、資金費率、OI、ETF 淨流入、清算數據或鏈上數據。

格式：

【YORU LAB BTC 觀察｜AI 測試版】

一、盤勢觀察重點
二、技術面方向
三、資金與情緒觀察
四、風險提醒
五、YORU LAB 筆記

最後加入：
內容僅供研究紀錄與市場觀察，不構成投資建議。
`;

  return await askOpenAI(prompt);
}

async function askOpenAI(prompt) {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "你是 YORU LAB 投資筆記的研究助理。你擅長用繁體中文撰寫精簡、理性、實戰導向的市場觀察。你不能提供買賣建議、目標價、獲利保證，也不能捏造即時數據。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.6,
    max_tokens: 850
  });

  return completion.choices[0].message.content;
}

async function replyMessage(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
    },
    body: JSON.stringify({
      replyToken: replyToken,
      messages: [
        {
          type: "text",
          text: text.slice(0, 4900)
        }
      ]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("LINE reply error:", errorText);
  }
}

/**
 * 安全版 JSON fetch：
 * 如果 TWSE 回傳 HTML 安全頁，不讓程式爆掉。
 */
async function fetchJSON(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
      Referer: "https://www.twse.com.tw/"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("HTTP error:", response.status, text.slice(0, 300));
    return null;
  }

  const trimmed = text.trim();

  if (
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.includes("FOR SECURITY REASONS") ||
    trimmed.includes("因安全性考量")
  ) {
    console.error("TWSE returned HTML security page instead of JSON:", text.slice(0, 500));
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    console.error("JSON parse error:", text.slice(0, 500));
    return null;
  }
}

function cleanText(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  if (value === null || value === undefined) return 0;

  const cleaned = String(value)
    .replace(/,/g, "")
    .replace(/--/g, "")
    .replace(/X/g, "")
    .trim();

  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 2) {
  const base = Math.pow(10, digits);
  return Math.round(value * base) / base;
}

function formatTWMoney(value) {
  const number = Number(value || 0);

  if (number >= 100000000) {
    return `${round(number / 100000000, 2)} 億`;
  }

  if (number >= 10000) {
    return `${round(number / 10000, 2)} 萬`;
  }

  return `${number}`;
}

function formatShares(value) {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return `${round(number / 1000000, 2)} 百萬股`;
  }

  if (number >= 1000) {
    return `${round(number / 1000, 2)} 千股`;
  }

  return `${number} 股`;
}

function getRecentMonthStartDates(monthCount) {
  const result = [];
  const now = new Date();

  for (let i = 0; i < monthCount; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    result.push(`${yyyy}${mm}01`);
  }

  return result;
}

function getRecentDates(dayCount) {
  const result = [];
  const now = new Date();

  for (let i = 0; i < dayCount; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);

    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");

    result.push(`${yyyy}${mm}${dd}`);
  }

  return result;
}

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`YORU LAB LINE Bot running on port ${port}`);
});
