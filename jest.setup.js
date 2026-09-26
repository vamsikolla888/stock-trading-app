/* eslint-disable @typescript-eslint/no-require-imports */
// @testing-library/react-native v12.4+ ships Jest matchers built in — no separate import needed.

jest.mock('react-native-mmkv', () => {
  const store = new Map();
  return {
    createMMKV: jest.fn().mockImplementation(() => ({
      set: (key, value) => store.set(key, value),
      getString: (key) => store.get(key),
      getBoolean: (key) => store.get(key),
      getNumber: (key) => store.get(key),
      remove: (key) => store.delete(key),
      clearAll: () => store.clear(),
      contains: (key) => store.has(key),
    })),
  };
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn().mockResolvedValue(true),
  isEnrolledAsync: jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));
