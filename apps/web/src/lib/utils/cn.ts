/**
 * Tiny className combiner. Filters out falsy values and joins with spaces.
 * Kept dependency-free (no clsx/tailwind-merge) to stay lightweight for the
 * low-bandwidth target (ARCH.md §3).
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
