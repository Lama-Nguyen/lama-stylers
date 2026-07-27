'use strict'

function filterWardrobe(items, filters = {}) {
  let r = items
  if (filters.category)       r = r.filter(i => i.category === filters.category)
  if (filters.color)          r = r.filter(i => (i.color?.primary || i.color) === filters.color)
  if (filters.season)         r = r.filter(i => (i.season_suggestion || []).includes(filters.season))
  if (filters.occasion)       r = r.filter(i => (i.occasion_tags || []).includes(filters.occasion))
  if (filters.minVersatility) r = r.filter(i => (i.versatility_score || 0) >= filters.minVersatility)
  if (filters.excludeDeleted !== false) r = r.filter(i => !i.deletedAt)
  return r
}

function getWardrobeStats(items) {
  const active = items.filter(i => !i.deletedAt)
  return {
    total: active.length,
    byCategory: {
      tops: active.filter(i => i.category === 'tops').length,
      pants: active.filter(i => i.category === 'pants').length,
      shoes: active.filter(i => i.category === 'shoes').length,
      accessories: active.filter(i => i.category === 'accessories').length,
      headwear: active.filter(i => i.category === 'headwear').length,
    },
    avgVersatility: active.length
      ? active.reduce((s, i) => s + (i.versatility_score || 0), 0) / active.length
      : 0,
  }
}

module.exports = { filterWardrobe, getWardrobeStats }
