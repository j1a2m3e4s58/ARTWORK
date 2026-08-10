const DATABASE_NAME = 'reigns-atelier-chat';
const DATABASE_VERSION = 1;
const STORE = 'records';

const openDatabase = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const record = async (mode, key, value) => {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const request = mode === 'readonly' ? store.get(key) : store.put(value, key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
};

const encode = value => {
  const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : value;
  let binary = '';
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
};
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const chatDeviceId = () => {
  const key = 'reigns-chat-device-id';
  let id = window.localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, id);
  }
  return id;
};

const identityRecordKey = userId => `identity:${userId}:${chatDeviceId()}`;

export const ensureDeviceIdentity = async userId => {
  if (!crypto.subtle || !window.indexedDB) throw new Error('Encrypted messaging is not supported by this browser.');
  const key = identityRecordKey(userId);
  const existing = await record('readonly', key);
  if (existing?.signingPrivateKey && existing?.agreementPrivateKey) return existing;

  const signing = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign', 'verify']);
  const agreement = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
  const identityKey = JSON.stringify(await crypto.subtle.exportKey('jwk', signing.publicKey));
  const signedPreKey = JSON.stringify(await crypto.subtle.exportKey('jwk', agreement.publicKey));
  const signature = encode(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing.privateKey, textEncoder.encode(signedPreKey)));
  const identity = {
    deviceId: chatDeviceId(), identityKey, signedPreKey, signature,
    signingPrivateKey: signing.privateKey, agreementPrivateKey: agreement.privateKey,
    createdAt: new Date().toISOString(),
  };
  await record('readwrite', key, identity);
  return identity;
};

export const publishDeviceKeys = async (studioClient, userId) => {
  const identity = await ensureDeviceIdentity(userId);
  await studioClient.chat.publishKeys({
    deviceId: identity.deviceId,
    identityKey: identity.identityKey,
    signedPreKey: identity.signedPreKey,
    signature: identity.signature,
  });
  return identity;
};

const verifiedDevices = async (studioClient, userId) => {
  const payload = await studioClient.chat.keysFor(userId);
  const devices = [];
  for (const device of payload.devices || []) {
    const identityJwk = JSON.parse(device.identityKey);
    const signingKey = await crypto.subtle.importKey('jwk', identityJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, signingKey, decode(device.signature), textEncoder.encode(device.signedPreKey));
    if (!valid) throw new Error('A recipient encryption key failed signature verification.');
    const trustKey = `trusted-key:${userId}:${device.deviceId}`;
    const trustedIdentity = await record('readonly', trustKey);
    if (trustedIdentity && trustedIdentity !== device.identityKey) throw new Error('A recipient identity key changed unexpectedly. Verify the recipient before continuing.');
    if (!trustedIdentity) await record('readwrite', trustKey, device.identityKey);
    devices.push({ ...device, userId });
  }
  return devices;
};

export const encryptChatText = async (studioClient, { body, participantIds, userId }) => {
  await publishDeviceKeys(studioClient, userId);
  const targetIds = [...new Set([...(participantIds || []), userId])];
  const deviceGroups = await Promise.all(targetIds.map(id => verifiedDevices(studioClient, id)));
  const devices = deviceGroups.flat();
  if (!devices.length) throw new Error('No verified recipient devices are available for encrypted messaging.');
  const plaintext = textEncoder.encode(JSON.stringify({ body, sentAt: new Date().toISOString() }));
  const envelopes = [];
  for (const device of devices) {
    const recipientKey = await crypto.subtle.importKey('jwk', JSON.parse(device.signedPreKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const messageKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: recipientKey }, ephemeral.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, messageKey, plaintext);
    envelopes.push({
      userId: device.userId, deviceId: device.deviceId, keyId: device.keyId,
      ephemeralKey: await crypto.subtle.exportKey('jwk', ephemeral.publicKey), iv: encode(iv), ciphertext: encode(ciphertext),
    });
  }
  return JSON.stringify({ version: 1, algorithm: 'ECDH-P256+AES-256-GCM', senderDeviceId: chatDeviceId(), envelopes });
};

export const decryptChatText = async (ciphertext, userId) => {
  if (!ciphertext) return '';
  const payload = JSON.parse(ciphertext);
  const identity = await ensureDeviceIdentity(userId);
  const envelope = payload.envelopes?.find(item => item.userId === userId && item.deviceId === identity.deviceId);
  if (!envelope) throw new Error('This encrypted message was sent before this device was linked.');
  const ephemeralKey = await crypto.subtle.importKey('jwk', envelope.ephemeralKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const messageKey = await crypto.subtle.deriveKey({ name: 'ECDH', public: ephemeralKey }, identity.agreementPrivateKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(envelope.iv) }, messageKey, decode(envelope.ciphertext));
  return JSON.parse(textDecoder.decode(plaintext)).body || '';
};

export const decryptMessageRows = async (rows, userId) => Promise.all((rows || []).map(async message => {
  if (!message.ciphertext) return message;
  try {
    return { ...message, body: await decryptChatText(message.ciphertext, userId), decrypted: true };
  } catch (error) {
    return { ...message, body: '', encryptionError: error.message || 'Unable to decrypt on this device.' };
  }
}));

export const cacheConversations = (userId, rows) => record('readwrite', `conversations:${userId}`, rows);
export const readCachedConversations = userId => record('readonly', `conversations:${userId}`);
export const cacheMessages = (userId, conversationId, rows) => record('readwrite', `messages:${userId}:${conversationId}`, rows.slice(-250));
export const readCachedMessages = (userId, conversationId) => record('readonly', `messages:${userId}:${conversationId}`);
export const readSyncCursor = userId => record('readonly', `sync-cursor:${userId}`);
export const writeSyncCursor = (userId, cursor) => record('readwrite', `sync-cursor:${userId}`, cursor);
