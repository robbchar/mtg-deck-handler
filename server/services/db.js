'use strict';

const admin = require('firebase-admin');

// initializeApp is idempotent — safe to call on every require.
// In Cloud Functions the SDK auto-configures from the runtime environment.
// With emulators the FIRESTORE_EMULATOR_HOST env var is set automatically.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

module.exports = { db };
