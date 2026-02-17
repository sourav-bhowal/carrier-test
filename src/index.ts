/**
 * Carrier Integration Service
 * Main entry point for the shipping carrier integration library
 */

// Core types and interfaces
export type {
  Address,
  Package,
  ServiceLevel,
  RateRequest,
  RateQuote,
  RateResponse,
  OAuthToken,
} from './core/types';

export type {
  IAuthProvider,
  ICarrierClient,
  IHttpClient,
} from './core/interfaces';

// Errors
export {
  CarrierError,
  AuthenticationError,
  ValidationError,
  NetworkError,
  RateLimitError,
  ApiError,
  TimeoutError,
  InvalidResponseError,
  ServiceUnavailableError,
} from './core/errors';

// Carriers
export { UPSClient } from './carriers';
export type { UPSClientConfig } from './carriers';

// Services
export { ShippingService } from './services/shipping.service';

// Configuration
export { config, loadConfig } from './config';
export type { AppConfig } from './config';

// Utilities
export { validate, safeValidate } from './utils/validation';
export { HttpClient } from './utils/http';
