# Secure chat deployment

The chat now encrypts one-to-one text messages in the browser with signed per-device P-256 identity/agreement keys and AES-256-GCM message envelopes. Private keys remain non-exportable `CryptoKey` objects in IndexedDB; the server stores public bundles and opaque ciphertext only. Previously sent plaintext messages and uploaded attachments are not retroactively encrypted.

Do not advertise the system as independently audited end-to-end encryption until a qualified external cryptography review has covered the protocol, browser key lifecycle, metadata exposure, device verification/revocation, attachment encryption, recovery, and the deployed build/supply chain. The capability endpoint deliberately reports `independentlyAuditedE2EE: false` until that work is complete.

For reliable production calls, configure `TURN_URLS` and either:

- `TURN_SHARED_SECRET` for one-hour coturn-compatible credentials; or
- `TURN_USERNAME` and `TURN_CREDENTIAL` for provider-issued static credentials.

`STUN_URLS` alone permits direct WebRTC connections but will fail on some carrier networks, symmetric NATs, and restrictive firewalls. `/api/chat/rtc-config` reports whether TURN is active without exposing the shared secret.

Web push requires `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`. Incoming-call pushes open the exact conversation/call, while the server retains signaling until the recipient connects and marks unanswered ringing calls as missed after 45 seconds.
