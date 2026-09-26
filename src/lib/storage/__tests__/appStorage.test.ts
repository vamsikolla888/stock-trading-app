/* eslint-disable @typescript-eslint/no-require-imports */

function loadIn(executionEnvironment: 'storeClient' | 'bare') {
  let loaded!: typeof import('@/lib/storage/appStorage');
  // One shared fake per backend: the module requires them lazily, after isolateModules has
  // returned, so a factory creating fresh objects would hand the test a different instance.
  const asyncValues = new Map<string, string>();
  const AsyncStorage = {
    getItem: jest.fn(async (key: string) => asyncValues.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => void asyncValues.set(key, value)),
    removeItem: jest.fn(async (key: string) => void asyncValues.delete(key)),
  };
  const createMMKV = jest.fn(() => {
    const store = new Map<string, string>();
    return {
      getString: (key: string) => store.get(key),
      set: (key: string, value: string) => store.set(key, value),
      remove: (key: string) => store.delete(key),
    };
  });
  jest.isolateModules(() => {
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { executionEnvironment },
      ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
    }));
    jest.doMock('react-native-mmkv', () => ({ createMMKV }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({
      __esModule: true,
      default: AsyncStorage,
    }));
    loaded = require('@/lib/storage/appStorage');
  });
  return { ...loaded, createMMKV, AsyncStorage };
}

describe('appStorage', () => {
  it('uses AsyncStorage in Expo Go and never loads MMKV there', async () => {
    const { appStorage, initStorage, isExpoGo, createMMKV, AsyncStorage } = loadIn('storeClient');

    expect(isExpoGo).toBe(true);
    await initStorage();
    await appStorage.setItem('theme', 'dark');

    expect(await appStorage.getItem('theme')).toBe('dark');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
    expect(createMMKV).not.toHaveBeenCalled();
  });

  it('uses encrypted MMKV in real builds', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('k'.repeat(64));
    const { appStorage, isExpoGo, createMMKV, AsyncStorage } = loadIn('bare');

    expect(isExpoGo).toBe(false);
    await appStorage.setItem('theme', 'light');

    expect(await appStorage.getItem('theme')).toBe('light');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    expect(createMMKV).toHaveBeenCalledWith({ id: 'app-storage', encryptionKey: 'k'.repeat(64) });
    await appStorage.removeItem('theme');
    expect(await appStorage.getItem('theme')).toBeNull();
  });

  it('retries after a failed Keychain read instead of failing forever', async () => {
    const SecureStore = require('expo-secure-store');
    (SecureStore.getItemAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('Keychain locked'))
      .mockResolvedValue('k'.repeat(64));
    const { appStorage, initStorage } = loadIn('bare');

    await expect(initStorage()).rejects.toThrow('Keychain locked');
    await appStorage.setItem('theme', 'dark');
    expect(await appStorage.getItem('theme')).toBe('dark');
  });
});
