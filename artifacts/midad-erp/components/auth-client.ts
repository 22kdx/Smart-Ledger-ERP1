import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  getCurrentAuthUser,
  loginAuthUser,
  logoutAuthUser,
  refreshAuthSession,
  registerAuthUser,
  setAuthTokenGetter,
} from '@workspace/api-client-react';

const REFRESH_TOKEN_KEY = '@midad-erp/auth-refresh-v1';
const REFRESH_BEFORE_EXPIRY_MS = 30_000;

type AuthSession = Awaited<ReturnType<typeof loginAuthUser>>;
type AuthUserResponse = Awaited<ReturnType<typeof getCurrentAuthUser>>;

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;
let refreshInFlight: Promise<string | null> | null = null;

export function configureAuthClient(): void {
  setAuthTokenGetter(getToken);
}

export async function getToken(): Promise<string | null> {
  if (
    accessToken &&
    accessTokenExpiresAt > Date.now() + REFRESH_BEFORE_EXPIRY_MS
  ) {
    return accessToken;
  }
  if (!supportsSecureTokenStorage()) return null;
  if (!refreshInFlight) {
    refreshInFlight = refreshFromStoredToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function refresh(): Promise<string | null> {
  if (!supportsSecureTokenStorage()) {
    throw new Error('secure_token_storage_unavailable');
  }
  if (!refreshInFlight) {
    refreshInFlight = refreshFromStoredToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function register(input: {
  email: string;
  password: string;
  displayName: string;
}): Promise<AuthSession> {
  assertSecureTokenStorage();
  const session = await registerAuthUser(input, { skipAuth: true });
  await saveSession(session);
  return session;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  assertSecureTokenStorage();
  const session = await loginAuthUser(input, { skipAuth: true });
  await saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  const refreshToken = supportsSecureTokenStorage()
    ? await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    : null;

  try {
    if (refreshToken) {
      await logoutAuthUser({ refreshToken }, { skipAuth: true });
    }
  } finally {
    accessToken = null;
    accessTokenExpiresAt = 0;
    if (supportsSecureTokenStorage()) {
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    }
  }
}

export async function currentUser(): Promise<AuthUserResponse['user']> {
  const response = await getCurrentAuthUser();
  return response.user;
}

export const authClient = {
  getToken,
  refresh,
  logout,
  currentUser,
  register,
  login,
};

async function refreshFromStoredToken(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  if (!refreshToken) {
    accessToken = null;
    accessTokenExpiresAt = 0;
    return null;
  }

  try {
    const session = await refreshAuthSession(
      { refreshToken },
      { skipAuth: true },
    );
    await saveSession(session);
    return session.accessToken;
  } catch (error) {
    if (getHttpStatus(error) === 401) {
      accessToken = null;
      accessTokenExpiresAt = 0;
      await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      return null;
    }
    throw error;
  }
}

async function saveSession(session: AuthSession): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken);
  accessToken = session.accessToken;
  accessTokenExpiresAt = Date.now() + session.expiresIn * 1000;
}

function supportsSecureTokenStorage(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function assertSecureTokenStorage(): void {
  if (!supportsSecureTokenStorage()) {
    throw new Error('secure_token_storage_unavailable');
  }
}

function getHttpStatus(error: unknown): number | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  ) {
    return (error as { status: number }).status;
  }
  return null;
}
