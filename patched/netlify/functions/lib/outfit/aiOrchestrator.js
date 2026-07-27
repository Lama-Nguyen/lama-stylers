'use strict'
const { runOutfitProviderChain } = require('../aiProviderChain')
const { computeOutfitOccasion, computeOutfitSeason } = require('./resultParser')

async function generateOutfitsWithAI(items, userText, context = {}) {
  const {
    userApiKey,
    isPremium,
    likedOutfits = [],
    recentOutfitSummaries = [],
  } = context

  const outfits = await runOutfitProviderChain({
    items,
    userText,
    bodyInfo: context.bodyInfo || 'Không có số đo',
    isPremium,
    userApiKey,
    likedOutfits,
    recentOutfitSummaries,
  })

  return outfits.map(outfit => {
    const outfitItems = (outfit.items || [])
      .map(id => items.find(i => i.id === id))
      .filter(Boolean)
    return {
      ...outfit,
      occasion:           computeOutfitOccasion(outfitItems),
      recommended_season: computeOutfitSeason(outfitItems),
    }
  })
}

module.exports = { generateOutfitsWithAI }
