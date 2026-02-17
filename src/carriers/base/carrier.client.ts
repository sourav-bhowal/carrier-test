/**
 * Base carrier client implementation
 * Provides common functionality for all carriers
 */

import { type ICarrierClient } from '../../core/interfaces';
import { type RateRequest, type RateResponse } from '../../core/types';
import { ServiceUnavailableError } from '../../core/errors';

/**
 * Abstract base class for carrier implementations
 * Extend this for each carrier (UPS, FedEx, etc.)
 */
export abstract class BaseCarrierClient implements ICarrierClient {
  abstract readonly name: string;

  abstract getRates(request: RateRequest): Promise<RateResponse>;

  /**
   * Default health check implementation
   * Override in specific carriers if they provide a health endpoint
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Simple ping test - try to get rates with minimal request
      // In production, use a dedicated health endpoint if available
      return true;
    } catch (error) {
      if (error instanceof ServiceUnavailableError) {
        return false;
      }
      // Other errors don't necessarily mean unhealthy
      return true;
    }
  }

  /**
   * Utility method for logging (can be extended with proper logger)
   */
  protected log(level: 'info' | 'warn' | 'error', message: string, data?: unknown): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.name}] [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      console[level](logMessage, data);
    } else {
      console[level](logMessage);
    }
  }
}
