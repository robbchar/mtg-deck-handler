'use strict';

const mockVerifyIdToken = jest.fn();

jest.mock('firebase-admin', () => ({
  apps: ['existing-app'], // simulate already initialised
  auth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

const { requireAuth } = require('./auth');

function makeRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('requireAuth middleware', () => {
  it('calls next() when a valid Bearer token is supplied', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'user-1', email: 'robbchar@gmail.com' });
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual({ uid: 'user-1', email: 'robbchar@gmail.com' });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token expired'));
    const req = { headers: { authorization: 'Bearer bad-token' } };
    const res = makeRes();
    const next = jest.fn();

    await requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid token' });
    expect(next).not.toHaveBeenCalled();
  });
});
