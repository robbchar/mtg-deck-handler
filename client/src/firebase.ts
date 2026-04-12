import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'placeholder-replace-with-actual',
  authDomain: 'robbchar-3db11.firebaseapp.com',
  projectId: 'robbchar-3db11',
  storageBucket: 'robbchar-3db11.appspot.com',
  messagingSenderId: '412261854179',
  appId: '1:412261854179:web:99f5806d1f70a762528ed6',
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
