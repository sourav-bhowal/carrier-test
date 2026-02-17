/**
 * Integration Tests for Shipping Service
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { ShippingService } from '../services/shipping.service';
import type { ICarrierClient } from '../core/interfaces';
import { type RateRequest, type RateResponse, ServiceLevel } from '../core/types';
import { ValidationError } from '../core/errors';

// Mock carrier implementation for testing
class MockCarrier implements ICarrierClient {
  constructor(
    public readonly name: string,
    private mockResponse: RateResponse
  ) {}

  async getRates(request: RateRequest): Promise<RateResponse> {
    return this.mockResponse;
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }
}

describe('Shipping Service Integration Tests', () => {
  let service: ShippingService;

  beforeEach(() => {
    service = new ShippingService();
  });

  describe('Carrier Registration', () => {
    it('should register a carrier', () => {
      const carrier = new MockCarrier('UPS', { quotes: [] });
      service.registerCarrier(carrier);

      const retrieved = service.getCarrier('UPS');
      expect(retrieved).toBe(carrier);
    });

    it('should be case-insensitive when registering carriers', () => {
      const carrier = new MockCarrier('UPS', { quotes: [] });
      service.registerCarrier(carrier);

      expect(service.getCarrier('ups')).toBe(carrier);
      expect(service.getCarrier('UPS')).toBe(carrier);
      expect(service.getCarrier('Ups')).toBe(carrier);
    });

    it('should return all registered carriers', () => {
      const ups = new MockCarrier('UPS', { quotes: [] });
      const fedex = new MockCarrier('FedEx', { quotes: [] });

      service.registerCarrier(ups);
      service.registerCarrier(fedex);

      const carriers = service.getAllCarriers();
      expect(carriers).toHaveLength(2);
      expect(carriers).toContain(ups);
      expect(carriers).toContain(fedex);
    });
  });

  describe('Get Rates', () => {
    it('should get rates from specific carrier', async () => {
      const mockQuote = {
        carrier: 'UPS',
        serviceLevel: ServiceLevel.GROUND,
        serviceName: 'UPS Ground',
        totalCost: 25.5,
        currency: 'USD',
        isGuaranteed: true,
      };

      const carrier = new MockCarrier('UPS', { quotes: [mockQuote] });
      service.registerCarrier(carrier);

      const request: RateRequest = {
        origin: {
          addressLine1: '123 Main St',
          city: 'Austin',
          stateOrProvinceCode: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        destination: {
          addressLine1: '456 Oak Ave',
          city: 'Los Angeles',
          stateOrProvinceCode: 'CA',
          postalCode: '90001',
          countryCode: 'US',
        },
        packages: [{ weight: 10, length: 12, width: 8, height: 6 }],
      };

      const result = await service.getRates('UPS', request);
      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]).toEqual(mockQuote);
    });

    it('should throw error for unregistered carrier', async () => {
      const request: RateRequest = {
        origin: {
          addressLine1: '123 Main St',
          city: 'Austin',
          stateOrProvinceCode: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        destination: {
          addressLine1: '456 Oak Ave',
          city: 'Los Angeles',
          stateOrProvinceCode: 'CA',
          postalCode: '90001',
          countryCode: 'US',
        },
        packages: [{ weight: 10, length: 12, width: 8, height: 6 }],
      };

      await expect(service.getRates('NonExistent', request)).rejects.toThrow(
        ValidationError
      );
    });

    it('should validate request before getting rates', async () => {
      const carrier = new MockCarrier('UPS', { quotes: [] });
      service.registerCarrier(carrier);

      await expect(
        service.getRates('UPS', {
          origin: {} as any,
          destination: {} as any,
          packages: [],
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('Get Rates from All Carriers', () => {
    it('should combine rates from multiple carriers', async () => {
      const upsQuote = {
        carrier: 'UPS',
        serviceLevel: ServiceLevel.GROUND,
        serviceName: 'UPS Ground',
        totalCost: 25.5,
        currency: 'USD',
        isGuaranteed: true,
      };

      const fedexQuote = {
        carrier: 'FedEx',
        serviceLevel: ServiceLevel.GROUND,
        serviceName: 'FedEx Ground',
        totalCost: 23.0,
        currency: 'USD',
        isGuaranteed: true,
      };

      const ups = new MockCarrier('UPS', { quotes: [upsQuote] });
      const fedex = new MockCarrier('FedEx', { quotes: [fedexQuote] });

      service.registerCarrier(ups);
      service.registerCarrier(fedex);

      const request: RateRequest = {
        origin: {
          addressLine1: '123 Main St',
          city: 'Austin',
          stateOrProvinceCode: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        destination: {
          addressLine1: '456 Oak Ave',
          city: 'Los Angeles',
          stateOrProvinceCode: 'CA',
          postalCode: '90001',
          countryCode: 'US',
        },
        packages: [{ weight: 10, length: 12, width: 8, height: 6 }],
      };

      const result = await service.getRatesFromAllCarriers(request);
      expect(result.quotes).toHaveLength(2);
      
      // Results should be sorted by price (cheapest first)
      expect(result.quotes[0].totalCost).toBe(23.0); // FedEx
      expect(result.quotes[1].totalCost).toBe(25.5); // UPS
    });

    it('should handle partial failures gracefully', async () => {
      const goodCarrier = new MockCarrier('UPS', {
        quotes: [
          {
            carrier: 'UPS',
            serviceLevel: ServiceLevel.GROUND,
            serviceName: 'UPS Ground',
            totalCost: 25.5,
            currency: 'USD',
            isGuaranteed: true,
          },
        ],
      });

      // Carrier that throws errors
      class FailingCarrier implements ICarrierClient {
        readonly name = 'BadCarrier';
        async getRates(): Promise<RateResponse> {
          throw new Error('Carrier unavailable');
        }
        async healthCheck(): Promise<boolean> {
          return false;
        }
      }

      service.registerCarrier(goodCarrier);
      service.registerCarrier(new FailingCarrier());

      const request: RateRequest = {
        origin: {
          addressLine1: '123 Main St',
          city: 'Austin',
          stateOrProvinceCode: 'TX',
          postalCode: '78701',
          countryCode: 'US',
        },
        destination: {
          addressLine1: '456 Oak Ave',
          city: 'Los Angeles',
          stateOrProvinceCode: 'CA',
          postalCode: '90001',
          countryCode: 'US',
        },
        packages: [{ weight: 10, length: 12, width: 8, height: 6 }],
      };

      const result = await service.getRatesFromAllCarriers(request);
      
      // Should only have quotes from the successful carrier
      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0].carrier).toBe('UPS');
    });
  });

  describe('Health Checks', () => {
    it('should check health of specific carrier', async () => {
      const carrier = new MockCarrier('UPS', { quotes: [] });
      service.registerCarrier(carrier);

      const health = await service.checkCarrierHealth('UPS');
      expect(health).toBe(true);
    });

    it('should return false for non-existent carrier', async () => {
      const health = await service.checkCarrierHealth('NonExistent');
      expect(health).toBe(false);
    });

    it('should check health of all carriers', async () => {
      const ups = new MockCarrier('UPS', { quotes: [] });
      const fedex = new MockCarrier('FedEx', { quotes: [] });

      service.registerCarrier(ups);
      service.registerCarrier(fedex);

      const health = await service.checkAllCarriersHealth();
      expect(health).toEqual({
        UPS: true,
        FedEx: true,
      });
    });
  });
});
