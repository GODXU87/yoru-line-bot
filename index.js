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
        } else if (userText === "資金" || userText === "資金排行") {
          replyText = await createSectorMoneyFlowAnalysis();
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
    "資金｜族群資金觀察\n" +
    "資金排行｜族群資金觀察\n" +
    "20MA｜20 日均線觀察邏輯\n" +
    "美股｜美股觀察\n" +
    "BTC｜加密貨幣觀察\n\n" +
    "目前版本尚未接入可用的全市場即時行情資料，因此不會提供即時報價、即時漲跌幅、法人買賣超或真實個股篩選名單。\n\n" +
    "內容僅供研究紀錄與市場觀察，不構成投資建議。"
  );
}

async function createTaiwanStockAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的市場分析助理。

請產生一則 LINE 用的「台股盤勢觀察」。

重要前提：
目前這個指令沒有接入即時行情 API，因此你不能捏造：
加權指數點位、成交量、外資買賣超、個股價格、即時漲跌幅、今日實際資金流向、實際強勢族群。

請用繁體中文輸出。
語氣要像一位理性、有市場經驗的投資筆記作者。
不要太像 AI，不要空泛，不要喊單。
內容要精簡，適合 LINE 閱讀。

請按照以下格式輸出：

【YORU LAB 台股觀察｜AI 測試版】

一、盤勢重點
用 2～3 句說明今日觀察台股時，應注意哪些市場結構。
可以提到：
大盤方向、櫃買指數、權值股、電子股、金融股、題材股輪動。
但不能假裝知道即時數據。

二、技術面觀察
用實戰語氣說明可以觀察：
5MA、10MA、20MA、量價、K 線結構、支撐壓力、趨勢是否延續。
不要寫得太教科書。

三、資金族群觀察
說明若要判斷資金在哪些族群，應觀察：
成交值是否放大、族群是否連續轉強、強勢股是否擴散、櫃買是否同步。
可以提到常見觀察族群：
AI、半導體、散熱、PCB、重電、軍工、機器人、金融、航運、觀光、生技。
但要說明這只是觀察框架，不代表今日實際資金流入。

四、20MA 篩選邏輯
說明：
如果某族群有資金關注，可以進一步找族群內「股價仍低於 20MA」的股票。
但低於 20MA 不代表便宜，可能只是弱勢。
比較值得觀察的是：
族群強、個股回檔、量縮止跌、跌幅收斂、接近支撐、準備站回短均。
應避開：
跌破 20MA 後持續破底、反彈無量、族群也轉弱的股票。

五、YORU LAB 筆記
用 3 句話總結，語氣要像個人投資筆記，有觀點但不能變成買賣建議。

限制：
- 不提供買進或賣出建議
- 不提供目標價
- 不保證漲跌
- 不捏造即時數據
- 不列出假的個股名單
- 不得使用「必漲」、「穩賺」、「一定會噴」、「無腦買」
- 最後必須加入：

內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。投資前請自行評估風險。
`;

  return await askOpenAI(prompt);
}

async function createSectorMoneyFlowAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的台股族群資金分析助理。

請產生一則 LINE 用的「族群資金觀察」。

重要前提：
目前系統尚未接入可用的全市場即時行情資料、成交值排名、產業分類、日 K、20MA 與三大法人資料。
因此不能捏造：
今日資金實際流入哪個族群、成交值排名、法人買賣超、個股價格、漲跌幅、低於 20MA 的真實個股名單。

請用繁體中文輸出。
語氣要專業、直接、有投資筆記感。
內容要精簡，適合 LINE 閱讀。

請按照以下格式輸出：

【YORU LAB 族群資金觀察｜AI 測試版】

一、目前限制
目前版本尚未接入可用的全市場資料源，因此無法直接列出「今日資金集中族群」、「低於 20MA 的真實股票清單」與「三大法人昨日買超名單」。

二、資金在哪裡，要看什麼？
請用 3～5 點說明判斷族群資金的方法：
成交值、漲幅擴散、族群連動、指標股強弱、櫃買指數、題材延續性。

三、常見觀察族群
列出目前台股常見會被觀察的族群：
AI、半導體、散熱、PCB、重電、軍工、機器人、金融、航運、觀光、生技、綠能。
要明確說明：
這是觀察清單，不代表今日實際資金流入。

四、族群內低於 20MA 怎麼看？
說明：
先確認族群有資金，再找族群內還沒站上 20MA 的股票。
但低於 20MA 不是買進理由。
要區分：
1. 強勢族群中的健康回檔
2. 弱勢股票的持續破線

五、如果未來接入資料，應該怎麼排行？
請說明一個合理的排序邏輯：
1. 先用成交金額找出市場最熱族群
2. 再看族群內指標股是否同步轉強
3. 接著篩出低於 20MA 但尚未破壞大結構的股票
4. 最後交叉比對三大法人是否有買超
5. 只把它當觀察清單，不直接當作買進名單

六、YORU LAB 筆記
用 3 句話總結這套資金觀察邏輯。

最後加入：
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

請按照以下格式輸出：

【YORU LAB 20MA 觀察筆記】

一、20MA 代表什麼？
簡單說明 20 日均線通常代表短中期趨勢與市場成本區。

二、低於 20MA 不等於便宜
說明股價低於 20MA 可能代表短線偏弱，不能單純因為跌到均線下就低接。

三、比較好的觀察方式
列出 4 個條件：
族群仍強、股價回檔但不破大結構、量縮止跌、重新站回短均或 20MA。

四、危險訊號
列出 4 個條件：
跌破 20MA 後持續破底、反彈無量、跌破前低、族群同步轉弱。

五、YORU LAB 筆記
用 3 句話總結 20MA 的使用觀念。

最後加入：
內容僅供研究紀錄與市場觀察，不構成任何投資建議、買賣指令或獲利保證。
`;

  return await askOpenAI(prompt);
}

async function createUSStockAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的美股市場觀察助理。

請產生一則 LINE 用的「美股觀察」。

重要前提：
目前沒有接入即時行情 API，因此不能捏造：
SPY、QQQ、DIA、VIX、個股價格、即時漲跌幅、CPI、FOMC 最新結果或任何即時數據。

請用繁體中文輸出，內容精簡，適合 LINE 閱讀。

格式：

【YORU LAB 美股觀察｜AI 測試版】

一、市場觀察重點
二、技術面方向
三、資金與族群
四、風險提醒
五、YORU LAB 筆記

請提醒目前沒有即時行情資料，只能提供觀察框架。
最後加入：
內容僅供研究紀錄與市場觀察，不構成投資建議。
`;

  return await askOpenAI(prompt);
}

async function createBTCAnalysis() {
  const prompt = `
你是「YORU LAB 投資筆記」的加密貨幣市場觀察助理。

請產生一則 LINE 用的「BTC 觀察」。

重要前提：
目前沒有接入即時行情 API，因此不能捏造：
BTC 價格、即時漲跌幅、資金費率、OI、ETF 淨流入、清算數據、鏈上數據。

請用繁體中文輸出，內容精簡，適合 LINE 閱讀。

格式：

【YORU LAB BTC 觀察｜AI 測試版】

一、盤勢觀察重點
二、技術面方向
三、資金與情緒觀察
四、風險提醒
五、YORU LAB 筆記

請提醒目前沒有即時行情資料，只能提供觀察框架。
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

const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`YORU LAB LINE Bot running on port ${port}`);
});
