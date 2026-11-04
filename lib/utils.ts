import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const CJK_REGEX = /[一-鿿]/;

/**
 * Utility for conditionally joining class names together
 * Uses clsx for conditional classes and tailwind-merge to handle Tailwind conflicts
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Returns true when the given text contains CJK Unified Ideographs.
 */
export function isCJK(text: string): boolean {
  return CJK_REGEX.test(text);
}

/**
 * Formats a person's full name according to CJK vs. Western ordering conventions.
 */
export function formatFullName(first: string, last: string): string {
  return isCJK(first) || isCJK(last) ? `${last}${first}` : `${first} ${last}`;
}
