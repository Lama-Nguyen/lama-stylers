'use strict'
const { logError, logInfo } = require('./lib/logger')

const { withAuth, HttpsError, admin } = require('./lib/withAuth')

const db = admin.firestore()
const BATCH_LIMIT = 500

async function deleteAllMatching(query) {
  const snap = await query.get()
  let deleted = 0
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const chunk = snap.docs.slice(i, i + BATCH_LIMIT)
    const batch = db.batch()
    chunk.forEach(d => batch.delete(d.ref))
    await batch.commit()
    deleted += chunk.length
  }
  return deleted
}

const vercelHandler = withAuth(async (request) => {
  const uid = request.auth.uid

  let rateLimitsDeleted = 0
  let locksDeleted = 0

  try {
    rateLimitsDeleted = await deleteAllMatching(
      db.collection('rate_limits').where('uid', '==', uid)
    )
  } catch (e) {
    console.error(`deleteAccountData: lỗi xoá rate_limits cho ${uid}:`, e.message)
  }

  try {
    locksDeleted = await deleteAllMatching(
      db.collection('generation_locks').where('uid', '==', uid)
    )
  } catch (e) {
    console.error(`deleteAccountData: lỗi xoá generation_locks cho ${uid}:`, e.message)
  }

  logInfo('deleteAccountData', uid,
    `deleteAccountData: đã dọn ${rateLimitsDeleted} rate_limits + ${locksDeleted} generation_locks cho user ${uid}`
  )

  return { success: true, rateLimitsDeleted, locksDeleted }
})

const { toNetlifyHandler } = require('./lib/netlifyAdapter')
exports.handler = toNetlifyHandler(vercelHandler)
