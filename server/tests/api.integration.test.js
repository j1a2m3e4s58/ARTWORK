import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:net';

let baseUrl;

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();
  server.close();
  await once(server, 'close');
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('Test API did not start.');
}

test('API keeps public reads open while blocking unverified customer mutations', { timeout: 30_000 }, async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = await mkdtemp(path.join(tmpdir(), 'atelier-api-test-'));
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      RENDER: 'true',
      PORT: String(port),
      API_PORT: '',
      API_HOST: '',
      APP_ORIGIN: baseUrl,
      SITE_URL: baseUrl,
      DATA_DIR: dataDir,
      DATABASE_URL: '',
      JWT_SECRET: 'integration-test-secret-that-is-longer-than-32-characters',
      ADMIN_EMAIL: 'admin@example.test',
      ADMIN_PASSWORD: 'AdminCanvas2026!',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
      VAPID_SUBJECT: '',
      CLOUDFLARE_TURN_KEY_ID: '',
      CLOUDFLARE_TURN_API_TOKEN: '',
    },
    stdio: 'ignore',
  });
  try {
    await waitForServer();
    const publicResponse = await fetch(`${baseUrl}/api/entities/Artwork?limit=1`);
    assert.equal(publicResponse.status, 200);

    const register = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: 'Test Collector', email: 'collector@example.test', password: 'CanvasStudio2026!' }),
    });
    assert.equal(register.status, 201);
    const setCookies = register.headers.getSetCookie();
    const cookieHeader = setCookies.map(value => value.split(';')[0]).join('; ');
    const csrf = decodeURIComponent(cookieHeader.match(/atelier_csrf=([^;]+)/)?.[1] || '');
    assert.ok(csrf);

    const protectedResponse = await fetch(`${baseUrl}/api/entities/Message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({ name: 'Test Collector', subject: 'Question', message: 'Can I commission a portrait?' }),
    });
    assert.equal(protectedResponse.status, 403);
    const payload = await protectedResponse.json();
    assert.equal(payload.code, 'email_verification_required');

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@example.test', password: 'AdminCanvas2026!' }),
    });
    assert.equal(login.status, 200);
    let adminCookieHeader = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const adminCsrf = decodeURIComponent(adminCookieHeader.match(/atelier_csrf=([^;]+)/)?.[1] || '');
    const lockedResponse = await fetch(`${baseUrl}/api/admin/system-status`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(lockedResponse.status, 403);
    assert.equal((await lockedResponse.json()).code, 'admin_unlock_required');

    const unlockResponse = await fetch(`${baseUrl}/api/admin/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf },
      body: JSON.stringify({ password: 'AdminCanvas2026!' }),
    });
    assert.equal(unlockResponse.status, 200);
    adminCookieHeader = [
      ...adminCookieHeader.split('; ').filter(value => !value.startsWith('atelier_admin_access=')),
      ...unlockResponse.headers.getSetCookie().map(value => value.split(';')[0]),
    ].join('; ');
    const securedHeaders = { 'Content-Type': 'application/json', Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf };
    const readOutbox = async () => {
      const response = await fetch(`${baseUrl}/api/entities/Outbox?limit=100`, { headers: { Cookie: adminCookieHeader } });
      assert.equal(response.status, 200);
      return response.json();
    };
    const tokenFromEmail = (outbox, recipient, pathName) => {
      const email = [...outbox].reverse().find(item => item.to === recipient && item.text?.includes(pathName));
      assert.ok(email, `Expected ${pathName} email for ${recipient}`);
      return new URL(email.text.match(/https?:\/\/\S+/)?.[0]).searchParams.get('token');
    };

    const verificationToken = tokenFromEmail(await readOutbox(), 'collector@example.test', '/verify-email');
    const verifyResponse = await fetch(`${baseUrl}/api/auth/verify-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: verificationToken }),
    });
    assert.equal(verifyResponse.status, 200);
    const verifiedMessage = await fetch(`${baseUrl}/api/entities/Message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ name: 'Test Collector', subject: 'Question', message: 'Can I commission a portrait?' }),
    });
    assert.equal(verifiedMessage.status, 201);

    const chatDirectoryResponse = await fetch(`${baseUrl}/api/chat/directory`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(chatDirectoryResponse.status, 200);
    const chatDirectory = await chatDirectoryResponse.json();
    const collectorDirectoryEntry = chatDirectory.find(item => item.name === 'Test Collector');
    assert.ok(collectorDirectoryEntry, 'All active signed-in customers should appear in the private chat directory.');
    assert.equal('email' in collectorDirectoryEntry, false, 'The chat directory must not reveal private email addresses.');
    const avatarResponse = await fetch(`${baseUrl}/api/account/profile`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ full_name: 'Test Collector', chatDiscoverable: true, avatarUrl: '/uploads/collector-avatar.jpg' }),
    });
    assert.equal(avatarResponse.status, 200);
    const refreshedDirectory = await fetch(`${baseUrl}/api/chat/directory`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.equal(refreshedDirectory.find(item => item.id === collectorDirectoryEntry.id)?.avatarUrl, '/uploads/collector-avatar.jpg');

    const conversationResponse = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ userId: collectorDirectoryEntry.id }),
    });
    assert.equal(conversationResponse.status, 201);
    const conversation = await conversationResponse.json();
    const encryptedUpload = new FormData();
    encryptedUpload.append('purpose', 'chat-attachment');
    encryptedUpload.append('file', new Blob([new Uint8Array([17, 91, 203, 44, 8, 199, 73, 5])], { type: 'application/octet-stream' }), 'encrypted-attachment.bin');
    const encryptedUploadResponse = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { Cookie: adminCookieHeader, 'X-CSRF-Token': adminCsrf },
      body: encryptedUpload,
    });
    assert.equal(encryptedUploadResponse.status, 201, 'Opaque private-chat ciphertext should be accepted only through the encrypted attachment sentinel.');
    assert.equal((await encryptedUploadResponse.json()).media.scanStatus, 'client-encrypted');
    const chatMessageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ clientId: 'integration-chat-message-1', body: 'Welcome to the studio messenger.' }),
    });
    assert.equal(chatMessageResponse.status, 201);
    const chatMessage = await chatMessageResponse.json();
    const repeatedMessageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ clientId: 'integration-chat-message-1', body: 'Welcome to the studio messenger.' }),
    });
    assert.equal(repeatedMessageResponse.status, 200);
    assert.equal((await repeatedMessageResponse.json()).id, chatMessage.id, 'Retrying the same client message must not create a duplicate.');
    const invalidRecipientResponse = await fetch(`${baseUrl}/api/chat/conversations`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ userId: 'missing-user' }),
    });
    assert.equal(invalidRecipientResponse.status, 404, 'A missing recipient must never silently fall back to an administrator.');

    for (const body of ['Second message', 'Third message']) {
      const response = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
        method: 'POST', headers: securedHeaders, body: JSON.stringify({ body }),
      });
      assert.equal(response.status, 201);
    }
    const batchResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages/batch`, {
      method: 'POST',
      headers: securedHeaders,
      body: JSON.stringify({ messages: [
        { body: 'Two studio references', attachmentUrl: 'https://res.cloudinary.com/example/image/upload/reference-one.jpg', attachmentName: 'reference-one.jpg', attachmentType: 'image/jpeg' },
        { attachmentUrl: 'https://res.cloudinary.com/example/image/upload/reference-two.jpg', attachmentName: 'reference-two.jpg', attachmentType: 'image/jpeg' },
      ] }),
    });
    assert.equal(batchResponse.status, 201);
    const batchMessages = await batchResponse.json();
    assert.equal(batchMessages.length, 2, 'A multi-file send should record every attachment in one committed batch.');
    assert.equal(batchMessages[0].body, 'Two studio references');
    assert.equal(batchMessages[1].attachmentName, 'reference-two.jpg');
    const firstPageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages?limit=2`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(firstPageResponse.status, 200);
    const firstPage = await firstPageResponse.json();
    assert.equal(firstPage.items.length, 2);
    assert.ok(firstPage.nextCursor, 'Paginated chat history should expose a cursor for older messages.');
    const secondPage = await (await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages?limit=2&before=${encodeURIComponent(firstPage.nextCursor)}`, { headers: { Cookie: adminCookieHeader } })).json();
    assert.ok(secondPage.items.length >= 1);

    const markReadHeaders = { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf };
    assert.equal((await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/read`, { method: 'POST', headers: markReadHeaders })).status, 200);
    const readOnce = await (await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, { headers: { Cookie: adminCookieHeader } })).json();
    const firstReadAt = readOnce.find(item => item.id === chatMessage.id).readAt;
    assert.ok(firstReadAt);
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal((await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/read`, { method: 'POST', headers: markReadHeaders })).status, 200);
    const readTwice = await (await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, { headers: { Cookie: adminCookieHeader } })).json();
    assert.equal(readTwice.find(item => item.id === chatMessage.id).readAt, firstReadAt, 'Reading a conversation again must preserve the original read timestamp.');
    const reactionResponse = await fetch(`${baseUrl}/api/chat/messages/${chatMessage.id}/reaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf },
      body: JSON.stringify({ emoji: '👍' }),
    });
    assert.equal(reactionResponse.status, 200);
    assert.equal(Object.values((await reactionResponse.json()).reactions)[0], '👍');

    const starResponse = await fetch(`${baseUrl}/api/chat/messages/${chatMessage.id}/star`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ starred: true }),
    });
    assert.equal(starResponse.status, 200);
    assert.ok((await starResponse.json()).starredBy.length, 'A member should be able to star a message privately.');
    const saveMediaResponse = await fetch(`${baseUrl}/api/chat/messages/${batchMessages[0].id}/save-media`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ saved: true }),
    });
    assert.equal(saveMediaResponse.status, 200);
    assert.ok((await saveMediaResponse.json()).savedMediaBy.includes(chatMessage.senderId));
    const savedItems = await fetch(`${baseUrl}/api/chat/saved-items`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.ok(savedItems.starred.some(item => item.id === chatMessage.id));
    assert.ok(savedItems.media.some(item => item.id === batchMessages[0].id));

    const stickerResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: markReadHeaders, body: JSON.stringify({ sticker: '🎨' }),
    });
    assert.equal(stickerResponse.status, 201);
    assert.equal((await stickerResponse.json()).sticker, '🎨');
    const liveLocationResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders,
      body: JSON.stringify({ body: 'Live location', sharedLocation: { latitude: 5.6037, longitude: -0.187, accuracy: 8, liveForSeconds: 3600 } }),
    });
    assert.equal(liveLocationResponse.status, 201);
    const liveLocation = await liveLocationResponse.json();
    assert.ok(liveLocation.sharedLocation.liveUntil);
    assert.equal((await fetch(`${baseUrl}/api/chat/messages/${liveLocation.id}/location`, {
      method: 'PATCH', headers: markReadHeaders, body: JSON.stringify({ latitude: 5.604, longitude: -0.188, accuracy: 6 }),
    })).status, 403, 'Only the live-location sender can update coordinates.');
    const locationUpdateResponse = await fetch(`${baseUrl}/api/chat/messages/${liveLocation.id}/location`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ latitude: 5.604, longitude: -0.188, accuracy: 6 }),
    });
    assert.equal(locationUpdateResponse.status, 200);
    assert.equal((await locationUpdateResponse.json()).sharedLocation.accuracy, 6);

    const typingResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/typing`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf }, body: JSON.stringify({ typing: true }),
    });
    assert.equal(typingResponse.status, 200);
    const conversationList = await (await fetch(`${baseUrl}/api/chat/conversations`, { headers: { Cookie: adminCookieHeader } })).json();
    assert.equal(conversationList.find(item => item.id === conversation.id).typingUsers[0].name, 'Test Collector');

    const editResponse = await fetch(`${baseUrl}/api/chat/messages/${chatMessage.id}`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ body: 'Welcome to the upgraded studio messenger.' }),
    });
    assert.equal(editResponse.status, 200);
    assert.ok((await editResponse.json()).editedAt);
    const searchResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages?q=upgraded`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(searchResponse.status, 200);
    assert.equal((await searchResponse.json()).length, 1);
    const filteredSearchResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages?senderId=${encodeURIComponent(chatMessage.senderId)}&attachmentType=media`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(filteredSearchResponse.status, 200);
    assert.ok((await filteredSearchResponse.json()).some(item => item.id === batchMessages[0].id), 'Structured chat search should filter by sender and attachment type.');
    const resourcesResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/resources`, { headers: { Cookie: cookieHeader } });
    assert.equal(resourcesResponse.status, 200);
    assert.ok((await resourcesResponse.json()).some(item => item.id === batchMessages[0].id), 'Conversation members should be able to browse chat attachments.');
    const chatExportResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/export`, { headers: { Cookie: cookieHeader } });
    assert.equal(chatExportResponse.status, 200);
    assert.ok((await chatExportResponse.json()).messages.some(item => item.id === chatMessage.id), 'A member chat export should contain the messages visible to that member.');
    const accountExportResponse = await fetch(`${baseUrl}/api/account/export`, { headers: { Cookie: cookieHeader } });
    assert.equal(accountExportResponse.status, 200);
    assert.ok((await accountExportResponse.json()).chatMessages.some(item => item.id === chatMessage.id), 'Account data export should include received messages in joined conversations.');
    const compatibleVoiceResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ attachmentUrl: 'https://res.cloudinary.com/example/video/upload/voice-note.webm', attachmentName: 'voice-note.webm', attachmentType: 'audio/webm', deliverySecurity: 'account-protected' }),
    });
    assert.equal(compatibleVoiceResponse.status, 201);
    assert.equal((await compatibleVoiceResponse.json()).deliverySecurity, 'account-protected', 'Voice notes may use the explicit non-E2EE compatibility delivery mode.');

    const muteResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/settings`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ muted: true, archived: true, blocked: true, favourite: true, pinned: true }),
    });
    assert.equal(muteResponse.status, 200);
    const mutedConversation = await muteResponse.json();
    assert.equal(mutedConversation.muted, true);
    assert.equal(mutedConversation.archived, true);
    assert.equal(mutedConversation.blockedByMe, true);
    assert.equal(mutedConversation.favourite, true);
    assert.equal(mutedConversation.pinned, true);
    const blockedSend = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookieHeader, 'X-CSRF-Token': csrf }, body: JSON.stringify({ body: 'This must be blocked.' }),
    });
    assert.equal(blockedSend.status, 403);
    await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/settings`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ blocked: false }),
    });

    const announcementResponse = await fetch(`${baseUrl}/api/chat/announcements`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ title: 'Studio news', body: 'A new collection is available.' }),
    });
    assert.equal(announcementResponse.status, 201);
    assert.equal((await announcementResponse.json()).type, 'announcement');
    const capabilitiesResponse = await fetch(`${baseUrl}/api/chat/capabilities`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(capabilitiesResponse.status, 200);
    assert.equal((await capabilitiesResponse.json()).realtime, 'server-sent-events');

    for (const deviceId of ['admin-browser-one', 'admin-browser-two']) {
      const keyResponse = await fetch(`${baseUrl}/api/chat/keys`, {
        method: 'PUT', headers: securedHeaders,
        body: JSON.stringify({ deviceId, identityKey: `identity-${deviceId}`, signedPreKey: `prekey-${deviceId}`, signature: `signature-${deviceId}` }),
      });
      assert.equal(keyResponse.status, 200);
    }
    const keyBundleResponse = await fetch(`${baseUrl}/api/chat/keys/${encodeURIComponent(collectorDirectoryEntry.id)}`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(keyBundleResponse.status, 404, 'A user without a linked encryption device should not expose a bundle.');
    const adminUserId = conversation.participantIds.find(id => id !== collectorDirectoryEntry.id);
    const ownKeyBundleResponse = await fetch(`${baseUrl}/api/chat/keys/${encodeURIComponent(adminUserId)}`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(ownKeyBundleResponse.status, 200);
    assert.equal((await ownKeyBundleResponse.json()).devices.length, 2, 'Every linked device should retain an independent encryption bundle.');

    const rtcResponse = await fetch(`${baseUrl}/api/chat/rtc-config`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(rtcResponse.status, 200);
    const rtc = await rtcResponse.json();
    assert.ok(Array.isArray(rtc.iceServers));
    assert.equal(rtc.turnConfigured, false);

    const callResponse = await fetch(`${baseUrl}/api/chat/calls`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ conversationId: conversation.id, kind: 'voice' }),
    });
    assert.equal(callResponse.status, 201);
    const call = await callResponse.json();
    assert.equal(call.status, 'ringing');
    const customerCallList = await fetch(`${baseUrl}/api/chat/calls`, { headers: { Cookie: cookieHeader } }).then(response => response.json());
    assert.equal(customerCallList[0].direction, 'incoming');
    const acceptedCallResponse = await fetch(`${baseUrl}/api/chat/calls/${call.id}`, {
      method: 'PATCH', headers: markReadHeaders, body: JSON.stringify({ action: 'accepted' }),
    });
    assert.equal(acceptedCallResponse.status, 200);
    const signalResponse = await fetch(`${baseUrl}/api/chat/calls/${call.id}/signal`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ signal: { type: 'candidate', candidate: { candidate: 'test' } } }),
    });
    assert.equal(signalResponse.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/chat/calls/${call.id}`, { method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ action: 'ended' }) })).status, 200);

    const syncResponse = await fetch(`${baseUrl}/api/chat/sync?since=1970-01-01T00:00:00.000Z`, { headers: { Cookie: cookieHeader } });
    assert.equal(syncResponse.status, 200);
    const synced = await syncResponse.json();
    assert.ok(synced.conversations.some(item => item.id === conversation.id));
    assert.ok(synced.messages.some(item => item.conversationId === conversation.id));

    const groupDirectoryResponse = await fetch(`${baseUrl}/api/chat/group-directory`, { headers: { Cookie: cookieHeader } });
    assert.equal(groupDirectoryResponse.status, 200);
    const groupDirectory = await groupDirectoryResponse.json();
    assert.ok(groupDirectory.some(item => item.id === adminUserId));
    const customerGroupResponse = await fetch(`${baseUrl}/api/chat/groups`, {
      method: 'POST', headers: markReadHeaders,
      body: JSON.stringify({ title: 'Collector Circle', participantIds: [adminUserId] }),
    });
    assert.equal(customerGroupResponse.status, 403, 'Customers must not be able to create groups through the API.');
    const adminGroupResponse = await fetch(`${baseUrl}/api/chat/groups`, {
      method: 'POST', headers: securedHeaders,
      body: JSON.stringify({ title: 'Collector Circle', participantIds: [collectorDirectoryEntry.id] }),
    });
    assert.equal(adminGroupResponse.status, 201, 'Administrators should be able to create groups.');
    const adminGroup = await adminGroupResponse.json();
    assert.equal(adminGroup.roles[adminUserId], 'owner');
    assert.equal(adminGroup.roles[collectorDirectoryEntry.id], 'member');
    const promoteResponse = await fetch(`${baseUrl}/api/chat/groups/${adminGroup.id}`, {
      method: 'PATCH', headers: securedHeaders, body: JSON.stringify({ userId: collectorDirectoryEntry.id, role: 'admin' }),
    });
    assert.equal(promoteResponse.status, 200);
    assert.equal((await promoteResponse.json()).roles[collectorDirectoryEntry.id], 'admin');

    const storyMediaUpload = new FormData();
    storyMediaUpload.append('purpose', 'chat-story');
    storyMediaUpload.append('file', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'status.png');
    const storyMediaResponse = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST', headers: { Cookie: cookieHeader, 'X-CSRF-Token': csrf }, body: storyMediaUpload,
    });
    assert.equal(storyMediaResponse.status, 201, 'Verified customers should be able to upload status media.');
    const storyMedia = await storyMediaResponse.json();
    assert.equal(storyMedia.media.purpose, 'chat-story');
    const storyResponse = await fetch(`${baseUrl}/api/chat/stories`, {
      method: 'POST', headers: markReadHeaders, body: JSON.stringify({ body: 'A 24-hour studio status.', mediaUrl: storyMedia.file_url, mediaType: storyMedia.media.mime }),
    });
    assert.equal(storyResponse.status, 201);
    const story = await storyResponse.json();
    const storyLifetime = new Date(story.expiresAt).getTime() - new Date(story.created_date).getTime();
    assert.ok(storyLifetime > 23.9 * 60 * 60 * 1000 && storyLifetime <= 24.1 * 60 * 60 * 1000);
    const storyList = await fetch(`${baseUrl}/api/chat/stories`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.ok(storyList.some(item => item.id === story.id));
    assert.equal((await fetch(`${baseUrl}/api/chat/stories/${story.id}/view`, { method: 'POST', headers: securedHeaders })).status, 200);

    const contactMessageResponse = await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, {
      method: 'POST', headers: securedHeaders,
      body: JSON.stringify({ sharedContact: { name: 'Studio Concierge', phone: '+233 20 000 0000', email: 'concierge@example.test' } }),
    });
    assert.equal(contactMessageResponse.status, 201);
    const contactMessage = await contactMessageResponse.json();
    const contactCardResponse = await fetch(`${baseUrl}/api/chat/messages/${contactMessage.id}/contact.vcf`, { headers: { Cookie: cookieHeader } });
    assert.equal(contactCardResponse.status, 200);
    assert.match(await contactCardResponse.text(), /BEGIN:VCARD[\s\S]*Studio Concierge[\s\S]*END:VCARD/);

    const privatePreviewResponse = await fetch(`${baseUrl}/api/chat/link-preview`, {
      method: 'POST', headers: securedHeaders, body: JSON.stringify({ url: 'http://127.0.0.1/private' }),
    });
    assert.equal(privatePreviewResponse.status, 400, 'Link previews must reject private-network targets.');

    const deleteResponse = await fetch(`${baseUrl}/api/chat/messages/${chatMessage.id}?mode=everyone`, { method: 'DELETE', headers: securedHeaders });
    assert.equal(deleteResponse.status, 200);
    const adminMessagesAfterDelete = await (await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, { headers: { Cookie: adminCookieHeader } })).json();
    assert.equal(adminMessagesAfterDelete.find(item => item.id === chatMessage.id), undefined, 'The person who deletes for everyone should get a clean chat immediately.');
    const deletedMessage = (await (await fetch(`${baseUrl}/api/chat/conversations/${conversation.id}/messages`, { headers: { Cookie: cookieHeader } })).json()).find(item => item.id === chatMessage.id);
    assert.equal(deletedMessage.deletedForEveryone, true);

    const pushConfigResponse = await fetch(`${baseUrl}/api/push/config`, { headers: { Cookie: adminCookieHeader } });
    assert.equal(pushConfigResponse.status, 200);
    assert.equal((await pushConfigResponse.json()).configured, false);

    const forgotResponse = await fetch(`${baseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'collector@example.test' }),
    });
    assert.equal(forgotResponse.status, 200);
    const resetToken = tokenFromEmail(await readOutbox(), 'collector@example.test', '/reset-password');
    const resetResponse = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: resetToken, password: 'UpdatedCanvas2026!' }),
    });
    assert.equal(resetResponse.status, 200);
    const collectorLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'collector@example.test', password: 'UpdatedCanvas2026!' }),
    });
    assert.equal(collectorLogin.status, 200);

    const inviteResponse = await fetch(`${baseUrl}/api/admin/users`, {
      method: 'POST',
      headers: securedHeaders,
      body: JSON.stringify({ email: 'support@example.test', full_name: 'Studio Support', role: 'support' }),
    });
    assert.equal(inviteResponse.status, 201);
    const inviteToken = tokenFromEmail(await readOutbox(), 'support@example.test', '/accept-invite');
    const acceptInvite = await fetch(`${baseUrl}/api/auth/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: inviteToken, password: 'SupportCanvas2026!' }),
    });
    assert.equal(acceptInvite.status, 200);
    const supportLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'support@example.test', password: 'SupportCanvas2026!' }),
    });
    assert.equal(supportLogin.status, 200);

    const productResponse = await fetch(`${baseUrl}/api/entities/ShopProduct`, {
      method: 'POST',
      headers: securedHeaders,
      body: JSON.stringify({ title: 'Numbered Studio Print', type: 'Print', price: 250, imageUrl: 'https://example.com/print.jpg', inventory: 2, status: 'published' }),
    });
    assert.equal(productResponse.status, 201);
    const product = await productResponse.json();
    const orderPayload = {
      items: [{ productId: product.id, title: product.title, price: 1, qty: 1 }],
      total: 1,
      channel: 'manual',
      deliveryMethod: 'pickup',
    };
    const orderHeaders = { ...securedHeaders, 'Idempotency-Key': 'integration-order-1' };
    const firstOrderResponse = await fetch(`${baseUrl}/api/entities/Order`, { method: 'POST', headers: orderHeaders, body: JSON.stringify(orderPayload) });
    const secondOrderResponse = await fetch(`${baseUrl}/api/entities/Order`, { method: 'POST', headers: orderHeaders, body: JSON.stringify(orderPayload) });
    assert.equal(firstOrderResponse.status, 201);
    assert.equal(secondOrderResponse.status, 200);
    const firstOrder = await firstOrderResponse.json();
    const secondOrder = await secondOrderResponse.json();
    assert.equal(firstOrder.id, secondOrder.id);
    assert.equal(firstOrder.total, 250);
    assert.match(firstOrder.trackingCode, /^RA-[A-F0-9]{8}$/);
    assert.equal(firstOrder.paymentStatus, 'awaiting_payment');

    const cancelResponse = await fetch(`${baseUrl}/api/orders/${firstOrder.id}/cancel`, { method: 'POST', headers: securedHeaders });
    assert.equal(cancelResponse.status, 200);
    const dismissResponse = await fetch(`${baseUrl}/api/account/orders/${firstOrder.id}`, { method: 'DELETE', headers: securedHeaders });
    assert.equal(dismissResponse.status, 200);
    const accountOrders = await fetch(`${baseUrl}/api/account/orders`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.equal(accountOrders.some(item => item.id === firstOrder.id), false, 'A dismissed unfinished order should leave the account view.');
    const productsAfter = await fetch(`${baseUrl}/api/entities/ShopProduct?limit=10`, { headers: { Cookie: adminCookieHeader } }).then(response => response.json());
    assert.equal(productsAfter.find(item => item.id === product.id).inventory, 2);
  } finally {
    child.kill();
    if (child.exitCode === null) await once(child, 'exit');
    await rm(dataDir, { recursive: true, force: true });
  }
});
