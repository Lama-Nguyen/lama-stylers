'use strict'

let _sentry = null
function getSentry() {
  if (!_sentry) {
    try { _sentry = require('./sentry') } catch (_) { _sentry = { captureAIError: () => {} } }
  }
  return _sentry
}

const FREE_PROVIDERS = [
  { name: 'gemini-flash',        envKey: 'GEMINI_API_KEY',     call: callGeminiFlash        },
  { name: 'mistral-medium-3.5',  envKey: 'XTROUTER_API_KEY',   call: callMistralMedium      },
  { name: 'openrouter-nemotron', envKey: 'OPENROUTER_API_KEY', call: callOpenRouterNemotron },
  { name: 'openrouter-llama',    envKey: 'OPENROUTER_API_KEY', call: callOpenRouter         },
]

const PREMIUM_SERVER_PROVIDERS = [
  { name: 'gemini-pro',         envKey: 'GEMINI_PRO_API_KEY', call: callGeminiPro    },
  { name: 'mistral-large-3',    envKey: 'XTROUTER_API_KEY',   call: callMistralLarge },
  { name: 'mistral-medium-3.5', envKey: 'XTROUTER_API_KEY',   call: callMistralMedium },
]

const ERR_QUOTA    = 'quota_exceeded'
const ERR_ALL_FAIL = 'all_providers_failed'

const MAX_USER_TEXT_CHARS_IN_PROMPT = 500

function buildPrompt({ items, bodyInfo, userText, likedOutfits = [], recentOutfitSummaries = [] }) {
  const safeUserText = userText
    ? String(userText).slice(0, MAX_USER_TEXT_CHARS_IN_PROMPT)
    : userText

  const footwearItems = items.filter(i => i.category === 'footwear')
  const clothingItems = items.filter(i => i.category !== 'footwear')

  const formatItem = (i) => {
    const parts = [`ID: ${i.id}`, `Loại: ${i.type}`]
    if (i.sub_type) parts.push(`Kiểu: ${i.sub_type}`)
    if (i.name)     parts.push(`Tên: ${i.name}`)
    if (i.color)    parts.push(`Màu: ${i.color}`)
    if (i.pattern)  parts.push(`Họa tiết: ${i.pattern}`)
    if (i.material) parts.push(`Chất liệu: ${i.material}`)
    if (i.fit)      parts.push(`Form: ${i.fit}`)
    return `- ${parts.join(' | ')}`
  }

  const clothingBlock = clothingItems.map(formatItem).join('\n')
  const footwearBlock = footwearItems.length > 0
    ? `\nGIÀY/DÉP (${footwearItems.length} đôi):\n${footwearItems.map(formatItem).join('\n')}\n`
    : ''

  const userTextBlock = safeUserText ? `\nYÊU CẦU THÊM:\n${safeUserText}\n` : ''

  const fewShotBlock = likedOutfits.length > 0
    ? `\nOUTFIT ĐƯỢC USER YÊU THÍCH (học PHONG CÁCH, KHÔNG sao chép y hệt bộ items):\n${
        likedOutfits.slice(0, 3).map((o, i) =>
          `${i + 1}. "${o.routeName || 'Outfit'}" — ${o.description || ''} [items: ${(o.items || o.itemIds || []).join(', ')}]`
        ).join('\n')
      }\n`
    : ''

  const avoidBlock = recentOutfitSummaries.length > 0
    ? `\nOUTFIT ĐÃ TẠO GẦN ĐÂY (TUYỆT ĐỐI KHÔNG dùng cùng bộ items):\n${
        recentOutfitSummaries.slice(0, 10).map((o, i) =>
          `${i + 1}. "${o.routeName}": [${(o.items || []).join(', ')}]`
        ).join('\n')
      }\n`
    : ''

  const hasMeasurements = bodyInfo && /\d/.test(bodyInfo)
  const measurementInstruction = hasMeasurements
    ? `5. Số đo cơ thể ĐÃ CÓ → PHẢI thêm gợi ý điều chỉnh cụ thể theo cm trong description`
    : `5. Nếu có thể, gợi ý điều chỉnh fit phù hợp với vóc dáng`

  return `Bạn là stylist AI chuyên nghiệp người Việt Nam. Tạo đúng 3 outfit từ tủ đồ dưới đây.

SỐ ĐO CƠ THỂ:
${bodyInfo}
${userTextBlock}${fewShotBlock}${avoidBlock}
QUẦN ÁO (${clothingItems.length} món):
${clothingBlock}
${footwearBlock}
YÊU CẦU BẮT BUỘC:
1. Mỗi outfit: 2-4 món QUẦN ÁO + tối đa 1 đôi GIÀY/DÉP (nếu phù hợp)
2. Tên phong cách ngắn gọn tiếng Việt (VD: "Công sở thanh lịch", "Date night tối giản")
3. Mô tả 1-2 câu, NÊU RÕ lý do phối (màu sắc, tỉ lệ, dịp)
4. 3 outfit phải KHÁC NHAU về phong cách
${measurementInstruction}
6. KHÔNG dùng bộ items nào trùng với "OUTFIT ĐÃ TẠO GẦN ĐÂY"
7. Điểm 0-100 cho: color, proportion, material, style

TRẢ VỀ JSON THUẦN (không markdown, không backtick, không text ngoài JSON):
[
  {
    "items": ["itemId1", "itemId2"],
    "routeName": "Tên phong cách",
    "description": "Mô tả + gợi ý điều chỉnh cm nếu có số đo",
    "scores": {"color": 85, "proportion": 80, "material": 75, "style": 88}
  }
]`
}

function buildEnhancePrompt({ type, color, pattern, material, fit }) {
  return `Bạn là chuyên gia thời trang. Dựa trên thông tin:
- Loại: ${type}
- Màu: ${color}
- Họa tiết: ${pattern}
- Chất liệu: ${material}
- Form dáng: ${fit}

Hãy bổ sung chi tiết.

TRẢ VỀ JSON THUẦN (không markdown, không backtick):
{
  "highlights": "Điểm nhấn thiết kế",
  "style":      "Phong cách phù hợp",
  "occasion":   "Dịp phù hợp",
  "season":     "Mùa phù hợp",
  "tags":       ["tag1", "tag2", "tag3"]
}`
}

function parseJson(rawText) {
  const clean = rawText.replace(/```json|```/g, '').trim()
  return JSON.parse(clean)
}

function parseOutfitJson(rawText) {
  const parsed = parseJson(rawText)
  if (!Array.isArray(parsed) || parsed.length === 0)
    throw new Error('Response không phải mảng outfit hợp lệ')
  return parsed
}

const GEMINI_OUTPUT_TOKENS = 1500

async function callGeminiFlash(prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { maxOutputTokens: GEMINI_OUTPUT_TOKENS },
  })
  const result = await model.generateContent(prompt)
  return parseOutfitJson(result.response.text().trim())
}

async function callGeminiPro(prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_PRO_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: { maxOutputTokens: GEMINI_OUTPUT_TOKENS },
  })
  const result = await model.generateContent(prompt)
  return parseOutfitJson(result.response.text().trim())
}

async function callWithUserKey(userApiKey, prompt) {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(userApiKey)
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    generationConfig: { maxOutputTokens: GEMINI_OUTPUT_TOKENS },
  })
  const result = await model.generateContent(prompt)
  return parseOutfitJson(result.response.text().trim())
}

async function callGeminiRaw(apiKey, prompt, modelName = 'gemini-1.5-flash') {
  const { GoogleGenerativeAI } = require('@google/generative-ai')
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { maxOutputTokens: 800 },
  })
  const result = await model.generateContent(prompt)
  return result.response.text().trim()
}

async function callOpenRouterNemotron(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lama-stylers.web.app',
      'X-Title': 'Lama Stylers',
    },
    body: JSON.stringify({
      model: 'nvidia/llama-3.1-nemotron-nano-vl-1b-v2',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
    }),
  })
  if (!response.ok) {
    if (response.status === 429) throw Object.assign(new Error('quota'), { code: ERR_QUOTA })
    throw new Error(`OpenRouter NemotronVL lỗi ${response.status}`)
  }
  const data = await response.json()
  return parseOutfitJson(data?.choices?.[0]?.message?.content || '')
}

async function callOpenRouterContentSafety(text) {
  if (!process.env.OPENROUTER_API_KEY) return { safe: true, skipped: true }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://lama-stylers.web.app',
        'X-Title': 'Lama Stylers',
      },
      body: JSON.stringify({
        model: 'nvidia/nemotron-3.5-content-safety',
        messages: [{ role: 'user', content: text }],
        max_tokens: 100,
      }),
    })
    if (!response.ok) {
      console.warn('Content Safety API lỗi, bỏ qua kiểm duyệt:', response.status)
      return { safe: true, skipped: true }
    }
    const data = await response.json()
    const raw  = (data?.choices?.[0]?.message?.content || '').toLowerCase()
    let safe = true, categories = [], reason = raw
    try {
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      safe = parsed.safe !== false && !parsed.unsafe
      categories = parsed.categories || parsed.violated_categories || []
      reason = parsed.reason || parsed.explanation || raw
    } catch {
      safe = !raw.includes('unsafe') && !raw.includes('harmful') && !raw.includes('violat')
    }
    return { safe, categories, reason }
  } catch (e) {
    console.warn('Content Safety exception, bỏ qua kiểm duyệt:', e.message)
    return { safe: true, skipped: true }
  }
}

async function callOpenRouter(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://lama-stylers.web.app',
      'X-Title': 'Lama Stylers',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
    }),
  })
  if (!response.ok) {
    if (response.status === 429) throw Object.assign(new Error('quota'), { code: ERR_QUOTA })
    throw new Error(`OpenRouter lỗi ${response.status}`)
  }
  const data = await response.json()
  return parseOutfitJson(data?.choices?.[0]?.message?.content || '')
}

async function callXtRouter(prompt, model) {
  const response = await fetch('https://api.xkiro.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.XTROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.7,
    }),
  })
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    if (response.status === 429) throw Object.assign(new Error('quota'), { code: ERR_QUOTA })
    if (response.status === 401 || response.status === 403)
      throw Object.assign(new Error(`XTROUTER_API_KEY không hợp lệ (${response.status})`), { code: 'auth_error' })
    throw new Error(`xkiro ${model} lỗi ${response.status}: ${body.slice(0, 120)}`)
  }
  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content || ''
  if (!text) throw new Error(`xkiro ${model}: response rỗng`)
  return parseOutfitJson(text)
}

async function callMistralMedium(prompt) { return callXtRouter(prompt, 'mistralai/mistral-medium-3.5') }
async function callMistralLarge(prompt)  { return callXtRouter(prompt, 'mistralai/mistral-large-2512') }

async function tryProviderList(providers, prompt) {
  const attempted = []
  let quotaHit = false
  for (const provider of providers) {
    if (!process.env[provider.envKey]) {
      attempted.push({ provider: provider.name, status: 'skipped_no_key' })
      continue
    }
    try {
      const outfits = await provider.call(prompt)
      attempted.push({ provider: provider.name, status: 'success' })
      return { outfits, providerUsed: provider.name, attempted, quotaHit }
    } catch (e) {
      console.error(`Provider ${provider.name} thất bại:`, e.message)
      if (e.code === ERR_QUOTA) quotaHit = true
      getSentry().captureAIError(provider.name, e, prompt.length)
      attempted.push({ provider: provider.name, status: 'failed', error: e.message })
    }
  }
  return { outfits: null, providerUsed: null, attempted, quotaHit }
}

async function runOutfitProviderChain({ isPremium, userApiKey, items, bodyInfo, userText, likedOutfits = [], recentOutfitSummaries = [] }) {
  if (userText) {
    const safety = await callOpenRouterContentSafety(userText)
    if (!safety.safe) {
      const err = new Error('Yêu cầu chứa nội dung không phù hợp')
      err.code = 'content_unsafe'
      err.categories = safety.categories
      throw err
    }
  }

  const prompt      = buildPrompt({ items, bodyInfo, userText, likedOutfits, recentOutfitSummaries })
  const allAttempts = []
  let anyQuotaHit   = false

  if (isPremium) {
    if (userApiKey) {
      try {
        const outfits = await callWithUserKey(userApiKey, prompt)
        allAttempts.push({ provider: 'user-key:gemini', status: 'success' })
        return { outfits, providerUsed: 'user-key:gemini', tier: 'user_key', attempted: allAttempts }
      } catch (e) {
        console.error('Key cá nhân user thất bại:', e.message)
        allAttempts.push({ provider: 'user-key:gemini', status: 'failed', error: e.message })
      }
    }
    const premiumResult = await tryProviderList(PREMIUM_SERVER_PROVIDERS, prompt)
    allAttempts.push(...premiumResult.attempted)
    if (premiumResult.quotaHit) anyQuotaHit = true
    if (premiumResult.outfits)
      return { outfits: premiumResult.outfits, providerUsed: premiumResult.providerUsed, tier: 'premium', attempted: allAttempts }

    const freeResult = await tryProviderList(FREE_PROVIDERS, prompt)
    allAttempts.push(...freeResult.attempted)
    if (freeResult.quotaHit) anyQuotaHit = true
    if (freeResult.outfits)
      return { outfits: freeResult.outfits, providerUsed: freeResult.providerUsed, tier: 'free_fallback', attempted: allAttempts }

    const errCode = anyQuotaHit ? ERR_QUOTA : ERR_ALL_FAIL
    const err = new Error(errCode)
    err.code = errCode; err.attempted = allAttempts
    throw err
  }

  const freeResult = await tryProviderList(FREE_PROVIDERS, prompt)
  allAttempts.push(...freeResult.attempted)
  if (freeResult.outfits)
    return { outfits: freeResult.outfits, providerUsed: freeResult.providerUsed, tier: 'free', attempted: allAttempts }

  const errCode = freeResult.quotaHit ? ERR_QUOTA : ERR_ALL_FAIL
  const err = new Error(errCode)
  err.code = errCode; err.attempted = allAttempts
  throw err
}

async function runHavyProviderChain({ systemPrompt, history = [], userMessage }) {
  const safety = await callOpenRouterContentSafety(userMessage)
  if (!safety.safe) {
    const err = new Error('Câu hỏi chứa nội dung không phù hợp')
    err.code = 'content_unsafe'; err.categories = safety.categories
    throw err
  }

  const contents = [
    ...history.filter(m => m.role !== 'system').slice(-10).map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  const providers = [
    {
      name: 'gemini-flash', envKey: 'GEMINI_API_KEY',
      call: async () => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: systemPrompt }] },
              contents,
              generationConfig: { maxOutputTokens: 400, temperature: 0.8 },
            }),
          }
        )
        if (!res.ok) {
          if (res.status === 429) throw Object.assign(new Error('Gemini quota exceeded'), { code: 'gemini_quota' })
          throw new Error(`Gemini API lỗi ${res.status}`)
        }
        const data = await res.json()
        return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
      },
    },
    {
      name: 'openrouter-nemotron', envKey: 'OPENROUTER_API_KEY',
      call: async () => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lama-stylers.web.app',
            'X-Title': 'Lama Stylers',
          },
          body: JSON.stringify({
            model: 'nvidia/llama-3.1-nemotron-nano-vl-1b-v2',
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.filter(m => m.role !== 'system').slice(-10).map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content,
              })),
              { role: 'user', content: userMessage },
            ],
            max_tokens: 400,
          }),
        })
        if (!res.ok) throw new Error(`OpenRouter NemotronVL ${res.status}`)
        const d = await res.json()
        return d?.choices?.[0]?.message?.content || ''
      },
    },
    {
      name: 'openrouter-llama', envKey: 'OPENROUTER_API_KEY',
      call: async () => {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lama-stylers.web.app',
            'X-Title': 'Lama Stylers',
          },
          body: JSON.stringify({
            model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
            messages: [
              { role: 'system', content: systemPrompt },
              ...history.filter(m => m.role !== 'system').slice(-10).map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content,
              })),
              { role: 'user', content: userMessage },
            ],
            max_tokens: 400,
          }),
        })
        if (!res.ok) throw new Error(`OpenRouter Llama ${res.status}`)
        const d = await res.json()
        return d?.choices?.[0]?.message?.content || ''
      },
    },
  ]

  const attempted = []
  for (const p of providers) {
    if (!process.env[p.envKey]) {
      attempted.push({ provider: p.name, status: 'skipped_no_key' })
      continue
    }
    try {
      const raw = await p.call()
      attempted.push({ provider: p.name, status: 'success' })
      return { raw, providerUsed: p.name, attempted }
    } catch (e) {
      console.error(`Havy provider ${p.name} thất bại:`, e.message)
      attempted.push({ provider: p.name, status: 'failed', error: e.message })
    }
  }

  const err = new Error(ERR_ALL_FAIL)
  err.code = ERR_ALL_FAIL; err.attempted = attempted
  throw err
}

async function runEnhanceProviderChain({ type, color, pattern, material, fit, userApiKey }) {
  const prompt = buildEnhancePrompt({ type, color, pattern, material, fit })
  if (userApiKey) {
    try {
      const raw = await callGeminiRaw(userApiKey, prompt)
      return { raw, providerUsed: 'user-key' }
    } catch (e) {
      console.error('Enhance: user key thất bại:', e.message)
    }
  }
  if (process.env.GEMINI_API_KEY) {
    const raw = await callGeminiRaw(process.env.GEMINI_API_KEY, prompt)
    return { raw, providerUsed: 'gemini-flash' }
  }
  throw new Error(ERR_ALL_FAIL)
}

module.exports = {
  runOutfitProviderChain,
  runHavyProviderChain,
  runEnhanceProviderChain,
  callOpenRouterContentSafety,
  buildPrompt,
  parseJson,
  parseOutfitJson,
  ERR_QUOTA,
  ERR_ALL_FAIL,
}
