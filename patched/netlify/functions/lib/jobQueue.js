'use strict'

const { admin } = require('./withAuth')
const { logInfo, logWarn } = require('./logger')
const { JOBS_COLLECTION, JOB_TIMEOUT_MS, JOB_STATUSES } = require('./constants')

const db = admin.firestore()

async function publishJob(jobType, userId, payload) {
  const jobId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
  const jobRef = db.collection(JOBS_COLLECTION).doc(jobId)
  try {
    await jobRef.set({
      jobType, userId, payload,
      status: JOB_STATUSES.PENDING,
      result: null, error: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      startedAt: null, completedAt: null,
      expiresAt: new Date(Date.now() + JOB_TIMEOUT_MS),
      retryCount: 0, maxRetries: 3,
    })
    logInfo('jobQueue', userId, `Published job ${jobId}`, { jobType })
    return jobId
  } catch (e) {
    logWarn('jobQueue', userId, 'Failed to publish job', { error: e.message, jobType })
    throw e
  }
}

async function updateJobStatus(jobId, status, data = {}) {
  const updates = {
    status, ...data,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }
  if (status === JOB_STATUSES.PROCESSING && !data.startedAt) {
    updates.startedAt = admin.firestore.FieldValue.serverTimestamp()
  }
  if (status === JOB_STATUSES.COMPLETED || status === JOB_STATUSES.FAILED) {
    updates.completedAt = admin.firestore.FieldValue.serverTimestamp()
  }
  await db.collection(JOBS_COLLECTION).doc(jobId).update(updates)
}

async function getJob(jobId) {
  const doc = await db.collection(JOBS_COLLECTION).doc(jobId).get()
  if (!doc.exists) return null
  return { id: doc.id, ...doc.data() }
}

async function claimJob(jobId, workerId) {
  return db.runTransaction(async (tx) => {
    const jobRef = db.collection(JOBS_COLLECTION).doc(jobId)
    const doc = await tx.get(jobRef)
    if (!doc.exists) return { success: false, reason: 'not_found' }
    const job = doc.data()
    if (job.status !== JOB_STATUSES.PENDING) return { success: false, reason: 'not_pending' }
    if (job.retryCount >= job.maxRetries) return { success: false, reason: 'max_retries' }
    tx.update(jobRef, {
      status: JOB_STATUSES.PROCESSING, workerId,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
    return { success: true, job }
  })
}

async function completeJob(jobId, result) {
  await updateJobStatus(jobId, JOB_STATUSES.COMPLETED, { result, workerId: null })
}

async function failJob(jobId, error, shouldRetry = false) {
  const jobRef = db.collection(JOBS_COLLECTION).doc(jobId)
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(jobRef)
    if (!doc.exists) return false
    const job = doc.data()
    const newRetryCount = job.retryCount + 1
    const shouldMarkFailed = newRetryCount >= job.maxRetries || !shouldRetry
    tx.update(jobRef, {
      status: shouldMarkFailed ? JOB_STATUSES.FAILED : JOB_STATUSES.PENDING,
      error: error.message || String(error),
      retryCount: newRetryCount,
      workerId: null,
      ...(shouldMarkFailed && { completedAt: admin.firestore.FieldValue.serverTimestamp() }),
    })
    return !shouldMarkFailed
  })
}

async function cleanupExpiredJobs() {
  const now = new Date()
  const docs = await db.collection(JOBS_COLLECTION).where('expiresAt', '<', now).get()
  if (docs.size === 0) return 0
  const batch = db.batch()
  docs.forEach(doc => batch.delete(doc.ref))
  await batch.commit()
  logInfo('jobQueue', 'system', `Cleaned up ${docs.size} expired jobs`)
  return docs.size
}

module.exports = { publishJob, updateJobStatus, getJob, claimJob, completeJob, failJob, cleanupExpiredJobs }
