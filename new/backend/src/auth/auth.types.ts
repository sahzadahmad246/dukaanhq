import { FastifyRequest } from 'fastify';

export interface VerifiedIdentity {
  readonly userId: string;
  readonly sessionId: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly expiresAt: number;
}
export interface AuthRequest extends FastifyRequest {
  identity: VerifiedIdentity;
  accessToken: string;
}
export interface ProviderUser {
  id: string;
  email?: string;
  phone?: string;
  phone_confirmed_at?: string;
  new_phone?: string;
}
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  expires_in: number;
  expires_at: number;
}
