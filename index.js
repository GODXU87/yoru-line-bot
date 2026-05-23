const express = require("express");
const line = require("@line/bot-sdk");
require("dotenv").config();

const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const app = express();
const client = new line.Client(config);

app.get("/", (req, res) => {
  res.send("YORU LAB LINE Bot is running.");
});

app.post("/webhook", line.middleware(config), async (req, res) => {
  try {
    const events = req.body.events;
    await Promise.all(events.map(handleEvent));
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

async function handleEvent(event) {
  if (event.type !== "message" || event.message.type !== "text") {
    return null;
  }

  const userText = event.message.text.trim();

  let replyText = "";

  if (userText === "美股") {
    replyText =
      "【昨日美股觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. 三大指數表現\n2. 科技股與半導體狀況\n3. VIX 與市場情緒\n4. 對台股可能影響\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  } else if (userText === "台股") {
    replyText =
      "【台股盤勢觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. 加權指數走勢\n2. 0050 / 00878 / 半導體族群\n3. 外資與成交量變化\n4. 技術面重點\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  } else if (userText === "BTC") {
    replyText =
      "【BTC 行情觀察】\n\n目前為測試版本。\n未來這裡會顯示：\n1. BTC 最新價格\n2. 漲跌幅\n3. 技術面結構\n4. 市場情緒與風險\n\n提醒：內容僅供研究紀錄，不構成投資建議。";
  } else {
    replyText =
      "你可以輸入：\n\n美股\n台股\nBTC\n\n我會回覆對應的市場觀察。";
  }

  return client.replyMessage(event.replyToken, {
    type: "text",
    text: replyText
  });
}

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
