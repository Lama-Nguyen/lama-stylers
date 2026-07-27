'use strict'

const { withAuth, HttpsError } = require('./lib/withAuth')
const { checkRateLimitOnly } = require('./lib/rateLimits')

const vercelHandler = withAuth(async (request) => {

  const [analyzeStatus, outfitStatus] = await Promise.all([
    checkRateLimitOnly(request.auth.uid, 'ANALYZE_CLOTHING'),
    checkRateLimitOnly(request.auth.uid, 'GENERATE_OUTFITS'),
  ])

  return { analyzeClothing: analyzeStatus, generateOutfits: outfitStatus }
})

const { toNetlifyHandler } = require('./lib/netlifyAdapter')
exports.handler = toNetlifyHandler(vercelHandler)
