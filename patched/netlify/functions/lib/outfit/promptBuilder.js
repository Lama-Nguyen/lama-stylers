'use strict'
const { buildGenerateOutfitsPrompt } = require('../aiPrompts')

function filterItemsByContext(items, context = {}) {
  let f = items
  if (context.season)   f = f.filter(i => (i.season_suggestion || []).includes(context.season))
  if (context.occasion) f = f.filter(i => (i.occasion_tags || []).includes(context.occasion))
  return f
}

async function buildOutfitPrompt(items, userText, context = {}) {
  const filtered = filterItemsByContext(items, context)
  if (filtered.length < 2) throw new Error('Insufficient items after filtering')
  return buildGenerateOutfitsPrompt(filtered, userText)
}

module.exports = { buildOutfitPrompt, filterItemsByContext }
