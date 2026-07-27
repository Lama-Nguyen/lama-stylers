'use strict'

const { withAuth, HttpsError, admin }  = require('./lib/withAuth')
const { checkAndConsumeRateLimit }     = require('./lib/rateLimits')
const { generateOutfitsWithAI }        = require('./lib/outfit/aiOrchestrator')
const { sanitizeText }                 = require('./lib/inputSanitizer')
const { logInfo, logWarn, logError }   = require('./lib/logger')
const { toNetlifyHandler }             = require('./lib/netlifyAdapter')
const { withTimeoutGuard }             = require('./lib/withTimeout')

const db = admin.firestore()

/**
 * Đọc isPremium từ Firestore thay vì Firebase Custom Claims.
 *
 * Lý do không dùng Custom Claims: app không set claims sau khi user upgrade,
 * và token cache 1 giờ nên sẽ delay sau khi Premium thay đổi trạng thái.
 * Firestore là nguồn sự thật duy nhất cho Premium status.
 */
async function readIsPremium(uid) {
  try {
    const snap = await db.collection('users').doc(uid).get()
    if (!snap.exists) return false
    const data   = snap.data()
    const expiry = data.premiumExpiry
    const expired = expiry?.toDate?.() instanceof Date && expiry.toDate() < new Date()
    return data.isPremium === true && !expired
  } catch (e) {
    logWarn('generateOutfits', uid, 'Không đọc được users doc, fallback Free', { error: e.message })
    return false
  }
}

const handler = withAuth(async (request) => {
  const { uid }                          = request.auth
  const { userId, userText, userApiKey } = request.data

  if (!userId || userId !== uid)
    throw new HttpsError('permission-denied', 'Không có quyền')

  const cleanText = sanitizeText(userText || '', 500)

  const [isPremium] = await Promise.all([
    readIsPremium(uid),
  ])

  // Consume trước khi gọi AI để tránh race condition (2 request song song vượt quota)
  const finalRateCheck = await checkAndConsumeRateLimit(uid, 'GENERATE_OUTFITS', isPremium)
  if (!finalRateCheck.allowed)
    throw new HttpsError('resource-exhausted',
      `Đã hết lượt tạo outfit hôm nay (${finalRateCheck.limit}/ngày). Lượt mới lúc nửa đêm (giờ VN).`)

  const itemsSnap = await db.collection('clothing_items')
    .where('userId', '==', userId)
    .where('deletedAt', '==', null)
    .get()

  if (itemsSnap.size < 2)
    throw new HttpsError('failed-precondition', 'Cần ít nhất 2 món quần áo để tạo outfit')

  const lockRef    = db.collection('generation_locks').doc(`${uid}_generateOutfits`)
  const lockResult = await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef)
    const now  = Date.now()
    if (snap.exists && snap.data().lockedUntil > now) return { acquired: false }
    tx.set(lockRef, { lockedUntil: now + 60_000, uid, createdAt: new Date() })
    return { acquired: true }
  })

  if (!lockResult.acquired)
    throw new HttpsError('already-exists', 'Đang có yêu cầu tạo outfit khác. Vui lòng chờ.')

  try {
    const items = itemsSnap.docs.map(d => ({ id: d.id, ...d.data() }))

    const outfits = await withTimeoutGuard(
      () => generateOutfitsWithAI(items, cleanText, {
        userApiKey: userApiKey || null,
        isPremium:  !!isPremium,
      }),
      8_500,
      'AI đang xử lý quá lâu. Vui lòng thử lại sau.'
    )

    if (!outfits || outfits.length === 0)
      throw new HttpsError('internal', 'AI không tạo được outfit nào. Thử lại sau.')

    const batch     = db.batch()
    const outfitIds = []
    for (const outfit of outfits) {
      const ref = db.collection('outfits').doc()
      batch.set(ref, {
        userId,
        ...outfit,
        createdAt:  admin.firestore.FieldValue.serverTimestamp(),
        isFavorite: false,
      })
      outfitIds.push(ref.id)
    }
    await batch.commit()

    logInfo('generateOutfits', uid, 'Generation completed', {
      count: outfitIds.length,
      isPremium,
    })

    return { outfits, outfitIds, count: outfitIds.length }

  } catch (e) {
    if (e instanceof HttpsError) throw e

    if (e.code === 'quota_exceeded' || e.message === 'quota_exceeded') {
      throw new HttpsError('resource-exhausted',
        'Hệ thống AI đang quá tải. Bạn có thể dùng Gemini API Key cá nhân trong phần Cài đặt để tiếp tục.'
      )
    }
    if (e.code === 'all_providers_failed' || e.message === 'all_providers_failed') {
      throw new HttpsError('unavailable',
        'Tất cả nhà cung cấp AI đều không phản hồi. Thử lại sau ít phút hoặc dùng API Key cá nhân.'
      )
    }
    if (e.code === 'deadline-exceeded') {
      throw new HttpsError('deadline-exceeded', e.message)
    }

    logError('generateOutfits', uid, 'Generation failed', { error: e.message, code: e.code })
    throw new HttpsError('internal', 'Không thể tạo outfit. Vui lòng thử lại.')
  } finally {
    await lockRef.delete().catch(() => {})
  }
})

exports.handler = toNetlifyHandler(handler)
