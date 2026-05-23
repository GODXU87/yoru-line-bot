const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FINMIND_TOKEN = process.env.FINMIND_TOKEN;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY
});

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
        } else if (userText === "資金" || userText === "資金排行") {
          replyText = await createRealSectorMoneyFlowReport();
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
    "台股｜台股盤勢觀察\n" +
    "資金｜族群成交金額排行＋20MA 篩選＋法人買超\n" +
    "資金排行｜同上\n" +
    "20MA｜20 日均線觀察邏輯\n" +
    "美股｜美股觀察\n" +
    "BTC｜加密貨幣觀察\n\n" +
    "提醒：目前資料源以 FinMind 為主，盤後資料可能有更新時間差。內容僅供研究紀錄與市場觀察，不構成投資建議。"
  );
}

async function createRealSectorMoneyFlowReport() {
  try {
    if (!FINMIND_TOKEN) {
      return (
        "【YORU LAB 資金排行】\n\n" +
        "目前尚未設定 FINMIND_TOKEN，所以無法抓取台股成交金額、20MA 與三大法人資料。\n\n" +
        "請到 Render 的 Environment Variables 新增：\n\n" +
        "FINMIND_TOKEN = 你的 FinMind API Token\n\n" +
        "設定後重新部署，再輸入「資金排行」。"
      );
    }

    const today = new Date();
    const endDate = formatDate(today);
    const startDate = formatDate(addDays(today, -60));

    const stockInfo = await fetchFinMind("TaiwanStockInfo", {});
    const priceData = await fetchFinMind("TaiwanStockPrice", {
      start_date: startDate,
      end_date: endDate
    });

    if (!Array.isArray(priceData) || priceData.length === 0) {
      return (
        "【YORU LAB 資金排行】\n\n" +
        "目前沒有抓到股價資料，可能原因：\n" +
        "1. FinMind API 暫時無資料\n" +
        "2. Token 權限或額度不足\n" +
        "3. 今日資料尚未更新\n\n" +
        "請稍後再試，或檢查 Render Logs。"
      );
    }

    const infoMap = buildStockInfoMap(stockInfo);
    const latestDate = getLatestDate(priceData);
    const latestPrices = priceData.filter((row) => row.date === latestDate);

    const commonStocks = latestPrices.filter((row) => {
      const id = String(row.stock_id || "");
      return /^\d{4}$/.test(id) && infoMap[id] && infoMap[id].industry_category;
    });

    const sectorRank = buildSectorRank(commonStocks, infoMap).slice(0, 6);

    const ma20Map = buildMA20Map(priceData);
    const belowMA20BySector = buildBelowMA20BySector(
      sectorRank,
      commonStocks,
      infoMap,
      ma20Map
    );

    const institutionalReport = await createInstitutionalBuyReport(latestDate, infoMap);

    let reply =
      "【YORU LAB 資金排行｜盤後資料版】\n" +
      `資料日期：${latestDate}\n\n` +
      "一、目前成交金額集中族群排行\n";

    sectorRank.forEach((sector, index) => {
      reply +=
        `${index + 1}. ${sector.industry}｜成交金額約 ${formatMoneyTW(
          sector.totalTradingMoney
        )}｜檔數 ${sector.count}\n`;
    });

    reply += "\n二、各族群中低於 20MA 的股票\n";

    sectorRank.forEach((sector) => {
      const list = belowMA20BySector[sector.industry] || [];

      reply += `\n【${sector.industry}】\n`;

      if (list.length === 0) {
        reply += "目前沒有篩到明顯低於 20MA 的股票，或資料不足。\n";
      } else {
        list.slice(0, 5).forEach((stock) => {
          reply +=
            `${stock.stock_id} ${stock.stock_name}｜收盤 ${stock.close}｜20MA ${stock.ma20}｜差距 ${stock.diffPct}%\n`;
        });
      }
    });

    reply += "\n三、三大法人昨日買超觀察\n";
    reply += institutionalReport;

    reply +=
      "\n\nYORU LAB 筆記：\n" +
      "成交金額集中代表市場注意力，不等於一定會上漲。\n" +
      "低於 20MA 也不代表便宜，可能是弱勢延續。\n" +
      "比較值得觀察的是：族群有量、個股回檔不破結構、法人或資金開始重新承接。\n\n" +
      "內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。";

    return reply.slice(0, 4900);
  } catch (error) {
    console.error("createRealSectorMoneyFlowReport error:", error);

    return (
      "【YORU LAB 資金排行】\n\n" +
      "資料抓取或計算時發生錯誤。\n\n" +
      "可能原因：\n" +
      "1. FinMind Token 沒設定或權限不足\n" +
      "2. API 回傳資料過大，Render 免費版處理較慢\n" +
      "3. 三大法人全市場資料可能需要較高權限\n" +
      "4. 今日盤後資料尚未更新\n\n" +
      "請到 Render Logs 看錯誤訊息。"
    );
  }
}

async function createInstitutionalBuyReport(latestDate, infoMap) {
  try {
    const institutionalData = await fetchFinMind("TaiwanStockInstitutionalInvestorsBuySell", {
      start_date: latestDate
    });

    if (!Array.isArray(institutionalData) || institutionalData.length === 0) {
      return (
        "目前沒有抓到三大法人買賣超資料，可能是資料尚未更新、Token 權限不足，或此資料集無法一次抓取全市場。\n"
      );
    }

    const grouped = {};

    for (const row of institutionalData) {
      const stockId = String(row.stock_id || "");
      if (!/^\d{4}$/.test(stockId)) continue;

      const buy = Number(row.buy || 0);
      const sell = Number(row.sell || 0);
      const net = buy - sell;

      if (!grouped[stockId]) {
        grouped[stockId] = 0;
      }

      grouped[stockId] += net;
    }

    const ranking = Object.entries(grouped)
      .map(([stock_id, netBuy]) => ({
        stock_id,
        stock_name: infoMap[stock_id]?.stock_name || "",
        industry: infoMap[stock_id]?.industry_category || "",
        netBuy
      }))
      .filter((item) => item.netBuy > 0)
      .sort((a, b) => b.netBuy - a.netBuy)
      .slice(0, 10);

    if (ranking.length === 0) {
      return "目前沒有篩到三大法人合計買超為正的股票，或資料不足。\n";
    }

    let text = "三大法人合計買超前 10 名：\n";

    ranking.forEach((item, index) => {
      text +=
        `${index + 1}. ${item.stock_id} ${item.stock_name}｜${item.industry}｜買超 ${formatShares(item.netBuy)}\n`;
    });

    return text;
  } catch (error) {
    console.error("createInstitutionalBuyReport error:", error);

    return (
      "三大法人資料抓取失敗。可能是 FinMind 權限限制，或全市場三大法人資料需要更高方案。\n"
    );
  }
}

function buildStockInfoMap(stockInfo) {
  const map = {};

  if (!Array.isArray(stockInfo)) return map;

  for (const item of stockInfo) {
    const stockId = String(item.stock_id || "");
    if (!stockId) continue;

    map[stockId] = {
      stock_id: stockId,
      stock_name: item.stock_name || item.name || "",
      industry_category: item.industry_category || "",
      type: item.type || "",
      market: item.market || ""
    };
  }

  return map;
}

function buildSectorRank(latestPrices, infoMap) {
  const sectorMap = {};

  for (const row of latestPrices) {
    const stockId = String(row.stock_id || "");
    const info = infoMap[stockId];

    if (!info || !info.industry_category) continue;

    const industry = info.industry_category;
    const tradingMoney = Number(row.Trading_money || 0);

    if (!sectorMap[industry]) {
      sectorMap[industry] = {
        industry,
        totalTradingMoney: 0,
        count: 0
      };
    }

    sectorMap[industry].totalTradingMoney += tradingMoney;
    sectorMap[industry].count += 1;
  }

  return Object.values(sectorMap)
    .filter((item) => item.totalTradingMoney > 0)
    .sort((a, b) => b.totalTradingMoney - a.totalTradingMoney);
}

function buildMA20Map(priceData) {
  const grouped = {};

  for (const row of priceData) {
    const stockId = String(row.stock_id || "");
    if (!/^\d{4}$/.test(stockId)) continue;

    if (!grouped[stockId]) {
      grouped[stockId] = [];
    }

    grouped[stockId].push({
      date: row.date,
      close: Number(row.close || 0)
    });
  }

  const ma20Map = {};

  for (const stockId of Object.keys(grouped)) {
    const rows = grouped[stockId]
      .filter((item) => item.close > 0)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (rows.length < 20) continue;

    const latest = rows[rows.length - 1];
    const last20 = rows.slice(-20);
    const ma20 =
      last20.reduce((sum, item) => sum + item.close, 0) / last20.length;

    ma20Map[stockId] = {
      close: round(latest.close, 2),
      ma20: round(ma20, 2),
      diffPct: round(((latest.close - ma20) / ma20) * 100, 2)
    };
  }

  return ma20Map;
}

function buildBelowMA20BySector(sectorRank, latestPrices, infoMap, ma20Map) {
  const targetIndustries = sectorRank.map((item) => item.industry);
  const result = {};

  for (const industry of targetIndustries) {
    result[industry] = [];
  }

  for (const row of latestPrices) {
    const stockId = String(row.stock_id || "");
    const info = infoMap[stockId];
    const ma = ma20Map[stockId];

    if (!info || !ma) continue;
    if (!targetIndustries.includes(info.industry_category)) continue;

    if (ma.close < ma.ma20) {
      result[info.industry_category].push({
        stock_id: stockId,
        stock_name: info.stock_name,
        close: ma.close,
        ma20: ma.ma20,
        diffPct: ma.diffPct,
        tradingMoney: Number(row.Trading_money || 0)
      });
    }
  }

  for (const industry of Object.keys(result)) {
    result[industry].sort((a, b) => b.tradingMoney - a.tradingMoney);
  }

  return result;
}

async function fetchFinMind(dataset, params = {}) {
  const url = new URL("https://api.finmindtrade.com/api/v4/data");

  url.searchParams.set("dataset", dataset);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${FINMIND_TOKEN}`
    }
  });

  const json = await response.json();

  if (!response.ok) {
    console.error("FinMind HTTP error:", json);
    throw new Error("FinMind HTTP error");
  }

  if (json.status && json.status !== 200) {
    console.error("FinMind API error:", json);
    throw new Error(json.msg || "FinMind API error");
  }

  return json.data || [];
}

async function createTaiwanStockAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的市場分析助理。

請產生一則 LINE 用的「台股盤勢觀察」。

重要前提：
目前這個指令不抓即時行情資料，因此你不能捏造：
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

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getLatestDate(rows) {
  return rows
    .map((row) => row.date)
    .filter(Boolean)
    .sort()
    .pop();
}

function round(value, digits = 2) {
  const base = Math.pow(10, digits);
  return Math.round(value * base) / base;
}

function formatMoneyTW(value) {
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`YORU LAB LINE Bot running on port ${port}`);
});
