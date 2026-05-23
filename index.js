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
        } else if (userText === "資金") {
          replyText = await createSectorMoneyFlowAnalysis();
        } else if (userText === "美股") {
          replyText = "【昨日美股觀察】\n\n目前美股 AI 分析功能尚未開啟。";
        } else if (userText === "BTC") {
          replyText = "【BTC 行情觀察】\n\n目前 BTC 即時行情功能尚未開啟。";
        } else {
          replyText =
            "你可以輸入：\n\n" +
            "台股\n" +
            "資金\n" +
            "美股\n" +
            "BTC\n\n" +
            "目前「台股」與「資金」已接入 OpenAI 分析測試版。\n\n" +
            "提醒：目前尚未接入即時行情資料，因此不會提供即時點位、即時漲跌幅或真實個股篩選結果。";
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
你是「YORU LAB 投資筆記」的市場分析助理。

請產生一則「台股盤勢觀察」，用途是給 LINE 使用者閱讀。

重要前提：
目前沒有接入即時行情 API，因此你不能捏造以下資訊：
- 加權指數點位
- 成交量
- 外資買賣超
- 個股價格
- 即時漲跌幅
- 今日實際資金流向
- 哪些股票真的低於 20 日均線

請用繁體中文輸出。
語氣要像一位理性、謹慎、有市場經驗的投資筆記作者。
不要太像 AI，不要空泛，不要喊單，不要保證漲跌。

請按照以下格式輸出：

【YORU LAB 台股盤勢觀察｜AI 測試版】

一、今日觀察重點
請說明今天觀察台股時，應優先注意哪些市場結構，例如：
大盤方向、櫃買指數、權值股、電子族群、金融股、題材股輪動、成交量是否放大等。
只能用「觀察方向」描述，不能假裝知道即時數據。

二、技術面思考
請從均線、量價、K 線結構、支撐壓力、趨勢線、震盪區間等角度，說明投資人可以怎麼判斷盤勢強弱。
要像實戰筆記，不要像教科書。

三、資金面觀察方向
請說明台股常見資金可能觀察的族群，例如：
半導體、AI、電子、金融、傳產、航運、觀光、重電、軍工、機器人、散熱、PCB 等。
但不能說今天某族群一定有資金流入，除非有資料來源。

四、強勢族群與 20 日均線觀察
請說明一個實戰邏輯：
如果某族群近期有資金關注，可以進一步觀察該族群內「股價仍低於 20 日均線」的股票。
但必須明確提醒：
目前尚未接入台股日 K 與均線資料，因此無法列出真實個股名單。
請改用「篩選邏輯」說明，例如：
1. 先找成交值放大的族群
2. 再看族群內個股是否站回 5MA、10MA、20MA
3. 低於 20MA 的股票不是一定便宜，可能代表仍在弱勢
4. 若股價低於 20MA，但量縮止跌、跌幅收斂、接近前低支撐，才值得列入觀察
5. 若跌破 20MA 後持續破底，應先避開

五、操作風險提醒
請提醒使用者避免：
追高、過度槓桿、沒有停損計畫、看到題材就衝、只看消息不看結構、把低於均線誤認為便宜。

六、YORU LAB 筆記
請用 3 句話總結今天台股的觀察重點。
語氣要有個人投資筆記感，可以簡潔、有觀點，但不能變成買賣建議。

限制：
- 不提供明確買進或賣出建議
- 不提供目標價
- 不保證漲跌
- 不捏造即時數據
- 不列出假的個股清單
- 不得使用「必漲」、「穩賺」、「一定會噴」、「無腦買」等語氣
- 必須加入以下免責聲明：

內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。投資前請自行評估風險。
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "你是專業但謹慎的投資研究助理，擅長用繁體中文撰寫市場觀察筆記。回答必須避免投資建議、目標價、喊單語氣與未證實數據。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.65,
    max_tokens: 1000
  });

  return completion.choices[0].message.content;
}

async function createSectorMoneyFlowAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的台股資金流向分析助理。

請產生一則「台股族群資金觀察」。
用途是給 LINE 使用者閱讀。

重要前提：
目前系統尚未接入即時行情 API、成交值排名、產業分類資料、日 K 資料與 20 日均線資料。
因此你不能捏造：
- 今日資金實際流入哪個族群
- 今日成交值排名
- 哪些個股實際低於 20 日均線
- 個股即時價格
- 個股漲跌幅
- 法人買賣超

但是你要幫使用者建立一個專業的觀察框架。

請用繁體中文輸出，語氣專業、直接、有投資筆記感，不要太像 AI。

請按照以下格式輸出：

【YORU LAB 族群資金觀察｜AI 測試版】

一、資金流向應該怎麼看
請說明判斷台股資金在哪些族群的方式，例如：
成交值排行、族群漲幅、類股輪動、權值股表現、櫃買指數強弱、題材延續性、是否有量價配合。

二、近期常見觀察族群
請列出台股常見容易被資金關注的族群，例如：
AI、半導體、散熱、PCB、重電、軍工、機器人、金融、航運、觀光、生技、綠能。
但要明確說明：
以下只是常見觀察名單，不代表今日實際資金流入。

三、族群內低於 20 日均線的股票怎麼篩
請說明篩選邏輯：
1. 先確認該族群是否真的有資金流入
2. 再找族群內股價低於 20MA 的股票
3. 區分「健康回檔」與「弱勢破線」
4. 觀察是否出現量縮止跌、站回短均、跌幅收斂、接近支撐區
5. 如果跌破 20MA 後繼續破底，不能因為低於均線就認為便宜

四、低於 20MA 的個股要注意什麼
請說明：
低於 20MA 可能代表短線偏弱，不一定是低接機會。
如果族群強、個股回檔但沒有破壞大結構，才比較像觀察名單。
如果族群弱、個股也弱，通常應先避開。

五、目前版本限制
請明確告訴使用者：
目前尚未接入即時行情資料，因此無法提供真實的「今日資金族群」與「低於 20MA 個股清單」。
未來若接入資料源，可以升級成：
今日強勢族群 → 族群成分股 → 低於 20MA 名單 → 技術結構篩選。

六、YORU LAB 筆記
請用 3 句話總結這套資金觀察邏輯。

限制：
- 不提供買進或賣出建議
- 不提供目標價
- 不保證漲跌
- 不捏造即時數據
- 不列出假的個股名單
- 不得使用喊單語氣
- 必須加入以下免責聲明：

內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。投資前請自行評估風險。
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "你是專業但謹慎的台股資金流向研究助理，擅長用繁體中文整理族群輪動、均線觀察與風險控管。回答必須避免投資建議、目標價、喊單語氣與未證實數據。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    temperature: 0.65,
    max_tokens: 1000
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`YORU LAB LINE Bot running on port ${port}`);
});
