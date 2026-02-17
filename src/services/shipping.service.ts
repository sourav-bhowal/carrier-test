/**
 * Main Shipping Service
 * Orchestrates multiple carriers and provides a unified interface
 */

import type { ICarrierClient } from '../core/interfaces';
import type { RateRequest, RateResponse } from '../core/types';
import { ValidationError } from '../core/errors';
import { validate, RateRequestSchema } from '../utils/validation';

/**
 * Shipping Service
 * Main entry point for shipping operations
 */
export class ShippingService {
  private carriers: Map<string, ICarrierClient> = new Map();

  /**
   * Register a carrier client
   */
  registerCarrier(carrier: ICarrierClient): void {
    this.carriers.set(carrier.name.toLowerCase(), carrier);
  }

  /**
   * Get a specific carrier by name
   */
  getCarrier(name: string): ICarrierClient | undefined {
    return this.carriers.get(name.toLowerCase());
  }

  /**
   * Get all registered carriers
   */
  getAllCarriers(): ICarrierClient[] {
    return Array.from(this.carriers.values());
  }

  /**
   * Get rates from a specific carrier
   */
  async getRates(carrierName: string, request: RateRequest): Promise<RateResponse> {
    // Validate request
    const validatedRequest = validate(RateRequestSchema, request);

    // Get carrier
    const carrier = this.getCarrier(carrierName);
    if (!carrier) {
      throw new ValidationError(
        `Carrier not found or not supported: ${carrierName}`,
        { availableCarriers: Array.from(this.carriers.keys()) }
      );
    }

    // Get rates
    return carrier.getRates(validatedRequest);
  }

  /**
   * Get rates from all registered carriers
   * Returns combined results from all carriers
   */
  async getRatesFromAllCarriers(request: RateRequest): Promise<RateResponse> {
    // Validate request
    const validatedRequest = validate(RateRequestSchema, request);

    const carriers = this.getAllCarriers();
    if (carriers.length === 0) {
      throw new ValidationError('No carriers registered');
    }

    // Get rates from all carriers in parallel
    const results = await Promise.allSettled(
      carriers.map(carrier => carrier.getRates(validatedRequest))
    );

    // Combine successful results
    const allQuotes = results
      .filter((result): result is PromiseFulfilledResult<RateResponse> => 
        result.status === 'fulfilled'
      )
      .flatMap(result => result.value.quotes);

    // Sort by price
    allQuotes.sort((a, b) => a.totalCost - b.totalCost);

    return {
      quotes: allQuotes,
    };
  }

  /**
   * Health check for a specific carrier
   */
  async checkCarrierHealth(carrierName: string): Promise<boolean> {
    const carrier = this.getCarrier(carrierName);
    if (!carrier) {
      return false;
    }
    return carrier.healthCheck();
  }

  /**
   * Health check for all carriers
   */
  async checkAllCarriersHealth(): Promise<Record<string, boolean>> {
    const carriers = this.getAllCarriers();
    const results = await Promise.allSettled(
      carriers.map(carrier => carrier.healthCheck())
    );

    const health: Record<string, boolean> = {};
    carriers.forEach((carrier, index) => {
      const result = results[index];
      health[carrier.name] = result.status === 'fulfilled' ? result.value : false;
    });

    return health;
  }
}
