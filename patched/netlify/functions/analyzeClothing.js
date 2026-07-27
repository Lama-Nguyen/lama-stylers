'use strict'

const { withAuth, HttpsError }           = require('./lib/withAuth')
const { checkAndConsumeRateLimit }       = require('./lib/rateLimits')
const { buildAnalyzeClothingPrompt }     = require('./lib/aiPrompts')
const { callGeminiWithRetry }            = require('./lib/geminiService')
const { GoogleGenerativeAI }             = require('@google/generative-ai')
const { logInfo, logWarn, logError }     = require('./lib/logger')
const { withTimeoutGuard }               = require('./lib/withTimeout')

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
])

function detectMimeType(imageBase64) {
  if (typeof imageBase64 !== 'string') {
    return { mimeType: 'image/jpeg', isDetected: false }
  }
  const dataUriMatch = imageBase64.match(
    /^data:([a-zA-Z0-9][a-zA-Z0-9!#$&\-^_]+\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]+);base64,/
  )
  if (dataUriMatch) {
    const detected   = dataUriMatch[1].toLowerCase()
    const normalized = detected === 'image/jpg' ? 'image/jpeg' : detected
    if (SUPPORTED_MIME_TYPES.has(normalized)) return { mimeType: normalized, isDetected: true }
    return { mimeType: 'image/jpeg', isDetected: false }
  }
  return { mimeType: 'image/jpeg', isDetected: false }
}

const vercelHandler = withAuth(async (request) => {
  const { uid } = request.auth

  const rateCheck = await checkAndConsumeRateLimit(uid, 'ANALYZE_CLOTHING')
  if (!rateCheck.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Bạn đã dùng hết lượt phân tích ảnh hôm nay (${rateCheck.limit}/ngày). Lượt mới lúc 00:00 giờ VN nhé 🌙`
    )
  }

  const { imageBase64, userApiKey } = request.data
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    throw new HttpsError('invalid-argument', 'Thiếu imageBase64')
  }

  const apiKey = (typeof userApiKey === 'string' && userApiKey.trim().length > 10)
    ? userApiKey.trim()
    : process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new HttpsError('internal', 'Dịch vụ AI chưa sẵn sàng. Vui lòng thử lại sau.')
  }

  const { mimeType, isDetected } = detectMimeType(imageBase64)
  if (!isDetected) {
    logWarn('analyzeClothing', uid, 'MIME type không detect được, fallback image/jpeg', {
      prefix: imageBase64.substring(0, 30),
    })
  }

  const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64
  if (!base64Data || base64Data.length < 100) {
    throw new HttpsError('invalid-argument', 'Ảnh không hợp lệ hoặc quá nhỏ')
  }

  let analysis
  try {
    analysis = await withTimeoutGuard(
      async () => {
        const genAI  = new GoogleGenerativeAI(apiKey)
        const prompt = buildAnalyzeClothingPrompt()
        const imageData = { inlineData: { data: base64Data, mimeType } }

        function tryParseJSON(text) {
          const cleaned = text
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/, '')
            .replace(/```\s*$/, '')
            .trim()
          return JSON.parse(cleaned)
        }

        let rawText
        try {
          rawText = await callGeminiWithRetry(genAI, 'analyze_clothing', false, async (model) => {
            const result = await model.generateContent([prompt, imageData])
            return result.response.text()
          })
        } catch (e) {
          logError('analyzeClothing', uid, 'Gemini Vision error', { error: e.message, mimeType })
          throw new HttpsError('internal', 'Không thể phân tích ảnh. Vui lòng thử lại.')
        }

        try {
          return tryParseJSON(rawText)
        } catch (_) {
          logWarn('analyzeClothing', uid, 'JSON parse lần 1 thất bại, retry strict prompt')
          try {
            const retryText = await callGeminiWithRetry(genAI, 'analyze_clothing', false, async (model) => {
              const result = await model.generateContent([
                prompt + '\n\nIMPORTANT: Your ENTIRE response must be ONLY the raw JSON object. No markdown, no text before/after.',
                imageData,
              ])
              return result.response.text()
            })
            return tryParseJSON(retryText)
          } catch (e2) {
            logError('analyzeClothing', uid, 'JSON retry thất bại', { error: e2.message })
            throw new HttpsError('internal', 'AI trả về dữ liệu không hợp lệ. Thử lại hoặc dùng ảnh JPG/PNG.')
          }
        }
      },
      8_500,
      'Phân tích ảnh mất quá nhiều thời gian. Vui lòng thử lại với ảnh nhỏ hơn hoặc kết nối tốt hơn 📸'
    )
  } catch (e) {
    if (e.code === 'deadline-exceeded') throw new HttpsError('deadline-exceeded', e.message)
    throw e
  }

  const colorField     = analysis.color
  const colorPrimary   = typeof colorField === 'object'
    ? (colorField?.primary   || 'Không rõ')
    : (colorField            || 'Không rõ')
  const colorSecondary = typeof colorField === 'object'
    ? (colorField?.secondary || null)
    : null

  logInfo('analyzeClothing', uid, 'Phân tích thành công', {
    mimeType, type: analysis.type, category: analysis.category,
  })

  return {
    type:           analysis.type          || 'Không xác định',
    category:       analysis.category      || 'tops',
    fit:            analysis.fit           || 'Regular',
    custom_type:    analysis.custom_type   || null,
    display_name:   analysis.display_name  || analysis.type || 'Không xác định',
    color:          colorPrimary,
    secondaryColor: colorSecondary,
    pattern:        analysis.pattern       || 'Trơn',
    material:       analysis.material      || 'Không rõ',
    season_suggestion:  Array.isArray(analysis.season_suggestion)  ? analysis.season_suggestion  : [],
    season_flexibility: analysis.season_flexibility  || null,
    occasion_tags:      Array.isArray(analysis.occasion_tags)       ? analysis.occasion_tags       : [],
    occasion_primary:   analysis.occasion_primary    || null,
    description:        analysis.description         || null,
    versatility_score:  analysis.versatility_score   || null,
    confidence:         analysis.confidence          || 0.85,
  }
})

const { toNetlifyHandler } = require('./lib/netlifyAdapter')
exports.handler = toNetlifyHandler(vercelHandler)
