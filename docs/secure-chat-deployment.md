# Secure chat deployment

The chat now encrypts one-to-one text messages and newly uploaded private-chat attachments in the browser with signed per-device P-256 identity/agreement keys and AES-256-GCM envelopes. Attachment bytes use a separate random AES-256-GCM key whose key, IV, original filename, MIME type, size, and caption are included only in the recipient-device envelope. Private identity keys remain non-exportable `CryptoKey` objects in IndexedDB; the server stores public bundles and opaque ciphertext only. Previously sent plaintext messages and attachments are not retroactively encrypted. Announcements and externally imported/shareable media remain outside the private-chat encryption boundary.

Server-side malware scanners cannot inspect encrypted attachment contents. Keep attachment size/type controls in the client, use safe browser rendering/download behavior, and include this limitation in the external security review and product risk assessment.

Plain attachments are fail-closed when `MALWARE_SCAN_URL` is configured: a scanner outage rejects the upload, and a malware verdict prevents storage. End-to-end encrypted attachments remain marked `client-encrypted`; the server cannot honestly claim to scan ciphertext. Voice-note compatibility delivery is not E2EE and therefore passes through the configured scanner.

Do not advertise the system as independently audited end-to-end encryption until a qualified external cryptography review has covered the protocol, browser key lifecycle, metadata exposure, device verification/revocation, attachment encryption, recovery, and the deployed build/supply chain. The capability endpoint deliberately reports `independentlyAuditedE2EE: false` until that work is complete.

Run `npm run chat:configure-local` once to generate VAPID credentials into the ignored local `.env` file without printing secret values. Copy those three `VAPID_*` values into the production service's secret environment settings; do not commit `.env`.

For reliable production calls with self-hosted coturn or a conventional provider, configure `TURN_URLS` and either:

- `TURN_SHARED_SECRET` for one-hour coturn-compatible credentials; or
- `TURN_USERNAME` and `TURN_CREDENTIAL` for provider-issued static credentials.

For Cloudflare Realtime TURN, configure `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` instead of the `TURN_*` values. The backend keeps these long-term secrets private, requests a separate 24-hour ICE credential for each signed-in user, caches it for 23 hours, and returns only the short-lived ICE configuration to the browser.

`STUN_URLS` alone permits direct WebRTC connections but will fail on some carrier networks, symmetric NATs, and restrictive firewalls. `/api/chat/rtc-config` reports whether TURN is active without exposing the shared secret.

For coturn REST credentials, configure a public coturn instance with TLS, long-term credential support, `use-auth-secret`, and the same high-entropy secret in both coturn's `static-auth-secret` and the app's `TURN_SHARED_SECRET`. `TURN_URLS` should include UDP, TCP, and TLS endpoints when the provider supports them, for example `turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp`. The TURN host must expose its listener ports and configured UDP relay-port range; an ordinary HTTP-only web service is not sufficient.

Web push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Incoming-call pushes open the exact conversation/call, while the server retains signaling until the recipient connects and marks unanswered ringing calls as missed after 45 seconds.
