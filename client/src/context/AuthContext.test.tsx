import { render, screen, waitFor } from '@testing-library/react'
import { vi, beforeEach } from 'vitest'
import { AuthProvider, useAuth } from './AuthContext'

// Mock firebase/auth so tests never touch real Firebase
const { mockOnAuthStateChanged, mockSignInWithPopup, mockSignOut } = vi.hoisted(() => ({
  mockOnAuthStateChanged: vi.fn(),
  mockSignInWithPopup: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: mockOnAuthStateChanged,
  signInWithPopup: mockSignInWithPopup,
  signOut: mockSignOut,
}))

vi.mock('../firebase', () => ({ auth: {} }))

function TestConsumer() {
  const { user, loading } = useAuth()
  if (loading) return <div>loading</div>
  return <div>{user ? `user:${user.email}` : 'no-user'}</div>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthProvider', () => {
  it('shows loading while auth state is being determined', () => {
    mockOnAuthStateChanged.mockImplementation(() => () => {}) // never resolves
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('provides user when signed in', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: unknown) => void) => {
      callback({ email: 'robbchar@gmail.com', uid: 'user-1' })
      return () => {}
    })
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByText('user:robbchar@gmail.com')).toBeInTheDocument()
    })
  })

  it('provides null user when signed out', async () => {
    mockOnAuthStateChanged.mockImplementation((_auth: unknown, callback: (user: null) => void) => {
      callback(null)
      return () => {}
    })
    render(<AuthProvider><TestConsumer /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByText('no-user')).toBeInTheDocument()
    })
  })
})
