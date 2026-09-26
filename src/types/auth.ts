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

/** Registration never issues tokens: new accounts wait for administrator approval. */
export interface RegisterResponse {
  user: AuthUser & { approvalStatus: ApprovalStatus };
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}
