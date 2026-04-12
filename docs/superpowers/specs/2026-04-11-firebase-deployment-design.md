# Firebase Deployment Design

**Date:** 2026-04-11  
**Status:** Approved  
**Firebase Project:** `robbchar-3db11`  
**App ID:** `1:412261854179:web:99f5806d1f70a762528ed6`

---

## Goal

Deploy the MTG Deck Handler (React/Vite frontend + Express API) to Firebase, migrating from file-based local storage to Firestore, with Google Sign-In restricted to the admin email. All tests must remain fully offline — no live Firebase calls during CI.

---

## Architecture Overview

```
Browser
  └── Firebase Hosting (SPA, cdn)
        ├── static assets  →  serves directly
        └── /api/*         →  rewrite → Cloud Functions: api
                                   └── Express app (unchanged)
                                         └── Firestore (via Admin SDK)

Local dev:
  npm run dev  →  Firebase Emulator Suite
    - Auth emulator       :9099
    - Firestore emulator  :8080
    - Functions emulator  :5001
  Vite dev server proxies /api/* → local Functions emulator
```

**Services used:**
| Service | Role |
|---|---|
| Firebase Hosting | Serve the React SPA; rewrite `/api/*` to the Cloud Function |
| Cloud Functions (1 function: `api`) | Wrap the entire Express app |
| Firestore | Replace file-based JSON storage |
| Firebase Auth | Google Sign-In, restricted to `robbchar@gmail.com` |

**Firestore rules** are managed centrally in `firebase-robbchar-config`. The MTG app only manages its own namespace:

```
match /mtg-deck-handler/{document=**} {
  allow read, write: if isAdminEmail();
}
```

---

## Backend Changes

### 1. Cloud Functions entry point

A new `server/functions/index.js` (or `.ts`) exports the Express app as a single Cloud Function:

```js
const functions = require('firebase-functions')
const app = require('../index')   // existing Express app

exports.api = functions.https.onRequest(app)
```

The existing Express routes, middleware, and error handlers remain unchanged.

### 2. `db.js` abstraction layer

All data access goes through a single module (`server/services/db.js`). Services never import from `firebase-admin` directly — they import from `db.js`. This gives tests a single mock point:

```js
// server/services/db.js
const admin = require('firebase-admin')
const db = admin.firestore()

module.exports = { db }
```

In tests:

```js
jest.mock('../services/db', () => ({ db: mockFirestore }))
```

### 3. Firestore data model

```
mtg-deck-handler/
  decks/
    {deckId}/          ← deck document (name, format, notes, card_count, updated_at)
      games/
        {gameId}/      ← game document (result, turn_ended, opponent_colors, …)
      cards/
        {cardId}/      ← card document (name, quantity, …)
```

### 4. Auth middleware

All API routes (except health check) require a valid Firebase ID token:

```js
// server/middleware/auth.js
const admin = require('firebase-admin')

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.split('Bearer ')[1]
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  try {
    req.user = await admin.auth().verifyIdToken(token)
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}
```

### 5. Test strategy for backend

- All tests mock `../services/db` — Firestore is never called in CI.
- Auth middleware is mocked or bypassed in route tests.
- The `db.js` abstraction is the only change to how tests interact with data.

---

## Frontend Changes

### 1. Firebase Auth wrapper

A `useAuth` hook (or `AuthContext`) wraps Firebase Auth. The app renders a Google Sign-In button when unauthenticated and gates all content behind auth. After sign-in, every API call includes `Authorization: Bearer <idToken>` via an Axios interceptor.

### 2. Axios interceptor

```ts
// client/src/api/client.ts
import { getAuth } from 'firebase/auth'

axiosInstance.interceptors.request.use(async (config) => {
  const token = await getAuth().currentUser?.getIdToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
```

### 3. Frontend tests

Firebase Auth is mocked entirely — no live Firebase SDK calls in tests:

```ts
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(), ... }))
```

---

## Local Development

`package.json` (root) scripts updated so `npm run dev` starts the Firebase Emulator Suite alongside Vite:

```jsonc
"dev": "concurrently \"firebase emulators:start --only auth,firestore,functions\" \"npm run dev --workspace=client\"",
"dev:client-only": "npm run dev --workspace=client"  // escape hatch
```

`FIREBASE_EMULATOR_HOST` / `FIRESTORE_EMULATOR_HOST` env vars are set automatically by the emulator; the Admin SDK picks them up with no code changes needed when `process.env.NODE_ENV !== 'production'`.

Vite dev proxy in `client/vite.config.ts`:

```ts
server: {
  proxy: {
    '/api': 'http://localhost:5001/robbchar-3db11/us-central1/api'
  }
}
```

---

## Data Migration

A one-time script (`scripts/migrate-to-firestore.js`) reads the existing local JSON files and writes them to Firestore. It is idempotent (uses deck/game IDs as document IDs). Run once manually with production credentials; not part of the regular deploy pipeline.

---

## Deployment

```
firebase deploy --only hosting,functions --project robbchar-3db11
```

Firestore rules are deployed separately from `firebase-robbchar-config`:

```
firebase deploy --only firestore:rules --project robbchar-3db11
```

CI (`test-client.yml`, `test-server.yml`) remains unchanged — tests never touch Firebase.

---

## Out of Scope

- Multi-user support (single admin email only)
- Offline/PWA support beyond what's already present
- Card image caching in Firebase Storage
- Any UI changes beyond the auth gate
