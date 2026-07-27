'use strict'

const { logInfo, logError } = require('./lib/logger')
const { withAuth, HttpsError, admin } = require('./lib/withAuth')
const { getVNDate } = require('./lib/dateUtils')
const { withTimeoutGuard } = require('./lib/withTimeout')

const db = admin.firestore()
const DAILY_LIMIT = 15

async function checkRateLimit(uid) {
  const today = getVNDate()
  const ref   = db.collection('rate_limits').doc(`${uid}_styleInsight_${today}`)
  const snap  = await ref.get()
  const count = snap.exists ? (snap.data().count || 0) : 0
  return { allowed: count < DAILY_LIMIT, count, limit: DAILY_LIMIT, ref, today }
}

async function consumeRateLimit(ref, today, uid) {
  return db.runTransaction(async (tx) => {
    const snap  = await tx.get(ref)
    const count = snap.exists ? (snap.data().count || 0) : 0
    if (count >= DAILY_LIMIT) return { allowed: false }
    tx.set(ref, {
      count: admin.firestore.FieldValue.increment(1),
      uid, date: today,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
    return { allowed: true }
  })
}

const vercelHandler = withAuth(async (request) => {
  const uid = request.auth.uid
  const { totalItems, types, colors, styleLabel, avgMatch, totalOutfits, userApiKey } = request.data

  if (!totalItems || totalItems === 0) {
    throw new HttpsError('invalid-argument', 'Tủ đồ trống, chưa có gì để phân tích')
  }

  const rateCheck = await checkRateLimit(uid)
  if (!rateCheck.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Bạn đã dùng hết ${rateCheck.limit} lượt phân tích phong cách hôm nay. Reset lúc 00:00 giờ VN 🌙`
    )
  }

  const apiKey = (typeof userApiKey === 'string' && userApiKey.trim().length > 10)
    ? userApiKey.trim()
    : process.env.GEMINI_API_KEY

  if (!apiKey) {
    throw new HttpsError('internal', 'Dịch vụ AI chưa sẵn sàng. Thử lại sau nhé.')
  }

  const prompt = `Bạn là chuyên gia thời trang AI cho app Lama Stylers (phong cách Việt Nam).
Phân tích tủ đồ sau và đưa ra nhận xét cá nhân hoá bằng tiếng Việt, thân thiện như người bạn thân:

Tủ đồ: ${JSON.stringify({ totalItems, types, colors, styleLabel, avgMatch, totalOutfits })}

Hãy viết 3-4 câu ngắn gọn, cụ thể (dùng "bạn", tránh quá formal).
Chỉ trả về đoạn nhận xét, không có heading hay bullet point.`

  let text
  try {
    text = await withTimeoutGuard(
      async () => {

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
          }),
        })
        if (!res.ok) {

          logError('generateStyleInsight', uid, 'Gemini API lỗi', { status: res.status })
          throw new Error(`Gemini API lỗi ${res.status}`)
        }
        const data = await res.json()
        const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
        if (!result) throw new Error('Gemini trả về rỗng')
        return result
      },
      8_500,
      'Phân tích phong cách mất quá nhiều thời gian. Vui lòng thử lại sau nhé!'
    )
  } catch (e) {
    if (e.code === 'deadline-exceeded') throw new HttpsError('deadline-exceeded', e.message)
    logError('generateStyleInsight', uid, 'Unexpected error', { error: e.message })
    throw new HttpsError('internal', 'Không thể phân tích phong cách lúc này. Thử lại sau nhé!')
  }

  let consumeResult
  try {
    consumeResult = await consumeRateLimit(rateCheck.ref, rateCheck.today, uid)
  } catch (e) {
    console.warn('[generateStyleInsight] consumeRateLimit thất bại:', e.message)
    consumeResult = { allowed: true }
  }

  if (!consumeResult.allowed) {
    throw new HttpsError(
      'resource-exhausted',
      `Đã đạt giới hạn ${DAILY_LIMIT} lượt phân tích hôm nay (có yêu cầu khác vừa dùng hết quota)`
    )
  }

  logInfo('generateStyleInsight', uid, 'Phân tích thành công')
  return { insight: text }
})

const { toNetlifyHandler } = require('./lib/netlifyAdapter')
exports.handler = toNetlifyHandler(vercelHandler)
