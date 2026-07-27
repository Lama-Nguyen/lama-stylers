let Dexie
try { Dexie = (await import('dexie')).default } catch (_) {}

export const localDB = Dexie ? (() => {
  const db = new Dexie('LamaStylersDB')
  db.version(1).stores({
    clothing_items: '++localId, userId, createdAt, synced',
    outfits:        '++localId, userId, createdAt, synced',
    syncQueue:      '++id, status, createdAt',
  })
  return db
})() : null

export async function saveItemLocal(collection, data) {
  if (!localDB) return null
  return localDB[collection].put({ ...data, synced: false, syncedAt: null })
}

export async function queueSync(operation, collection, id, data) {
  if (!localDB) return null
  return localDB.syncQueue.add({
    operation, collection, id, data,
    status: 'pending', createdAt: new Date(),
  })
}

export async function processSyncQueue(syncFn) {
  if (!localDB) return
  const pending = await localDB.syncQueue.where('status').equals('pending').toArray()
  for (const item of pending) {
    try {
      await syncFn(item)
      await localDB.syncQueue.update(item.id, { status: 'synced', syncedAt: new Date() })
      await localDB[item.collection]?.update(item.localId, { synced: true, syncedAt: new Date() })
    } catch (e) {
      console.error('[IndexedDB] Sync failed:', item, e)
    }
  }
}
