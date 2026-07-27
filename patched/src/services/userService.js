import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from './firebase'

import { callApi } from './callApi'

export const getUserProfile = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}

const ALLOWED_MEASUREMENT_FIELDS = [
  'height', 'weight',
  'chest', 'waist', 'hips',
  'shoulder', 'inseam', 'neck',
  'thigh', 'sleeve',
]

export const saveBodyMeasurements = async (uid, measurements) => {

  const RANGE = {
    height: [50, 250],
    weight: [10, 300],
    chest:  [40, 200], waist:    [30, 200], hips:     [40, 200],
    shoulder:[20, 80],  inseam:  [40, 120], neck:     [20, 80],
    thigh:  [20, 120],  sleeve:  [40, 100],
  }

  const safeData = {}
  for (const key of ALLOWED_MEASUREMENT_FIELDS) {
    if (measurements[key] === undefined) continue
    const val = Number(measurements[key])

    if (isNaN(val) || !isFinite(val)) continue
    const [min, max] = RANGE[key] || [0, 9999]
    if (val < min || val > max) {
      throw new Error(`Giá trị ${key} không hợp lệ (phải từ ${min} đến ${max})`)
    }
    safeData[key] = val
  }

  if (Object.keys(safeData).length === 0) {
    throw new Error('Không có dữ liệu đo lường hợp lệ để lưu')
  }

  await updateDoc(doc(db, 'users', uid), {
    bodyMeasurements: safeData,
    updatedAt: serverTimestamp(),
  })
}

export const hasBodyMeasurements = (profile) => {
  const m = profile?.bodyMeasurements
  if (!m || typeof m !== 'object') return false
  return ['height', 'weight', 'chest', 'waist', 'hips'].some(
    k => typeof m[k] === 'number' && m[k] > 0
  )
}

export const updateAvatar = async (uid, file) => {
  if (!file || !(file instanceof File || file instanceof Blob)) {
    throw new Error('Vui lòng chọn ảnh trước')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ảnh quá lớn, vui lòng chọn ảnh dưới 5MB')
  }
  if (!file.type?.startsWith('image/')) {
    throw new Error('Vui lòng chọn file ảnh (jpg, png...)')
  }

  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = (e) => resolve(e.target.result.split(',')[1])
    reader.onerror = ()  => reject(new Error('Không đọc được file ảnh'))
    reader.readAsDataURL(file)
  })

  const result = await callApi('uploadImage', { imageBase64: base64, kind: 'avatar' })

  await updateDoc(doc(db, 'users', uid), {
    avatarUrl: result.url,
    avatarPublicId: result.publicId,
    updatedAt: serverTimestamp(),
  })

  return result.url
}
