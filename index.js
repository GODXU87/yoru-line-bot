const express = require("express");

const app = express();
app.use(express.json());

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

app.get("/", (req, res) => {
  res.send("YORU LAB LINE Bot is running.");
});

app.post("/webhook", async (req, res) => {
  try {
    const events = req.body.events || [];

    for (const event of events) {
      if (event.type === "message" && event.message.type === "text") {
        const userText = event.message.text.trim();
        const replyText = createReply(userText);

        await replyMessage(event.replyToken, replyText);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).send("Error");
  }
});

function createReply(userText) {
  if (userText === "美股") {
    return "【昨日美股觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. 三大指數表現\n2. 科技股與半導體狀況\n3. VIX 與市場情緒\n4. 美債殖利率與美元指數\n5. 對台股可能影響\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  }

  if (userText === "台股") {
    return "【台股盤勢觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. 加權指數走勢\n2. 0050 / 00878 / 半導體族群\n3. 成交量與外資動向\n4. 技術面重點\n5. 今日觀察方向\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  }

  if (userText === "BTC") {
    return "【BTC 行情觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. BTC 最新價格\n2. 漲跌幅\n3. 技術面結構\n4. 市場情緒\n5. 風險提醒\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  }

  return "你可以輸入：\n\n美股\n台股\nBTC\n\n我會回覆對應的市場觀察。";
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
          text: text
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
