import axios from 'axios'
import { auth } from '../firebase'

const client = axios.create()

client.interceptors.request.use(async (config) => {
  try {
    // getIdToken() auto-refreshes when within 5 min of expiry (Firebase default).
    // Force-refresh (getIdToken(true)) would add a network round-trip on every request.
    const token = await auth.currentUser?.getIdToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (err) {
    // Token fetch failed (offline, revoked). Proceed without auth header;
    // the server will return 401 which the caller can handle.
    console.error('Failed to get Firebase ID token:', err)
  }
  return config
})

export default client
