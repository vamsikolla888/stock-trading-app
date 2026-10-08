/**
 * The JSON primitives every platform-strategy normalizer reads with: a value is the type it
 * claims or the neutral fallback, never `undefined` mid-render. Shared by houseNormalize.ts
 * (the daily swing) and intradayNormalize.ts (Bollinger Mid-Band Thrust).
 */

export type Json = Record<string, unknown>;

export const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const obj = (value: unknown): Json => (isObj(value) ? value : {});
export const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
export const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
export const str = (value: unknown): string => text(value) ?? '';
export const strings = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');
export const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
export const count = (value: unknown): number => Math.max(0, Math.round(num(value) ?? 0));
export const bool = (value: unknown): boolean => value === true;
export const numbers = (value: unknown): number[] =>
  list(value).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));

export function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/** Each item through `parse`, the ones it rejects (null) dropped. */
export function rows<T>(value: unknown, parse: (item: unknown) => T | null): T[] {
  return list(value)
    .map(parse)
    .filter((item): item is T => item !== null);
}
