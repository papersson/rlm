/**
 * Branded primitive types for compile-time safety.
 * These types use TypeScript's structural typing to create nominal types
 * that cannot be accidentally mixed up at compile time.
 * @module types/branded
 */

// Brand symbols for nominal typing
declare const PositiveIntBrand: unique symbol;
declare const NonEmptyStringBrand: unique symbol;
declare const TimestampBrand: unique symbol;
declare const Sha256HashBrand: unique symbol;

/**
 * A positive integer (> 0).
 * Used for counts, limits, and other values that must be positive.
 */
export type PositiveInt = number & {
  readonly [PositiveIntBrand]: typeof PositiveIntBrand;
};

/**
 * A non-empty string (length > 0).
 * Used for required string fields that cannot be empty.
 */
export type NonEmptyString = string & {
  readonly [NonEmptyStringBrand]: typeof NonEmptyStringBrand;
};

/**
 * A Unix timestamp in milliseconds.
 * Used for timing and duration tracking.
 */
export type Timestamp = number & {
  readonly [TimestampBrand]: typeof TimestampBrand;
};

/**
 * A SHA-256 hash string (64 hex characters).
 * Used for context integrity verification.
 */
export type Sha256Hash = string & {
  readonly [Sha256HashBrand]: typeof Sha256HashBrand;
};

/**
 * Create a PositiveInt from a number.
 * @throws Error if the number is not a positive integer
 */
export function positiveInt(n: number): PositiveInt {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`Expected positive integer, got ${n}`);
  }
  return n as PositiveInt;
}

/**
 * Create a NonEmptyString from a string.
 * @throws Error if the string is empty
 */
export function nonEmptyString(s: string): NonEmptyString {
  if (s.length === 0) {
    throw new Error('Expected non-empty string');
  }
  return s as NonEmptyString;
}

/**
 * Create a Timestamp from a number.
 * @throws Error if the number is negative
 */
export function timestamp(t: number): Timestamp {
  if (t < 0) {
    throw new Error(`Expected non-negative timestamp, got ${t}`);
  }
  return t as Timestamp;
}

/**
 * Create a Timestamp for the current time.
 */
export function now(): Timestamp {
  return Date.now() as Timestamp;
}

/**
 * Create a Sha256Hash from a string.
 * @throws Error if the string is not a valid SHA-256 hash
 */
export function sha256Hash(s: string): Sha256Hash {
  if (!/^[a-f0-9]{64}$/i.test(s)) {
    throw new Error(`Expected SHA-256 hash (64 hex chars), got ${s.length} chars`);
  }
  return s.toLowerCase() as Sha256Hash;
}

/**
 * Type guard for PositiveInt
 */
export function isPositiveInt(n: number): n is PositiveInt {
  return Number.isInteger(n) && n > 0;
}

/**
 * Type guard for NonEmptyString
 */
export function isNonEmptyString(s: string): s is NonEmptyString {
  return s.length > 0;
}

/**
 * Type guard for Timestamp
 */
export function isTimestamp(t: number): t is Timestamp {
  return t >= 0;
}

/**
 * Type guard for Sha256Hash
 */
export function isSha256Hash(s: string): s is Sha256Hash {
  return /^[a-f0-9]{64}$/i.test(s);
}
