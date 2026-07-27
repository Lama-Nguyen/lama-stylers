'use strict'

const CATEGORIES = {
  TOPS:        'tops',
  PANTS:       'pants',
  FOOTWEAR:    'footwear',
  SHOES:       'shoes',
  ACCESSORIES: 'accessories',
  HEADWEAR:    'headwear',
}

const CLOTHING_TYPES = {
  TSHIRT: 'Áo thun', BUTTON_UP: 'Áo sơ mi', JACKET: 'Áo khoác',
  HOODIE: 'Áo hoodie', CARDIGAN: 'Áo len', TANK: 'Áo ba lỗ',
  POLO: 'Áo polo', BLAZER: 'Áo blazer', JEANS: 'Quần jeans',
  TROUSERS: 'Quần tây', SHORTS: 'Quần short', JOGGERS: 'Quần jogger',
  SKIRT: 'Váy', DRESS: 'Đầm', SNEAKERS: 'Giày thể thao',
  BOOTS: 'Giày cao cổ', FORMAL_SHOES: 'Giày lịch sự', SANDALS: 'Dép/Sandal',
  BELT: 'Dây lưng', BAG: 'Túi xách', SCARF: 'Khăn', HAT: 'Mũ', GLASSES: 'Kính',
}

const SEASONS = { SPRING: 'Xuân', SUMMER: 'Hè', AUTUMN: 'Thu', WINTER: 'Đông' }

const OCCASIONS = {
  OFFICE: 'Công sở', DATE: 'Hẹn hò', CASUAL: 'Dạo phố', SPORTS: 'Thể thao',
  BEACH: 'Đi biển', PARTY: 'Tiệc tối', HOME: 'Ở nhà', TRAVEL: 'Du lịch',
  FORMAL: 'Lễ tân', OTHER: 'Khác',
}

const FITS = { BOXY: 'boxy', REGULAR: 'regular', SLIM: 'slim', OVERSIZED: 'oversized', BAGGY: 'baggy' }

const PATTERNS = {
  SOLID: 'solid', STRIPES: 'stripes', PLAID: 'plaid',
  FLORAL: 'floral', GEOMETRIC: 'geometric', OTHER: 'other',
}

const STYLE_TAGS = {
  MINIMAL: 'minimal', CASUAL: 'casual', SMART_CASUAL: 'smart-casual',
  STREETWEAR: 'streetwear', PREPPY: 'preppy', WORKWEAR: 'workwear',
  TECHWEAR: 'techwear', VINTAGE: 'vintage', ATHLEISURE: 'athleisure',
  BOHEMIAN: 'bohemian', CLASSIC: 'classic',
}

const HARMONY_TYPES = {
  COMPLEMENTARY: 'complementary', ANALOGOUS: 'analogous',
  MONOCHROMATIC: 'monochromatic', NEUTRAL: 'neutral',
}

const JOB_STATUSES = {
  PENDING: 'pending', PROCESSING: 'processing',
  COMPLETED: 'completed', FAILED: 'failed',
}

const RATE_LIMITS = {
  GENERATE_OUTFITS:   { free: 5,  premium: 20 },
  ANALYZE_CLOTHING:   { free: 10, premium: 30 },
  REMOVE_BACKGROUND:  { free: 5,  premium: 20 },
}

const TIMEOUTS = {
  JOB_MAX:  5 * 60 * 1000,
  LOCK_TTL: 120 * 1000,
  DOWNLOAD: 30 * 1000,
}

const FILE_LIMITS = { IMAGE_MAX: 10 * 1024 * 1024 }

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean).length
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:8888']

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

const SOFT_DELETE_RETENTION_DAYS = 30
const VIETNAM_TZ = 'Asia/Ho_Chi_Minh'
const JOBS_COLLECTION = 'outfit_generation_jobs'
const JOB_TIMEOUT_MS = 5 * 60 * 1000

module.exports = {
  CATEGORIES, CLOTHING_TYPES, SEASONS, OCCASIONS, FITS,
  PATTERNS, STYLE_TAGS, HARMONY_TYPES, JOB_STATUSES,
  RATE_LIMITS, TIMEOUTS, FILE_LIMITS, ALLOWED_ORIGINS,
  SECURITY_HEADERS, SOFT_DELETE_RETENTION_DAYS, VIETNAM_TZ,
  JOBS_COLLECTION, JOB_TIMEOUT_MS,
}
