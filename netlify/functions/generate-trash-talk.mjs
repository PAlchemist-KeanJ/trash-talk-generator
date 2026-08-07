// Generates the short "trash talk" quote for the card design.
// The browser builds the full instruction prompt (language lock + creative
// direction + the user's message) and posts it here.
//
// Reliability model — why this file looks the way it does:
//
// The browser only ever shows "AI is busy right now. Please try again!" when
// this endpoint hands back nothing usable. Originally there was a single
// attempt at DeepSeek followed by a single attempt at Claude, with no retries
// and no timeouts, so ONE transient hiccup (DeepSeek's very common 503 "server
// busy", or an account-scoped 429 on the gateway) surfaced straight to the user
// as "busy".
//
// So: four independent providers, each attempt time-boxed, transient failures
// retried, a global deadline that guarantees we answer before the platform's
// function timeout, and a short cooldown on a provider that keeps failing.
//
// Provider order: DeepSeek (DEEPSEEK_API_KEY) first, then Claude, Gemini and
// OpenAI through the Netlify AI Gateway. All keys stay server-side.

// "deepseek-chat" was retired: the API now 400s with "The supported API model
// names are deepseek-v4-pro or deepseek-v4-flash". That silent 400 on every
// request is what left Claude as the only working provider and made "AI is
// busy" start showing up. Flash is the right fit for a 20-30 character quote.
const DEEPSEEK_MODEL = "deepseek-v4-flash";
const CLAUDE_MODEL = "claude-haiku-4-5";
const CLAUDE_BACKUP_MODEL = "claude-sonnet-4-5";
const GEMINI_MODEL = "gemini-3.5-flash";
const OPENAI_MODEL = "gpt-4.1-mini";

// Netlify gives a synchronous function 10s. Stop starting new work at 8.5s so we
// always return a real answer instead of being killed mid-flight (a killed
// function reads as "busy" to the browser, which is the bug we are fixing).
const TOTAL_BUDGET_MS = 8500;
const ATTEMPT_TIMEOUT_MS = 3500;
const RETRY_BACKOFF_MS = 350;

// Statuses worth a second look. Anything else (401/403/404/422) is a
// configuration problem that retrying cannot fix.
const TRANSIENT_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 522, 524, 529]);

// Per-instance, best-effort circuit breaker. Purely ephemeral runtime state:
// if a provider is having a bad minute we stop paying its timeout on every
// request and fall through to the next one immediately.
const COOLDOWN_MS = 60_000;
const FAILS_BEFORE_COOLDOWN = 3;
const breakers = new Map();

function isTripped(name) {
  const b = breakers.get(name);
  return !!b && b.until > Date.now();
}

function noteFailure(name) {
  const b = breakers.get(name) || { streak: 0, until: 0 };
  b.streak += 1;
  if (b.streak >= FAILS_BEFORE_COOLDOWN) {
    b.until = Date.now() + COOLDOWN_MS;
    b.streak = 0;
  }
  breakers.set(name, b);
}

function noteSuccess(name) {
  breakers.delete(name);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Language validation
//
// A wrong-language answer is rejected by the browser and shows the same "busy"
// alert, so it is worth checking here: if a provider replies in the wrong
// language we move to the next provider rather than burning a whole extra
// round trip from the browser.
// ---------------------------------------------------------------------------

const TRADITIONAL_ONLY =
  "萬與專業東絲丟兩嚴喪個豐臨為麗舉麼義烏樂喬習鄉書買亂乾爭於虧雲亞產畝親億僅從侖倉儀們價眾優夥會傘偉傳傷倫偽佇體餘傭傾僑儘兒兇兌黨內冊寫軍農凍淨凱別剛創刪則劃劉剎勁動勞勢勳勵勸勻區醫華協單賣盧衛卻廠歷厲壓厭參雙發變疊叢吳吶員唄唸問啟喚喬嗎噸園團圍國圖圓執堅塊塗塵墳壘壞壟壩壯聲壺壽夠夢奧奪奮婦媽媧嫻嬌嬰學寶實寧審寬寵將專尋對導屆屬岡峽島嶺嶼巔巖巢帶幀幣幫幹庫廁廂廈廚廢廣廳弒張彌彎彙後徑復徵徹恆惡惱惻慄憂懷懶懼懸懺戇戶撲擁擋擔據擴擾攝擺擠攔攜攪敗敘敵數斂斃時晉曆曉曠朧條來楊極構槍樁樓標樞樣橋機權殺雜欄歐歡歲歸殘殼毀氣氫氬溝滅潔澀潤潛澤濁濃濕瀉瀋灣滯濟瀏濾瀨燈靈災煩熱煉煙煥爐點爺牆牽犧狀獨獅獵獸獻瑤環璣畫當痙瘋癱癮癩癬皺盜盡監盤眾睜瞞矚礦礙禍禮禪離稅穀窩窪窮窯竄竅競筆築簡簽籠籩籮類糧糞糾紀約紅紂紋納紐紓純紕紗紛紙級紜紡索緊紹終組細紱結繞繪給絢絳絡絕統絲絹綏經綜綠綢綰綱網綴綿維緇線緙緣編緩緬緯練緻縉縣縫總績織繕繼續纏纜缽罈罷羅羈羥習翹聖聞聯聰聳聶職聽肅脅脈臉臍臘與興舉艦艷藝節芻苧茲荊莊萊薑葉著葷蒐蒼蓋蓮蔥蕭蕩藍藥蘇處虛虜號蛻蜆蝕螞螢蟲蠟蠻衆術衝裊裝複褲襯規覓視覺覽觀觸計訊討訓訕託記訛訝訟訣訪設許訴診詐詞詠評詛識該詳詫詬詭詩話詮誄誅誇誌認誑誒誕誘誠誡誤說誰課調請諒論諷諸諾謀謁謂謊謎謙講謝謠謹譜譯議護讀讚穫貝貞負財貢貧貨販貪貫責貯貳貴貸費貿賀賁賂賃賄資賈賊賑賓賒賜賞賠賢賤賦質賭賴贈贊趕趙趨跡踐踴蹤躍軀車軋軌軒軔軛軟軻軸輕載較輒輛輝輩輪輯輸轄轍轟辦辭邊遙遜遞郵鄧鄭鄰醞釀釁釋釐鈔鉤鉛銀銃銅銘銳鋒鋅錘錦錯鍋鍊鍾鎖鎮鏡鐵鑄鑽鑼長門閃閉開閒閔間閣閥閨閱闊闡隊陽陰陣際陸陳陝險隱隴隸雞難雲電霧靜靦韋韓頁頂頃項順須頊頌頓頗領頜頡頤頷頭頹頻顆題顎顏願顛顧顫風颱飛飢飯飲餅餓館餞饒饗馬馭馮馳駁駐駕騎騙騷驅驚驛驗髮鬆鬍鬥鬧魯鮮鯉鯊鯨鰓鱗鳥鳳鳴鴉鴨鵬鶴鷗麗麥麵黃點黴齊齋齒齡龍龐龜";

const SIMPLIFIED_ONLY =
  "万与专业东丝丢两严丧个丰临为丽举么义乌乐乔习乡书买乱干争于亏云亚产亩亲亿仅从仑仓仪们价众优伙会伞伟传伤伦伪伫体余佣倾侨尽儿凶兑党内册写军农冻净凯别刚创删则划刘刹劲动劳势勋励劝匀区医华协单卖卢卫却厂历厉压厌参双发变叠丛吴呐员呗念问启唤乔吗吨园团围国图圆执坚块涂尘坟垒坏垄坝壮声壶寿够梦奥夺奋妇妈娲娴娇婴学宝实宁审宽宠将专寻对导届属冈峡岛岭屿巅岩巢带帧币帮干库厕厢厦厨废广厅弑张弥弯汇后径复征彻恒恶恼恻栗忧怀懒惧悬忏戆户扑拥挡担据扩扰摄摆挤拦携搅败叙敌数敛毙时晋历晓旷胧条来杨极构枪桩楼标枢样桥机权杀杂栏欧欢岁归残壳毁气氢氩沟灭洁涩润潜泽浊浓湿泻沈湾滞济浏滤濑灯灵灾烦热炼烟焕炉点爷墙牵牺状独狮猎兽献瑶环玑画当痉疯瘫瘾癞癣皱盗尽监盘众睁瞒瞩矿碍祸礼禅离税谷窝洼穷窑窜窍竞笔筑简签笼笾箩类粮粪纠纪约红纣纹纳纽纾纯纰纱纷纸级纭纺索紧绍终组细绂结绕绘给绚绛络绝统丝绢绥经综绿绸绾纲网缀绵维缁线缂缘编缓缅纬练致缙县缝总绩织缮继续缠缆钵坛罢罗羁羟习翘圣闻联聪耸聂职听肃胁脉脸脐腊与兴举舰艳艺节刍苎兹荆庄莱姜叶着荤搜苍盖莲葱萧荡蓝药苏处虚虏号蜕蚬蚀蚂萤虫蜡蛮众术冲袅装复裤衬规觅视觉览观触计讯讨训讪托记讹讶讼诀访设许诉诊诈词咏评诅识该详诧诟诡诗话诠诔诛夸志认诳诶诞诱诚诫误说谁课调请谅论讽诸诺谋谒谓谎谜谦讲谢谣谨谱译议护读赞获贝贞负财贡贫货贩贪贯责贮贰贵贷费贸贺贲赂赁贿资贾贼赈宾赊赐赏赔贤贱赋质赌赖赠赞赶赵趋迹践踊踪跃躯车轧军轨轩轫轭软轲轴轻载较辄辆辉辈轮辑输辖辙轰办辞边遥逊递邮邓郑邻酝酿衅释厘钞钩铅银铳铜铭锐锋锌锤锦错锅链钟锁镇镜铁铸钻锣长门闪闭开闲闵间阁阀闺阅阔阐队阳阴阵际陆陈陕险隐陇隶鸡离难云电雾静腼韦韩页顶顷项顺须顼颂顿颇领颌颉颐颔头颓频颗题颚颜愿颠顾颤风台飞饥饭饮饼饿馆饯饶飨马驭冯驰驳驻驾骑骗骚驱惊驿验发松胡斗闹鲁鲜鲤鲨鲸鳃鳞鸟凤鸣鸦鸭鹏鹤鸥丽麦面黄点霉齐斋齿龄龙庞龟";

const TRADITIONAL_SET = new Set(Array.from(TRADITIONAL_ONLY));
const SIMPLIFIED_SET = new Set(Array.from(SIMPLIFIED_ONLY));

const HAS_KANA = /[\u3040-\u309f\u30a0-\u30ff]/;
const HAS_HANGUL = /[\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;
const HAS_HAN = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const HAS_ANY_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af\u1100-\u11ff\u3130-\u318f]/;

const KNOWN_LANGUAGES = new Set([
  "english",
  "japanese",
  "korean",
  "simplifiedChinese",
  "traditionalChinese",
]);

// Mirrors outputMatchesExpectedLanguage() in the browser so both sides agree on
// what counts as an acceptable answer.
function outputMatchesLanguage(output, language) {
  const text = String(output || "").trim();
  if (!text) return false;
  if (!KNOWN_LANGUAGES.has(language)) return true;

  if (language === "english") return !HAS_ANY_CJK.test(text);
  if (language === "japanese") return HAS_KANA.test(text) && !HAS_HANGUL.test(text);
  if (language === "korean") return HAS_HANGUL.test(text);

  if (!HAS_HAN.test(text)) return false;
  let traditional = 0;
  let simplified = 0;
  for (const ch of text) {
    if (TRADITIONAL_SET.has(ch)) traditional++;
    if (SIMPLIFIED_SET.has(ch)) simplified++;
  }
  if (language === "simplifiedChinese" && traditional > simplified) return false;
  if (language === "traditionalChinese" && simplified > traditional) return false;
  return true;
}

function cleanOutput(text) {
  if (typeof text !== "string") return "";
  return text
    .trim()
    // Providers occasionally wrap the quote in a fenced code block.
    .replace(/^```[a-zA-Z]*\s*/, "")
    .replace(/\s*```$/, "")
    .trim()
    .replace(/^["'“”「」『』]+|["'“”「」『』]+$/g, "")
    .trim();
}

// ---------------------------------------------------------------------------
// Providers
//
// Each returns { text, retryable }. `retryable` tells the caller whether a
// second attempt is worth the remaining time budget.
// ---------------------------------------------------------------------------

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) {
      // Read a little of the body so the failure reason lands in the logs.
      let detail = "";
      try {
        detail = (await resp.text()).slice(0, 300);
      } catch {
        /* body already consumed or unreadable */
      }
      return {
        ok: false,
        kind: `http-${resp.status}`,
        detail,
        retryable: TRANSIENT_STATUS.has(resp.status),
      };
    }
    return { ok: true, data: await resp.json() };
  } catch (error) {
    // A network blip is cheap to retry. A timeout is not: the provider is slow,
    // and a second attempt would burn another full timeout out of the budget
    // that the next provider needs. So retry connection errors, not timeouts.
    const aborted = error && error.name === "AbortError";
    return {
      ok: false,
      kind: aborted ? "timeout" : "network",
      detail: aborted ? `timeout after ${timeoutMs}ms` : String((error && error.message) || error),
      retryable: !aborted,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Resolve an AI Gateway provider's base URL + key.
//
// Netlify injects a base URL + key pair per provider, but only for providers
// enabled on the project — today that is Anthropic only, so the Gemini and
// OpenAI entries below sit dormant and light up on their own if those providers
// are ever switched on. Note the generic NETLIFY_AI_GATEWAY_BASE_URL is NOT
// usable as a "<base>/<provider>" prefix: that shape 404s. The per-provider
// variables are the only working route.
function gatewayTarget(baseVar, keyVar) {
  const base = process.env[baseVar];
  const key = process.env[keyVar];
  if (!base || !key) return null;
  return { base: base.replace(/\/$/, ""), key };
}

async function callDeepSeek(prompt, timeoutMs) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return { text: "", skipped: "no DEEPSEEK_API_KEY" };

  const res = await postJson(
    "https://api.deepseek.com/chat/completions",
    { Authorization: `Bearer ${key}` },
    {
      model: DEEPSEEK_MODEL,
      max_tokens: 200,
      temperature: 1,
      // v4 reasons by default and spends the whole max_tokens budget on hidden
      // reasoning, returning content:"" with finish_reason:"length". A 20-30
      // character slogan needs no reasoning, so turn it off — that also keeps
      // the call around a second instead of three or four.
      thinking: { type: "disabled" },
      messages: [{ role: "user", content: prompt }],
    },
    timeoutMs,
  );
  if (!res.ok) return { text: "", kind: res.kind, detail: res.detail, retryable: res.retryable };
  return { text: cleanOutput(res.data?.choices?.[0]?.message?.content) };
}

async function callClaude(prompt, timeoutMs, model) {
  const target = gatewayTarget("ANTHROPIC_BASE_URL", "ANTHROPIC_API_KEY");
  if (!target) return { text: "", skipped: "no anthropic credentials" };

  const res = await postJson(
    `${target.base}/v1/messages`,
    { "x-api-key": target.key, "anthropic-version": "2023-06-01" },
    {
      model: model || CLAUDE_MODEL,
      max_tokens: 200,
      temperature: 1,
      messages: [{ role: "user", content: prompt }],
    },
    timeoutMs,
  );
  if (!res.ok) return { text: "", kind: res.kind, detail: res.detail, retryable: res.retryable };
  const blocks = res.data?.content;
  const text = Array.isArray(blocks)
    ? blocks.map((b) => (b && typeof b.text === "string" ? b.text : "")).join("")
    : "";
  return { text: cleanOutput(text) };
}

async function callGemini(prompt, timeoutMs) {
  const target = gatewayTarget("GOOGLE_GEMINI_BASE_URL", "GEMINI_API_KEY");
  if (!target) return { text: "", skipped: "no gemini credentials" };

  const res = await postJson(
    `${target.base}/v1beta/models/${GEMINI_MODEL}:generateContent`,
    { "x-goog-api-key": target.key },
    {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 1, maxOutputTokens: 200 },
    },
    timeoutMs,
  );
  if (!res.ok) return { text: "", kind: res.kind, detail: res.detail, retryable: res.retryable };
  const parts = res.data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => (p && typeof p.text === "string" ? p.text : "")).join("")
    : "";
  return { text: cleanOutput(text) };
}

async function callOpenAI(prompt, timeoutMs) {
  const target = gatewayTarget("OPENAI_BASE_URL", "OPENAI_API_KEY");
  if (!target) return { text: "", skipped: "no openai credentials" };

  const res = await postJson(
    `${target.base}/v1/chat/completions`,
    { Authorization: `Bearer ${target.key}` },
    {
      model: OPENAI_MODEL,
      max_tokens: 200,
      temperature: 1,
      messages: [{ role: "user", content: prompt }],
    },
    timeoutMs,
  );
  if (!res.ok) return { text: "", kind: res.kind, detail: res.detail, retryable: res.retryable };
  return { text: cleanOutput(res.data?.choices?.[0]?.message?.content) };
}

// Tried in order until one returns text in the right language. The first two are
// live on this project today; Gemini and OpenAI skip instantly (no credentials)
// and start participating by themselves if those providers get enabled. The
// second Claude model is a genuine extra life on the current setup: a different
// model draws on a different capacity pool, so a single model being wedged or
// rate-limited no longer empties the whole chain.
const PROVIDERS = [
  { name: "deepseek", call: callDeepSeek },
  { name: "claude", call: (p, t) => callClaude(p, t, CLAUDE_MODEL) },
  { name: "claude-backup", call: (p, t) => callClaude(p, t, CLAUDE_BACKUP_MODEL) },
  { name: "gemini", call: callGemini },
  { name: "openai", call: callOpenAI },
];

export default async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let prompt = "";
  let language = "";
  try {
    const body = await req.json();
    prompt = body && typeof body.prompt === "string" ? body.prompt : "";
    language = body && typeof body.language === "string" ? body.language : "";
  } catch {
    return Response.json({ result: "", reason: "bad request body" }, { status: 400 });
  }
  if (!prompt.trim()) {
    return Response.json({ result: "", reason: "empty prompt" }, { status: 400 });
  }

  const startedAt = Date.now();
  const timeLeft = () => TOTAL_BUDGET_MS - (Date.now() - startedAt);

  // Two traces of the same run. `trace` carries the providers' own error bodies
  // and stays in the server logs; `tried` is the short version handed back to
  // the browser, so a provider echoing something sensitive in an error body can
  // never ride along in the HTTP response.
  const trace = [];
  const tried = [];
  function note(label, detail) {
    trace.push(detail ? `${label} — ${detail}` : label);
    tried.push(label);
  }

  // Text that came back fine but in the wrong language. Kept as a last resort so
  // the browser gets *something* to validate rather than an empty response.
  let offLanguage = "";

  for (const provider of PROVIDERS) {
    if (timeLeft() <= 600) {
      note(`${provider.name}:out-of-time`);
      break;
    }
    if (isTripped(provider.name)) {
      note(`${provider.name}:cooling-down`);
      continue;
    }

    // Up to two attempts per provider, the second only for transient failures
    // and only when there is budget left for it.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const budget = Math.min(ATTEMPT_TIMEOUT_MS, Math.max(0, timeLeft() - 300));
      if (budget < 600) {
        note(`${provider.name}:out-of-time`);
        break;
      }

      const outcome = await provider.call(prompt, budget);

      if (outcome.skipped) {
        note(`${provider.name}:skipped`, outcome.skipped);
        break;
      }

      if (outcome.text) {
        if (outputMatchesLanguage(outcome.text, language)) {
          noteSuccess(provider.name);
          note(`${provider.name}:ok`);
          console.log(
            `[generate-trash-talk] ${provider.name} ok in ${Date.now() - startedAt}ms (${trace.join(" | ")})`,
          );
          return Response.json({ result: outcome.text, provider: provider.name, tried });
        }
        // Right shape, wrong language — remember it and let the next provider try.
        if (!offLanguage) offLanguage = outcome.text;
        note(`${provider.name}:wrong-language`);
        break;
      }

      const retrySuffix = attempt === 1 ? "" : "-retry";
      note(`${provider.name}:fail-${outcome.kind || "empty"}${retrySuffix}`, outcome.detail);
      noteFailure(provider.name);
      if (!outcome.retryable || attempt === 2) break;
      await sleep(RETRY_BACKOFF_MS);
    }
  }

  console.warn(
    `[generate-trash-talk] no language-matched result in ${Date.now() - startedAt}ms — ${trace.join(" | ")}`,
  );

  // Wrong-language text still beats nothing: the browser re-checks it and can
  // run its own strict-mode retry, which is a better outcome than "busy".
  return Response.json({
    result: offLanguage,
    provider: offLanguage ? "off-language" : "",
    tried,
  });
};

export const config = {
  path: "/api/generate-trash-talk",
};
