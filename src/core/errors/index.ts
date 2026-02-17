/**
 * Custom error classes for structured error handling
 */

/**
 * Base error class for all carrier integration errors
 */
export class CarrierError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'CarrierError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Authentication/authorization errors
 */
export class AuthenticationError extends CarrierError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', 401, details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Validation errors for invalid input
 */
export class ValidationError extends CarrierError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Network or connectivity errors
 */
export class NetworkError extends CarrierError {
  constructor(message: string, details?: unknown) {
    super(message, 'NETWORK_ERROR', 503, details);
    this.name = 'NetworkError';
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends CarrierError {
  constructor(message: string, retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

/**
 * API response errors (4xx, 5xx)
 */
export class ApiError extends CarrierError {
  constructor(
    message: string,
    statusCode: number,
    public readonly responseBody?: unknown
  ) {
    super(message, 'API_ERROR', statusCode, responseBody);
    this.name = 'ApiError';
  }
}

/**
 * Timeout errors
 */
export class TimeoutError extends CarrierError {
  constructor(message: string = 'Request timed out') {
    super(message, 'TIMEOUT_ERROR', 408);
    this.name = 'TimeoutError';
  }
}

/**
 * Invalid or malformed response errors
 */
export class InvalidResponseError extends CarrierError {
  constructor(message: string, details?: unknown) {
    super(message, 'INVALID_RESPONSE_ERROR', 502, details);
    this.name = 'InvalidResponseError';
  }
}

/**
 * Service not available errors
 */
export class ServiceUnavailableError extends CarrierError {
  constructor(message: string = 'Service temporarily unavailable') {
    super(message, 'SERVICE_UNAVAILABLE', 503);
    this.name = 'ServiceUnavailableError';
  }
}
