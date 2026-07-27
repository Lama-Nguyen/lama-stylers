const GEMINI_MODELS = {
  FLASH_2_5:       'gemini-2.5-flash',
  FLASH_1_5:       'gemini-1.5-flash',
  FLASH_LITE_2_0:  'gemini-2.0-flash-lite',
}

const GEMINI_CONFIGS = {
  analyze_clothing: {
    free:    GEMINI_MODELS.FLASH_LITE_2_0,
    premium: GEMINI_MODELS.FLASH_2_5,
    fallback: GEMINI_MODELS.FLASH_1_5,
    max_tokens: 500,
    temperature: 0.1,
  },

  generate_outfit: {
    free:    GEMINI_MODELS.FLASH_1_5,
    premium: GEMINI_MODELS.FLASH_2_5,
    fallback: GEMINI_MODELS.FLASH_1_5,
    max_tokens: 1500,
    temperature: 0.7,
  },

  havy_chat: {
    free:    GEMINI_MODELS.FLASH_1_5,
    premium: GEMINI_MODELS.FLASH_2_5,
    fallback: GEMINI_MODELS.FLASH_1_5,
    max_tokens: 400,
    temperature: 0.8,
  },

  style_insight: {
    free:    GEMINI_MODELS.FLASH_1_5,
    premium: GEMINI_MODELS.FLASH_2_5,
    fallback: GEMINI_MODELS.FLASH_1_5,
    max_tokens: 800,
    temperature: 0.6,
  },
}

function getModelConfig(useCase, isPremium = false, useFallback = false) {
  const config = GEMINI_CONFIGS[useCase] ?? GEMINI_CONFIGS.havy_chat
  const tier = useFallback ? 'fallback' : (isPremium ? 'premium' : 'free')
  const model = config[tier]

  return {
    model,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    tier,
  }
}

async function callGeminiWithRetry(genAI, useCase, isPremium, fn) {
  let lastError

  try {
    const { model, ...config } = getModelConfig(useCase, isPremium, false)
    const generativeModel = genAI.getGenerativeModel({ model })
    return await fn(generativeModel, config)
  } catch (e) {
    lastError = e
    console.warn(`[Gemini] ${useCase} (main model ${getModelConfig(useCase, isPremium, false).model}): ${e.message}`)
  }

  try {
    const { model, ...config } = getModelConfig(useCase, isPremium, true)
    console.log(`[Gemini] Retrying with fallback: ${model}`)
    const generativeModel = genAI.getGenerativeModel({ model })
    return await fn(generativeModel, config)
  } catch (e) {
    console.error(`[Gemini] ${useCase} (fallback ${getModelConfig(useCase, isPremium, true).model}): ${e.message}`)
    throw lastError
  }
}

function cleanGeminiResponse(text) {
  return (text || '')
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

module.exports = {
  GEMINI_MODELS,
  GEMINI_CONFIGS,
  getModelConfig,
  callGeminiWithRetry,
  cleanGeminiResponse,
}
