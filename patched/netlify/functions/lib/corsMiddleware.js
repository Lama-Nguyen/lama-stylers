'use strict'
const { ALLOWED_ORIGINS, SECURITY_HEADERS } = require('./constants')

function validateOrigin(origin) {
  if (!origin) return false
  return ALLOWED_ORIGINS.some(allowed => origin === allowed)
}

function withCORS(response, requestOrigin) {
  const origin = validateOrigin(requestOrigin) ? requestOrigin : (ALLOWED_ORIGINS[0] || '*')
  return {
    ...response,
    headers: {
      ...response.headers,
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS,
    },
  }
}

function handleOptions(event) {
  const origin = event.headers?.origin || event.headers?.referer || ''
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': validateOrigin(origin) ? origin : (ALLOWED_ORIGINS[0] || '*'),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
      ...SECURITY_HEADERS,
    },
    body: '',
  }
}

module.exports = { validateOrigin, withCORS, handleOptions }
