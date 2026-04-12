import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY
if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY is required — set it in your .env file')

const firebaseConfig = {
  apiKey,
  authDomain: 'robbchar-3db11.firebaseapp.com',
  projectId: 'robbchar-3db11',
  storageBucket: 'robbchar-3db11.appspot.com',
  messagingSenderId: '412261854179',
  appId: '1:412261854179:web:99f5806d1f70a762528ed6',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// In dev, point the client SDK at the local Auth emulator so that tokens issued
// by the emulator can be verified by firebase-admin (which also targets the emulator
// via FIREBASE_AUTH_EMULATOR_HOST set automatically by `firebase emulators:start`).
if (import.meta.env.DEV) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true })
}
