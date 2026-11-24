import { VerifiedIdentity } from '../../src/auth/auth.types';

export const userA = '11111111-1111-4111-8111-111111111111';
export const userB = '22222222-2222-4222-8222-222222222222';
export const identityA: VerifiedIdentity = {
  userId: userA,
  sessionId: '33333333-3333-4333-8333-333333333333',
  email: null,
  phone: '+919876543210',
  expiresAt: Math.floor(Date.now() / 1000) + 3600,
};
export const identityB: VerifiedIdentity = {
  ...identityA,
  userId: userB,
  sessionId: '55555555-5555-4555-8555-555555555555',
  phone: '+919876543211',
};
