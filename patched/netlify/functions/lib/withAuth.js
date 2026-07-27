'use strict'

const admin = require('./firebaseAdmin')
const { logError, logWarn } = require('./logger')
const { ALLOWED_ORIGINS } = require('./constants')

class HttpsError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'HttpsError'
    this.code = code
  }
}

const CODE_TO_STATUS = {
  'invalid-argument': 400,
  'unauthenticated': 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'resource-exhausted': 429,
  'failed-precondition': 400,
  'internal': 500,
  'unavailable': 503,
  'deadline-exceeded': 504,
}

function withAuth(handler, { requireAuth = true } = {}) {
  return async (req, res) => {

    const requestOrigin = req.headers.origin || ''
    // Chỉ cho phép exact-match với ALLOWED_ORIGINS env var
    // Set ALLOWED_ORIGINS=https://lama-stylers.netlify.app (production domain)
    // Local dev đã có sẵn http://localhost:5173 và http://localhost:8888 trong constants.js
    const isAllowed = ALLOWED_ORIGINS.some((o) => requestOrigin === o)
    const corsOrigin = isAllowed ? requestOrigin : (ALLOWED_ORIGINS[0] || '')
    res.setHeader('Access-Control-Allow-Origin', corsOrigin)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      return res.status(204).end()
    }

    if (req.method !== 'POST') {
      return res.status(405).json({
        error: { code: 'invalid-argument', message: 'Method không được hỗ trợ, chỉ nhận POST' }
      })
    }

    let auth = null
    if (requireAuth) {
      const authHeader = req.headers.authorization || ''
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

      if (!token) {
        return res.status(401).json({
          error: { code: 'unauthenticated', message: 'Cần đăng nhập' }
        })
      }

      try {
        const decoded = await admin.auth().verifyIdToken(token)
        auth = { uid: decoded.uid, token: decoded }
      } catch (e) {

        console.error('verifyIdToken thất bại:', e.message)
        return res.status(401).json({
          error: { code: 'unauthenticated', message: 'Token không hợp lệ hoặc đã hết hạn, vui lòng đăng nhập lại' }
        })
      }
    }

    const request = { auth, data: req.body || {} }

    try {
      const result = await handler(request)
      return res.status(200).json(result)
    } catch (e) {
      if (e instanceof HttpsError) {
        const status = CODE_TO_STATUS[e.code] || 500
        return res.status(status).json({ error: { code: e.code, message: e.message } })
      }

      logError('withAuth', null, 'Unhandled error trong route', { error: e.message, stack: e.stack })
      return res.status(500).json({
        error: { code: 'internal', message: 'Đã có lỗi xảy ra, vui lòng thử lại sau.' }
      })
    }
  }
}

module.exports = { withAuth, HttpsError, admin }
