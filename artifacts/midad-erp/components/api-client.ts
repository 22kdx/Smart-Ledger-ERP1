import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import {
  customFetch,
  setBaseUrl,
  setRequireBaseUrl,
} from '@workspace/api-client-react';

const API_CONFIG_STORAGE_KEY = '@midad-erp/api-config-v1';
const API_CONFIG_FILE_MAX_BYTES = 16 * 1024;

export type ApiConfig = {
  API_BASE_URL: string;
};

export type ApiClientState = {
  API_BASE_URL: string | null;
  error: string | null;
};

type HealthStatus = {
  status: string;
};

let state: ApiClientState = { API_BASE_URL: null, error: null };
let initializationPromise: Promise<ApiClientState> | null = null;

setRequireBaseUrl(true);

function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('يجب أن يحتوي الملف على عنوان API_BASE_URL.');
  }

  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error('صيغة API_BASE_URL غير صالحة.');
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('يجب أن يبدأ العنوان بـ https:// أو http://.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('لا تضع بيانات دخول أو معاملات في API_BASE_URL.');
  }

  const path = parsed.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/api')) {
    throw new Error('اجعل نهاية API_BASE_URL هي /api.');
  }

  return `${parsed.origin}${path}`;
}

function parseApiConfig(contents: string): ApiConfig {
  if (contents.length > API_CONFIG_FILE_MAX_BYTES) {
    throw new Error('ملف الإعداد أكبر من الحجم المسموح.');
  }

  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('ملف الإعداد ليس JSON صالحًا.');
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('يجب أن يكون ملف الإعداد كائن JSON.');
  }

  const baseUrl = normalizeApiBaseUrl(
    (value as Record<string, unknown>).API_BASE_URL,
  );
  return { API_BASE_URL: baseUrl };
}

export function initializeApiClient(): Promise<ApiClientState> {
  if (!initializationPromise) {
    initializationPromise = (async () => {
      try {
        const savedConfig = await AsyncStorage.getItem(API_CONFIG_STORAGE_KEY);
        if (!savedConfig) {
          state = { API_BASE_URL: null, error: null };
          setBaseUrl(null);
          return state;
        }

        const config = parseApiConfig(savedConfig);
        state = { API_BASE_URL: config.API_BASE_URL, error: null };
        setBaseUrl(config.API_BASE_URL);
        return state;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'تعذر قراءة إعداد الخادم.';
        state = { API_BASE_URL: null, error: message };
        setBaseUrl(null);
        return state;
      }
    })();
  }

  return initializationPromise;
}

export async function getApiClientState(): Promise<ApiClientState> {
  return initializeApiClient();
}

async function readPickedFile(uri: string, file?: File): Promise<string> {
  if (Platform.OS === 'web' && file) {
    return file.text();
  }
  return FileSystem.readAsStringAsync(uri);
}

export async function importApiConfigFile(): Promise<ApiClientState | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;

  const asset = result.assets[0];
  if (!asset.name.toLowerCase().endsWith('.json')) {
    throw new Error('اختر ملف إعداد بامتداد .json.');
  }

  const contents = await readPickedFile(asset.uri, asset.file);
  const config = parseApiConfig(contents);
  const savedConfig = JSON.stringify(config);

  await AsyncStorage.setItem(API_CONFIG_STORAGE_KEY, savedConfig);
  state = { API_BASE_URL: config.API_BASE_URL, error: null };
  setBaseUrl(config.API_BASE_URL);
  initializationPromise = Promise.resolve(state);
  return state;
}

export async function checkApiHealth(): Promise<HealthStatus> {
  const config = await getApiClientState();
  if (config.error) throw new Error(config.error);
  if (!config.API_BASE_URL) {
    throw new Error('استورد ملف إعداد الخادم أولًا.');
  }
  return customFetch<HealthStatus>('/healthz', { responseType: 'json' });
}
