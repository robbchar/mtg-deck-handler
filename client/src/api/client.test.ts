import { vi, beforeEach, describe, it, expect } from 'vitest'

const mockGetIdToken = vi.fn()

vi.mock('../firebase', () => ({
  auth: {
    get currentUser() {
      return mockGetIdToken.mock.calls.length >= 0
        ? { getIdToken: mockGetIdToken }
        : null
    },
  },
}))

// Import after mocks are set up — assigned for side effect (interceptor re-registration)
let _client: typeof import('./client').default
let capturedInterceptor: ((config: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null

vi.mock('axios', () => {
  const interceptorUse = vi.fn((fn: (config: Record<string, unknown>) => Promise<Record<string, unknown>>) => {
    capturedInterceptor = fn
  })
  return {
    default: {
      create: vi.fn(() => ({
        interceptors: { request: { use: interceptorUse } },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      })),
    },
  }
})

beforeEach(async () => {
  vi.clearAllMocks()
  capturedInterceptor = null
  vi.resetModules()
  // Re-import to re-register interceptor
  const mod = await import('./client')
  _client = mod.default
})

describe('api/client interceptor', () => {
  it('attaches Authorization header when user has a valid token', async () => {
    mockGetIdToken.mockResolvedValue('test-token-abc')
    const config = { headers: {} as Record<string, string> }
    const result = await capturedInterceptor!(config)
    expect((result as typeof config).headers.Authorization).toBe('Bearer test-token-abc')
  })

  it('does not attach Authorization header when no token', async () => {
    mockGetIdToken.mockResolvedValue(undefined)
    const config = { headers: {} as Record<string, string> }
    const result = await capturedInterceptor!(config)
    expect((result as typeof config).headers.Authorization).toBeUndefined()
  })

  it('proceeds without header when getIdToken throws', async () => {
    mockGetIdToken.mockRejectedValue(new Error('network error'))
    const config = { headers: {} as Record<string, string> }
    const result = await capturedInterceptor!(config)
    expect((result as typeof config).headers.Authorization).toBeUndefined()
    // config is returned even on error
    expect(result).toBe(config)
  })
})
