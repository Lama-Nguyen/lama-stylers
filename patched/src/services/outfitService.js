import { collection, getDocs, doc, updateDoc, query, where, orderBy } from 'firebase/firestore'
import { db } from './firebase'
import { callApi } from './callApi'

/**
 * Tạo outfit gợi ý bằng AI (sync — server trả kết quả ngay trong response).
 *
 * @param {string}        uid         Firebase user ID
 * @param {string|null}   userText    Ngữ cảnh/dịp user nhập (free-text)
 * @param {Function|null} onProgress  Callback({ status, message }) cho JobStatusPanel
 * @param {AbortSignal|null} signal   Cancel signal
 * @returns {{ outfits, count, outfitIds, isJob: false }}
 */
export const generateOutfits = async (uid, userText = null, onProgress = null, signal = null) => {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

  onProgress?.({ status: 'validating', message: 'Đang kiểm tra tủ đồ...' })
  onProgress?.({ status: 'processing', message: 'AI đang phân tích và phối đồ cho bạn...' })

  let result
  try {
    result = await callApi(
      'generateOutfits',
      { userId: uid, userText },
      {
        timeout: 9_000, // 9s client — server timeout là 10s (Netlify Free limit)
        retry: false,
      }
    )
  } catch (error) {
    if (error.name === 'AbortError') throw error
    if (error.code === 'resource-exhausted')
      throw new Error(error.message || 'Đã hết lượt tạo outfit hôm nay.')
    if (error.code === 'failed-precondition')
      throw new Error('Cần ít nhất 2 món quần áo để tạo outfit.')
    if (error.code === 'already-exists')
      throw new Error('Đang có yêu cầu tạo outfit khác. Vui lòng chờ.')
    if (error.code === 'deadline-exceeded')
      throw new Error('AI mất quá nhiều thời gian. Vui lòng thử lại.')
    throw new Error(error.message || 'Không thể tạo outfit lúc này. Vui lòng thử lại.')
  }

  if (!result?.outfits || !Array.isArray(result.outfits)) {
    if (result?.jobId) {
      console.error('[outfitService] Server trả jobId — kiểm tra lại generateOutfits.js server (phải là sync mode)')
      throw new Error('Server configuration mismatch. Liên hệ admin.')
    }
    throw new Error('Server trả về dữ liệu không hợp lệ.')
  }

  const count = result.count ?? result.outfits.length
  onProgress?.({ status: 'completed', message: `Đã tạo xong ${count} outfit!` })

  return {
    outfits:   result.outfits,
    count,
    outfitIds: result.outfitIds ?? result.outfits.map(o => o.id).filter(Boolean),
    isJob:     false,
  }
}

export const getOutfits = async (uid) => {
  const snap = await getDocs(query(
    collection(db, 'outfits'),
    where('userId', '==', uid),
    orderBy('createdAt', 'desc')
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const getFavoriteOutfits = async (uid) => {
  const snap = await getDocs(query(
    collection(db, 'outfits'),
    where('userId', '==', uid),
    where('isFavorite', '==', true),
    orderBy('createdAt', 'desc')
  ))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export const toggleFavorite = async (outfitId, current) => {
  await updateDoc(doc(db, 'outfits', outfitId), { isFavorite: !current })
  return !current
}
