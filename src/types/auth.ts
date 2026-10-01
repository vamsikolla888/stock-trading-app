export type UserRole = 'user' | 'admin';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/** The user as the server returns it on login (server login-user.use-case.ts). */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface Credentials {
  email: string;
  password: string;
}

export type LoginRequest = Credentials;
export type RegisterRequest = Credentials;

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}

/**
 * What /auth/login answers when the account has two-factor authentication on: the password
 * was right, but no session exists yet. The challenge is exchanged at /auth/mfa/verify with a
 * six-digit authenticator code or a recovery code; it expires after five minutes and locks
 * after five wrong codes (server mfa.service.ts).
 */
export interface MfaChallenge {
  mfaRequired: true;
  challengeToken: string;
  expiresAt: string;
}

/** /auth/login — a session, or a second-factor challenge. */
export type LoginResult = LoginResponse | MfaChallenge;

export function isMfaChallenge(result: LoginResult): result is MfaChallenge {
  return 'mfaRequired' in result && result.mfaRequired === true;
}

/** Registration never issues tokens: new accounts wait for administrator approval. */
export interface RegisterResponse {
  user: AuthUser & { approvalStatus: ApprovalStatus };
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
