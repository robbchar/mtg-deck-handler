import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

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
