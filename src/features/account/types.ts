// Mirrored from the web client (features/account/services/account.service.ts), which mirrors
// server/src/modules/account/account.service.ts, auth-session.service.ts and mfa.service.ts.

export interface AccountProfile {
  id: string;
  email: string;
  displayName: string;
  phone: string;
  bio: string;
  /** Server-relative (`/images/profiles/…`), served from the API origin; null = no photo. */
  avatarUrl: string | null;
  role: 'user' | 'admin';
  approvalStatus: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
}

export type ProfileFields = Pick<AccountProfile, 'displayName' | 'phone' | 'bio'>;

export interface MfaStatus {
  enabled: boolean;
  enabledAt: string | null;
  recoveryCodesRemaining: number;
}

export type AuthenticationMethod = 'password' | 'authenticator' | 'recovery-code';

/** One signed-in device. Each is independent: signing one out leaves the rest alone. */
export interface AccountSession {
  id: string;
  status: 'active' | 'revoked';
  authenticationMethod: AuthenticationMethod;
  deviceName: string;
  browser: string;
  operatingSystem: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  current: boolean;
}

export interface AccountSecurity {
  mfa: MfaStatus;
  sessions: AccountSession[];
}

/** POST /account/mfa/setup — valid for ten minutes. */
export interface MfaSetup {
  setupToken: string;
  /** Base32 — what an authenticator asks for when the QR code cannot be scanned. */
  secret: string;
  /** otpauth:// — opens an installed authenticator app directly on this phone. */
  otpauthUri: string;
  /** data:image/png;base64 — for setting up an authenticator on another device. */
  qrCodeDataUrl: string;
  expiresAt: string;
}

export interface EmailChangeResult {
  profile: AccountProfile;
  accessToken: string;
  refreshToken: string;
}
