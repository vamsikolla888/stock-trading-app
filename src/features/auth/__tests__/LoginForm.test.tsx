import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';

import { useAuthFlowStore } from '@/features/auth/authFlowStore';
import { LoginForm } from '@/features/auth/components/LoginForm';
import { secureTokens } from '@/lib/storage/secureTokens';
import { authApi } from '@/services/api/authApi';
import { useAuthStore } from '@/store/authStore';
import { ApiError } from '@/types/api';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => false,
  }),
}));

jest.mock('@/services/api/authApi', () => ({
  authApi: { login: jest.fn() },
}));

jest.mock('@/theme/ThemeProvider', () => {
  const { lightColors, palette } = jest.requireActual('@/theme/tokens');
  return { useTheme: () => ({ colors: lightColors, palette, isDark: false }) };
});

const login = authApi.login as jest.MockedFunction<typeof authApi.login>;

function renderForm() {
  // gcTime: Infinity — a finite GC timer would keep Jest alive for 5 minutes after the run.
  const client = new QueryClient({
    defaultOptions: {
      mutations: { retry: false, gcTime: Infinity },
      queries: { gcTime: Infinity },
    },
  });
  return render(
    <QueryClientProvider client={client}>
      <LoginForm />
    </QueryClientProvider>,
  );
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.changeText(screen.getByLabelText('Email'), email);
  fireEvent.changeText(screen.getByLabelText('Password'), password);
  fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
}

beforeEach(async () => {
  jest.clearAllMocks();
  useAuthStore.getState().signOut();
  useAuthFlowStore.setState({ challenge: null, notice: null });
  await secureTokens.clearTokens();
});

describe('LoginForm', () => {
  it('validates before calling the API', async () => {
    renderForm();
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByText('Enter your email address')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(login).not.toHaveBeenCalled();
  });

  it('submits normalised credentials and stores the session', async () => {
    login.mockResolvedValue({
      user: { id: 'u1', email: 'trader@example.com', role: 'user' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
    renderForm();

    fillAndSubmit('  Trader@Example.com ', 'correct-horse');

    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
    expect(login).toHaveBeenCalledWith({ email: 'trader@example.com', password: 'correct-horse' });
    expect(useAuthStore.getState().user?.email).toBe('trader@example.com');
    expect(await secureTokens.getRefreshToken()).toBe('refresh-token');
  });

  it('shows the server reason when sign-in is rejected', async () => {
    login.mockRejectedValue(
      new ApiError({ status: 401, code: 'AUTH_INVALID', message: 'Invalid email or password' }),
    );
    renderForm();

    fillAndSubmit('trader@example.com', 'wrong-password');

    expect(await screen.findByText('Invalid email or password')).toBeTruthy();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('explains a pending approval instead of treating it as a wrong password', async () => {
    login.mockRejectedValue(
      new ApiError({
        status: 401,
        code: 'AUTH_INVALID',
        message: 'Your account is awaiting administrator approval',
      }),
    );
    renderForm();

    fillAndSubmit('new@example.com', 'correct-horse');

    expect(await screen.findByText('Account not active yet')).toBeTruthy();
    expect(screen.getByText('Your account is awaiting administrator approval')).toBeTruthy();
  });

  it('parks a two-factor challenge in memory and opens the code screen', async () => {
    login.mockResolvedValue({
      mfaRequired: true,
      challengeToken: 'c'.repeat(43),
      expiresAt: '2026-10-01T10:05:00.000Z',
    });
    renderForm();

    fillAndSubmit('trader@example.com', 'correct-horse');

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/auth/two-factor'));
    // The password alone is not a session.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(await secureTokens.getRefreshToken()).toBeNull();
    expect(useAuthFlowStore.getState().challenge).toEqual({
      challengeToken: 'c'.repeat(43),
      expiresAt: '2026-10-01T10:05:00.000Z',
      email: 'trader@example.com',
    });
  });

  it('shows a note left by whatever signed the user out, once', async () => {
    useAuthFlowStore.getState().setNotice({
      tone: 'success',
      title: 'Password changed',
      message: 'Sign in with your new password.',
    });
    renderForm();

    expect(await screen.findByText('Password changed')).toBeTruthy();
    expect(useAuthFlowStore.getState().notice).toBeNull();
  });

  it('carries the typed email into forgot-password', () => {
    renderForm();
    fireEvent.changeText(screen.getByLabelText('Email'), 'trader@example.com');
    fireEvent.press(screen.getByText('Forgot password?'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/auth/forgot-password',
      params: { email: 'trader@example.com' },
    });
  });
});
