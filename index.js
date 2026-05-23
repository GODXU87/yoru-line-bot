const express = require("express");
const OpenAI = require("openai");

const app = express();
app.use(express.json());

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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
        } else if (userText === "美股") {
          replyText = "【昨日美股觀察】\n\n目前美股 AI 分析功能尚未開啟。";
        } else if (userText === "BTC") {
          replyText = "【BTC 行情觀察】\n\n目前 BTC 即時行情功能尚未開啟。";
        } else {
          replyText = "你可以輸入：\n\n台股\n美股\nBTC\n\n目前「台股」已接入 OpenAI 分析測試版。";
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

async function createTaiwanStockAnalysis() {
  const prompt = `
你是 YORU LAB 投資筆記的市場分析助理。

請產生一則「台股盤勢觀察」。
目前沒有即時行情資料，因此不能捏造加權指數點位、成交量、外資買賣超、個股價格或即時漲跌幅。

請用以下格式輸出，語氣專業、簡潔、有投資筆記感，不要太像 AI。

格式：
【台股盤勢觀察｜AI 分析測試版】

1. 今日觀察重點
2. 技術面思考
3. 資金面觀察方向
4. 風險提醒
5. YORU LAB 筆記

限制：
- 不要提供買賣建議
- 不要提供目標價
- 不要保證漲跌
- 不要捏造即時數據
- 必須加入「內容僅供研究紀錄，不構成投資建議」
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "你是專業但謹慎的投資研究助理，回答必須避免投資建議與未證實數據。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.7,
    max_tokens: 700
  });

  return completion.choices[0].message.content;
}

async function replyMessage(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`YORU LAB LINE Bot running on port ${port}`);
});
