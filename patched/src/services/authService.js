import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

import { auth, db } from './firebase'
import { callApi } from './callApi'

const googleProvider = new GoogleAuthProvider()

export const AUTH_ERROR_MESSAGES = {
  'auth/email-already-in-use': 'Email này đã được đăng ký',
  'auth/invalid-email': 'Email không hợp lệ',
  'auth/weak-password': 'Mật khẩu phải có ít nhất 6 ký tự',
  'auth/user-not-found': 'Tài khoản không tồn tại',
  'auth/wrong-password': 'Mật khẩu sai',
  'auth/too-many-requests': 'Thử lại quá nhiều lần, hãy chờ vài phút',
  'auth/operation-not-allowed': 'Tính năng này đã bị tắt',
}

export const register = async (email, password, name) => {
  const cred = await createUserWithEmailAndPassword(auth, email, password)
  const userRef = doc(db, 'users', cred.user.uid)
  const existing = await getDoc(userRef)
  const isNew = !existing.exists()

  await setDoc(userRef, {
    email: cred.user.email,
    name,
    ...(isNew && {
      isPremium: false,
      credits: 0,
      createdAt: new Date(),
    }),
  }, { merge: true })

  return cred.user
}

export const login = async (email, password) => {
  const cred = await signInWithEmailAndPassword(auth, email, password)
  const userRef = doc(db, 'users', cred.user.uid)
  const existing = await getDoc(userRef)
  const isNew = !existing.exists()

  await setDoc(userRef, {
    email: cred.user.email,
    name: cred.user.displayName,
    ...(isNew && {
      isPremium: false,
      credits: 0,
      createdAt: new Date(),
    }),
  }, { merge: true })

  return cred.user
}

export const loginWithGoogle = async () => {
  const cred = await signInWithPopup(auth, googleProvider)
  const userRef = doc(db, 'users', cred.user.uid)
  const existing = await getDoc(userRef)
  const isNew = !existing.exists()

  await setDoc(userRef, {
    email: cred.user.email,
    name: cred.user.displayName,
    ...(isNew && {
      isPremium: false,
      credits: 0,
      createdAt: new Date(),
    }),
  }, { merge: true })

  return cred.user
}

export const logout = () => {
  return auth.signOut()
}

export const changePassword = async (currentPassword, newPassword) => {
  const user = auth.currentUser
  const providerId = user.providerData[0]?.providerId
  if (providerId === 'google.com') {
    const err = new Error('Tài khoản Google không thể đổi mật khẩu qua ứng dụng')
    err.code = 'auth/google-no-password'
    throw err
  }
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export const deleteAccount = async (password) => {
  const user = auth.currentUser
  const providerId = user.providerData[0]?.providerId

  if (providerId === 'google.com') {
    await reauthenticateWithPopup(user, googleProvider)
  } else {
    if (!password) {
      const err = new Error('Vui lòng nhập mật khẩu để xác nhận')
      err.code = 'auth/missing-password'
      throw err
    }
    const credential = EmailAuthProvider.credential(user.email, password)
    await reauthenticateWithCredential(user, credential)
  }

  try {
    await callApi('deleteAccountData')
  } catch (e) {
    console.error('deleteAccountData API failed:', e.message)
  }

  await cleanupUserOwnedData(user.uid)

  const uid = user.uid
  await deleteUser(user)
  await deleteDoc(doc(db, 'users', uid))
}

async function cleanupUserOwnedData(uid) {
  try {

    console.log('[cleanup] Starting for uid:', uid)
    const startTime = Date.now()

    const [clothingSnap, outfitsSnap, notifSnap, quotaSnap, userSnap, pendingSnap] = await Promise.all([
      getDocs(query(collection(db, 'clothing_items'), where('userId', '==', uid))),
      getDocs(query(collection(db, 'outfits'),        where('userId', '==', uid))),
      getDocs(query(collection(db, 'notifications'),  where('userId', '==', uid))),
      getDocs(collection(db, 'havy_quota', uid, 'daily')),
      getDoc(doc(db, 'users', uid)),
      getDocs(query(collection(db, 'pending_uploads'), where('uid', '==', uid))),
    ])

    console.log(`[cleanup] Fetched ${clothingSnap.size + outfitsSnap.size + notifSnap.size + quotaSnap.size + pendingSnap.size} docs in ${Date.now() - startTime}ms`)

    const imagePublicIds = []

    clothingSnap.forEach(d => {
      const publicId = d.data().imagePublicId
      if (publicId) imagePublicIds.push(publicId)
    })

    if (userSnap.exists()) {
      const avatarPublicId = userSnap.data()?.avatarPublicId
      if (avatarPublicId) imagePublicIds.push(avatarPublicId)
    }

    const batch = writeBatch(db)

    clothingSnap.forEach(d => batch.delete(d.ref))
    outfitsSnap.forEach(d => batch.delete(d.ref))
    notifSnap.forEach(d => batch.delete(d.ref))
    quotaSnap.forEach(d => batch.delete(d.ref))
    pendingSnap.forEach(d => batch.delete(d.ref))

    await batch.commit()
    console.log(`[cleanup] Deleted ${clothingSnap.size + outfitsSnap.size + notifSnap.size + quotaSnap.size + pendingSnap.size} Firestore docs`)

    if (imagePublicIds.length > 0) {
      try {
        await callApi('deleteImages', { publicIds: imagePublicIds })
        console.log(`[cleanup] Deleted ${imagePublicIds.length} images from Cloudinary`)
      } catch (e) {
        console.error('[cleanup] Delete images failed:', e.message)

      }
    }

    console.log(`[cleanup] Complete in ${Date.now() - startTime}ms`)
  } catch (e) {
    console.error('[cleanup] Error:', e.message)
    throw e
  }
}

export const fetchProfileOnce = async (uid) => {
  const snap = await getDoc(doc(db, 'users', uid))
  return snap.exists() ? snap.data() : null
}
