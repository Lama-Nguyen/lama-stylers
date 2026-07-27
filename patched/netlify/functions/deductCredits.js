'use strict'

/**
 * deductCredits — Trừ credit khi dùng tính năng (generate outfit, remove background, v.v.)
 *
 * POST /api/deductCredits { amount: number, reason: string }
 * - Kiểm tra số dư trước khi trừ (atomic transaction)
 * - Trả về { success: true, remaining } hoặc { success: false, reason: 'insufficient' }
 */

const { withAuth, HttpsError, admin } = require('./lib/withAuth')
const { toNetlifyHandler }            = require('./lib/netlifyAdapter')
const { logInfo, logWarn }            = require('./lib/logger')

const db = admin.firestore()

const MAX_DEDUCT = 50  // sanity cap per single call

const handler = withAuth(async (request) => {
  const { uid }  = request.auth
  const body     = request.data || {}
  const amount   = Number(body.amount)
  const reason   = String(body.reason || 'unknown').slice(0, 50)

  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_DEDUCT)
    throw new HttpsError('invalid-argument', `amount phải là số nguyên 1–${MAX_DEDUCT}`)

  const userRef = db.collection('users').doc(uid)

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef)
    if (!snap.exists) throw new HttpsError('not-found', 'User không tồn tại')

    const current = snap.data().credits ?? 0
    if (current < amount) return { success: false, reason: 'insufficient', current }

    tx.update(userRef, { credits: admin.firestore.FieldValue.increment(-amount) })
    return { success: true, remaining: current - amount }
  })

  if (result.success) {
    logInfo('deductCredits', uid, `Trừ ${amount} credit (${reason})`, { remaining: result.remaining })
  } else {
    logWarn('deductCredits', uid, 'Không đủ credit', { needed: amount, current: result.current })
  }

  return result
})

exports.handler = toNetlifyHandler(handler)
