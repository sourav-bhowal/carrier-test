/**
 * Core interfaces for carrier integration
 * These define contracts that all carriers must implement
 */

import { type RateRequest, type RateResponse, type OAuthToken } from '../types';

/**
 * Authentication provider interface
 * Handles OAuth token acquisition and management
 */
export interface IAuthProvider {
  /**
   * Get a valid access token
   * Handles token caching and automatic refresh
   */
  getToken(): Promise<string>;

  /**
   * Force token refresh
   */
  refreshToken(): Promise<OAuthToken>;

  /**
   * Check if current token is valid
   */
  isTokenValid(): boolean;

  /**
   * Clear cached token
   */
  clearToken(): void;
}

/**
 * Carrier client interface
 * Each carrier (UPS, FedEx, etc.) implements this interface
 */
export interface ICarrierClient {
  /**
   * Get the carrier name
   */
  readonly name: string;

  /**
   * Get shipping rates
   */
  getRates(request: RateRequest): Promise<RateResponse>;

  /**
   * Health check for the carrier service
   */
  healthCheck(): Promise<boolean>;
}

/**
 * HTTP client interface for making API calls
 */
export interface IHttpClient {
  get<T>(url: string, headers?: Record<string, string>): Promise<T>;
  post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  put<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T>;
  delete<T>(url: string, headers?: Record<string, string>): Promise<T>;
}
