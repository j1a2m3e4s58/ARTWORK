const DB_NAME = 'reigns-chat-outbox';
const DB_VERSION = 1;
const STORE_NAME = 'outbox';
const memoryFallback = new Map();

const fallbackKey = userId => `reigns-chat-outbox-fallback:${userId || 'guest'}`;

const openOutbox = () => new Promise((resolve, reject) => {
  if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable.'));
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'clientId' });
      store.createIndex('userId', 'userId');
      store.createIndex('conversationId', 'conversationId');
      store.createIndex('createdAt', 'createdAt');
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('The offline outbox could not be opened.'));
});

const transact = async (mode, operation) => {
  const database = await openOutbox();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try { result = operation(store); } catch (error) { reject(error); return; }
      transaction.oncomplete = () => resolve(result?.result);
      transaction.onerror = () => reject(transaction.error || new Error('The offline outbox could not be updated.'));
      transaction.onabort = () => reject(transaction.error || new Error('The offline outbox update was cancelled.'));
    });
  } finally {
    database.close();
  }
};

const readFallback = userId => {
  try { return JSON.parse(localStorage.getItem(fallbackKey(userId)) || '[]'); } catch { return []; }
};

const writeFallback = (userId, items) => {
  try { localStorage.setItem(fallbackKey(userId), JSON.stringify(items)); } catch { /* Best-effort fallback. */ }
};

export async function listOutbox(userId) {
  const inMemory = [...memoryFallback.values()].filter(item => item.userId === userId);
  try {
    const all = await transact('readonly', store => store.getAll());
    return [...new Map([...(all || []).filter(item => item.userId === userId), ...inMemory]
      .map(item => [item.clientId, item])).values()]
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  } catch {
    return [...new Map([...readFallback(userId), ...inMemory].map(item => [item.clientId, item])).values()]
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }
}

export async function putOutbox(item) {
  const row = { ...item, updatedAt: new Date().toISOString() };
  try {
    await transact('readwrite', store => store.put(row));
    memoryFallback.delete(row.clientId);
  } catch {
    // Keep binary jobs alive for the current page when IndexedDB is unavailable.
    // localStorage cannot clone Blob/File values, but dropping the job here leaves
    // its optimistic message stuck at "Preparing" and prevents an online send.
    memoryFallback.set(row.clientId, row);
    if (!row.attachments?.length) {
      const rows = readFallback(row.userId).filter(entry => entry.clientId !== row.clientId);
      writeFallback(row.userId, [...rows, row].slice(-100));
    }
  }
  return row;
}

export async function patchOutbox(userId, clientId, changes) {
  const rows = await listOutbox(userId);
  const current = rows.find(item => item.clientId === clientId);
  if (!current) return null;
  return putOutbox({ ...current, ...changes });
}

export async function removeOutbox(userId, clientId) {
  memoryFallback.delete(clientId);
  try { await transact('readwrite', store => store.delete(clientId)); } catch { /* fallback below */ }
  writeFallback(userId, readFallback(userId).filter(item => item.clientId !== clientId));
}

export async function clearOutbox(userId) {
  const rows = await listOutbox(userId);
  await Promise.all(rows.map(item => removeOutbox(userId, item.clientId)));
}
