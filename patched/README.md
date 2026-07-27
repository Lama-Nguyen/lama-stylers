# 👗 Lama Stylers v2.1.0

> **Tủ đồ thông minh AI** — Phân tích quần áo, phối outfit, tư vấn thời trang cùng companion Hạ Vy.

[![Netlify Status](https://api.netlify.com/api/v1/badges/YOUR_BADGE_ID/deploy-status)](https://app.netlify.com/sites/YOUR_SITE/deploys)

---

## ✨ Tính năng

| Tính năng | Mô tả |
|---|---|
| 📸 **Phân tích quần áo** | Upload ảnh → AI nhận diện loại, màu, chất liệu, phong cách |
| 👗 **Phối outfit AI** | Two-Stage selection + Diversity scoring → 3 outfit/lần |
| 💬 **Hạ Vy Companion** | Chatbot thời trang cá nhân, hỗ trợ tiếng Việt |
| 🎁 **Gift Code** | Kích hoạt Premium qua code (timed / lifetime) |
| 📦 **Offline Cache** | Xem tủ đồ + outfit khi mất mạng (Dexie IndexedDB) |
| 🌙 **Dark mode** | Giao diện tối mặc định, thân thiện màn hình mobile |
| 💳 **Thanh toán SePay** | Webhook idempotent, QR code realtime |

---

## 🏗 Tech Stack

```
Frontend          React 18 + Vite + PWA
Auth & DB         Firebase Auth + Firestore + Storage
Backend           Netlify Functions (Node 18, esbuild)
AI Models         Gemini Flash/Pro · Mistral Medium 3.5 · Mistral Large 3
                  OpenRouter (Nemotron, Llama) · Replicate
Image CDN         Cloudinary (auto-compress, background removal)
Payment           SePay webhook
```

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/lama-stylers.git
cd lama-stylers
npm install
```

### 2. Tạo `.env.local`

```bash
cp .env.local.example .env.local
# Điền các giá trị Firebase + API keys vào .env.local
```

Xem [`.env.local.example`](.env.local.example) để biết danh sách đầy đủ.

### 3. Chạy local (Netlify dev)

```bash
npm install -g netlify-cli
netlify dev
```

App chạy tại `http://localhost:8888`. Netlify Functions được serve tự động.

---

## 🌐 Deploy lên Netlify

Xem hướng dẫn chi tiết: **[DEPLOY.md](DEPLOY.md)** hoặc **[DEPLOY_BEGINNER.md](DEPLOY_BEGINNER.md)** (dành cho người mới).

**Nhanh (CLI):**
```bash
netlify link       # kết nối repo với Netlify site
netlify deploy --prod
```

**Tự động (GitHub Actions):**  
Mỗi push lên `main` sẽ trigger workflow `.github/workflows/deploy.yml`.

---

## 🔑 Environment Variables

Cần set các biến sau trên **Netlify Dashboard → Site Settings → Environment Variables**:

### Firebase (bắt buộc)
```
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

### AI Providers
```
GEMINI_API_KEY          # Free tier — bắt buộc
XTROUTER_API_KEY        # Mistral Medium 3.5 + Large 3 (xkiro.com)
OPENROUTER_API_KEY      # Nemotron + Content Safety
GEMINI_PRO_API_KEY      # Premium tier
REPLICATE_API_KEY       # Premium fallback
```

### App
```
VITE_NETLIFY_API_BASE   # URL Netlify functions (vd: https://your-site.netlify.app)
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
SEPAY_API_KEY
GIFT_CODES_JSON         # {"code1":{"label":"...","type":"timed","days":3,"credits":999999}}
```

---

## 🧠 AI Provider Chain

### Free tier (theo thứ tự fallback)
1. **Gemini 1.5 Flash** — `GEMINI_API_KEY`
2. **Mistral Medium 3.5** — `XTROUTER_API_KEY` (xkiro)
3. **NVIDIA Nemotron VL** — `OPENROUTER_API_KEY`
4. **Llama 3.2 11B Vision** — `OPENROUTER_API_KEY`

### Premium tier
1. **Gemini 1.5 Pro** — `GEMINI_PRO_API_KEY`
2. **Mistral Large 3** — `XTROUTER_API_KEY` (xkiro)
3. **Mistral Medium 3.5** — `XTROUTER_API_KEY` (fallback)
4. **Replicate Llama** — `REPLICATE_API_KEY`

---

## 📁 Cấu trúc dự án

```
lama-stylers/
├── src/
│   ├── components/        # React components
│   ├── pages/             # Route pages
│   ├── services/          # Firebase, API calls, cache
│   ├── hooks/             # Custom React hooks
│   └── lib/               # Type mappings, utilities
├── netlify/
│   └── functions/         # Netlify serverless functions
│       └── lib/           # Shared backend utilities
├── firebase-functions/    # Firebase Auth trigger (onUserCreated)
├── public/                # Static assets
├── netlify.toml           # Netlify build + function config
├── vite.config.js         # Vite + PWA config
└── firestore.indexes.json # Firestore composite indexes
```

---

## 🎁 Gift Codes

Gift codes được quản lý qua env var `GIFT_CODES_JSON` trên Netlify Dashboard.  
**Không commit codes vào source code** — chỉ hardcode trong môi trường dev/staging.

Format:
```json
{
  "CODE_STRING": {
    "label": "Tên hiển thị",
    "type": "timed",
    "days": 3,
    "credits": 999999
  }
}
```

`type` có thể là `"timed"` (có hạn theo ngày) hoặc `"lifetime"` (vĩnh viễn).

---

## 📋 Checklist trước khi deploy production

- [ ] Set tất cả env vars trên Netlify Dashboard  
- [ ] Deploy Firestore indexes: `firebase deploy --only firestore:indexes`
- [ ] Deploy Firestore rules: `firebase deploy --only firestore:rules`
- [ ] Deploy Firebase Function: `cd firebase-functions && npm install && firebase deploy --only functions:onUserCreated`
- [ ] Set `GIFT_CODES_JSON` trên Netlify (không dùng hardcode)
- [ ] Verify Cloudinary credentials
- [ ] Test SePay webhook endpoint

---

## 📄 License

[MIT](LICENSE) © 2025 Lama Stylers
