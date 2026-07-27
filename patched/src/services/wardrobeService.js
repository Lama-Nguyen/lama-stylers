import {
  collection, addDoc, getDocs, doc, getDoc, setDoc,
  updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, Timestamp, writeBatch
} from 'firebase/firestore'
import { db } from './firebase'
import { trackUploadItem, trackFirstUpload } from './analyticsService'
import { checkAndGrantFirstUpload } from './creditService'
import { callApi } from './callApi'

const _wardrobeCache = { uid: null, items: null, timestamp: 0 }
const WARDROBE_CACHE_TTL = 2 * 60 * 1000

function _getCacheKey(uid) {
  return `wardrobe:${uid}`
}

function _isCacheValid(uid) {
  return (
    _wardrobeCache.uid === uid &&
    Date.now() - _wardrobeCache.timestamp < WARDROBE_CACHE_TTL
  )
}

function _setCache(uid, items) {
  _wardrobeCache.uid = uid
  _wardrobeCache.items = items
  _wardrobeCache.timestamp = Date.now()
}

function _invalidateCache() {
  _wardrobeCache.timestamp = 0
}

export const getClothingItems = async (uid, { bust = false } = {}) => {

  if (!bust && _isCacheValid(uid)) {
    console.debug(`[Cache HIT] wardrobe for ${uid}`)
    return _wardrobeCache.items
  }

  console.debug(`[Cache MISS] wardrobe for ${uid}`)
  try {
    const q = query(
      collection(db, 'clothing_items'),
      where('userId', '==', uid),
      orderBy('createdAt', 'desc')
    )
    const snap = await getDocs(q)
    const items = snap.docs.map(d => ({
      id: d.id,
      ...d.data(),
    }))

    _setCache(uid, items)
    return items
  } catch (e) {
    console.error('getClothingItems error:', e)
    throw e
  }
}

export const resizeImage = (file, maxDim = 1200, maxSizeBytes = 900_000) => {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img

      if (width <= maxDim && height <= maxDim && file.size <= maxSizeBytes) {
        return resolve(file)
      }

      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height)
        width  = Math.round(width  * scale)
        height = Math.round(height * scale)
      }

      const canvas = document.createElement('canvas')
      canvas.width  = width
      canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)

      const QUALITY_STEPS = [0.85, 0.72, 0.58, 0.42]
      let stepIdx = 0

      const tryStep = () => {
        const q = QUALITY_STEPS[stepIdx] ?? 0.42
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Canvas toBlob failed'))
          if (blob.size <= maxSizeBytes || stepIdx >= QUALITY_STEPS.length - 1) {
            return resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }))
          }
          stepIdx++
          tryStep()
        }, 'image/jpeg', q)
      }
      tryStep()
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Không thể đọc file ảnh'))
    }

    img.src = objectUrl
  })
}

export const uploadClothingImage = async (uid, file) => {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result.split(',')[1])
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'))
    reader.readAsDataURL(file)
  })

  const result = await callApi('uploadImage', { imageBase64: base64, kind: 'clothing' })
  const { url: imageUrl, publicId: imagePublicId } = result

  setDoc(doc(db, 'pending_uploads', imagePublicId), {
    uid,
    publicId: imagePublicId,
    imageUrl,
    uploadedAt: serverTimestamp(),
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  }).catch(e => console.warn('pending_uploads write failed:', e.message))

  return { imageUrl, imagePublicId }
}

export const saveClothingItem = async (uid, imageUrl, imagePublicId, itemData) => {
  try {
    const docRef = await addDoc(collection(db, 'clothing_items'), {
      userId: uid,
      imageUrl,
      imagePublicId,
      ...itemData,
      createdAt: serverTimestamp()
    })

    getClothingItems(uid, { bust: true }).then(items => {
      const isFirst = items.length === 1
      if (isFirst) {
        trackFirstUpload(itemData.type)
        checkAndGrantFirstUpload(uid).catch(e => console.warn('checkAndGrantFirstUpload:', e))
      } else {
        trackUploadItem(itemData.type)
      }
    }).catch(() => {})

    _invalidateCache()

    deleteDoc(doc(db, 'pending_uploads', imagePublicId))
      .catch(e => console.warn('pending_uploads cleanup failed:', e.message))

    return { id: docRef.id, imageUrl, imagePublicId, ...itemData }
  } catch (e) {
    console.error('saveClothingItem error:', e.code, e.message)
    throw e
  }
}

export const deleteClothingItem = async (itemId, imagePublicId) => {
  try {
    await deleteDoc(doc(db, 'clothing_items', itemId))

    _invalidateCache()

    if (imagePublicId) {
      callApi('deleteImage', { publicId: imagePublicId })
        .catch(e => console.warn('deleteImage failed:', e.message))
    }
  } catch (e) {
    console.error('deleteClothingItem error:', e)
    throw e
  }
}

export const updateClothingItem = async (itemId, updates) => {
  try {
    await updateDoc(doc(db, 'clothing_items', itemId), updates)

    _invalidateCache()
  } catch (e) {
    console.error('updateClothingItem error:', e)
    throw e
  }
}

export const getOutfits = async (uid) => {
  const q = query(
    collection(db, 'outfits'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const saveOutfit = async (uid, outfitData) => {
  const docRef = await addDoc(collection(db, 'outfits'), {
    userId: uid,
    ...outfitData,
    createdAt: serverTimestamp()
  })
  return { id: docRef.id, ...outfitData }
}

export const getFavorites = async (uid) => {
  const q = query(
    collection(db, 'favorites'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const toggleFavorite = async (uid, outfitId, isFavorited) => {
  if (isFavorited) {

    const q = query(
      collection(db, 'favorites'),
      where('userId', '==', uid),
      where('outfitId', '==', outfitId)
    )
    const snap = await getDocs(q)
    const batch = writeBatch(db)
    snap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  } else {

    await addDoc(collection(db, 'favorites'), {
      userId: uid,
      outfitId,
      createdAt: serverTimestamp()
    })
  }
}

export const CLOTHING_TYPES = [
  'Áo thun', 'Áo sơ mi', 'Áo khoác', 'Áo lót', 'Áo dài',
  'Quần', 'Chân váy', 'Váy'
]

export const FOOTWEAR_KINDS      = ['Giày', 'Dép']
export const FOOTWEAR_SHOE_FORMS = ['Sneaker', 'Oxford/Derby', 'Loafer', 'Boot', 'Heel/Cao gót', 'Slip-on', 'Mule', 'Sandal gót', 'Khác']
export const FOOTWEAR_SANDAL_TYPES = ['Dép tông', 'Dép crocs', 'Dép quai hậu', 'Dép lê', 'Dép sandal', 'Dép bệt', 'Khác']
