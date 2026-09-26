type ClassValue = string | number | null | boolean | undefined | ClassValue[];

function flatten(inputs: ClassValue[], out: string[]): void {
  for (const input of inputs) {
    if (!input && input !== 0) continue;
    if (Array.isArray(input)) {
      flatten(input, out);
    } else {
      out.push(String(input));
    }
  }
}

/** Lightweight `clsx`-style class name joiner used with NativeWind's `className` prop. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  flatten(inputs, out);
  return out.join(' ');
}
