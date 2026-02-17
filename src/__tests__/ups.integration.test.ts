/**
 * Integration Tests for UPS Client
 * Tests with stubbed API responses based on UPS documentation
 */

import { describe, it, expect, beforeEach, mock, type Mock } from 'bun:test';
import { UPSClient } from '../carriers/ups/client';
import { ServiceLevel } from '../core/types';
import { ValidationError, ApiError, AuthenticationError } from '../core/errors';
import type { IHttpClient } from '../core/interfaces';

// Create mock HTTP client with proper typing
const createMockHttpClient = (): IHttpClient & { 
  post: Mock<any>;
  get: Mock<any>;
  put: Mock<any>;
  delete: Mock<any>;
} => {
  return {
    post: mock(),
    get: mock(),
    put: mock(),
    delete: mock(),
  } as any;
};

describe('UPS Client Integration Tests', () => {
  let client: UPSClient;
  let mockHttpClient: ReturnType<typeof createMockHttpClient>;

  beforeEach(() => {
    // Create fresh mock HTTP client for each test
    mockHttpClient = createMockHttpClient();

    // Initialize UPS client with mock HTTP client
    client = new UPSClient({
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      apiBaseUrl: 'https://onlinetools.ups.com/api',
      authUrl: 'https://onlinetools.ups.com/security/v1/oauth/token',
      tokenRefreshBufferMs: 300000,
      httpClient: mockHttpClient as any,
    });
  });

  describe('Authentication Flow', () => {
    it('should obtain OAuth token on first request', async () => {
      // Mock token response
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-access-token-12345',
        token_type: 'Bearer',
        expires_in: '3600',
        scope: 'rating',
      });

      // Mock successful rate response
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03', Description: 'UPS Ground' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.50' },
            GuaranteedDelivery: { BusinessDaysInTransit: '3' },
          },
        },
      });

      await client.getRates({
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
      });

      // Verify token was requested
      expect(mockHttpClient.post).toHaveBeenCalledWith(
        'https://onlinetools.ups.com/security/v1/oauth/token',
        'grant_type=client_credentials',
        expect.objectContaining({
          Authorization: expect.stringContaining('Basic'),
        })
      );
    });

    it('should reuse cached token for subsequent requests', async () => {
      // Mock token response
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });

      // Mock rate responses
      const rateResponse = {
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.50' },
          },
        },
      };
      mockHttpClient.post.mockResolvedValue(rateResponse);

      const request = {
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

      // Make two requests
      await client.getRates(request);
      await client.getRates(request);

      // Token should only be requested once
      const authCalls = mockHttpClient.post.mock.calls.filter(
        (call: any) => call[0].includes('oauth/token')
      );
      expect(authCalls).toHaveLength(1);
    });

    it('should handle authentication failure', async () => {
      mockHttpClient.post.mockRejectedValueOnce(
        new ApiError('Unauthorized', 401, { error: 'invalid_client' })
      );

      await expect(
        client.getRates({
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
        })
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('Rate Request Building', () => {
    beforeEach(() => {
      // Mock successful auth
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });
    });

    it('should build correct request payload for single package', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.50' },
          },
        },
      });

      await client.getRates({
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
      });

      const rateCalls = mockHttpClient.post.mock.calls.filter(
        (call: any) => call[0].includes('/rating/')
      );
      expect(rateCalls).toHaveLength(1);

      const requestPayload = rateCalls[0][1];
      expect(requestPayload).toMatchObject({
        RateRequest: {
          Request: {
            TransactionReference: expect.any(Object),
          },
          Shipment: {
            Shipper: {
              Address: expect.objectContaining({
                City: 'Austin',
                StateProvinceCode: 'TX',
                PostalCode: '78701',
                CountryCode: 'US',
              }),
            },
            ShipTo: {
              Address: expect.objectContaining({
                City: 'Los Angeles',
                StateProvinceCode: 'CA',
                PostalCode: '90001',
                CountryCode: 'US',
              }),
            },
            Package: expect.objectContaining({
              PackageWeight: {
                UnitOfMeasurement: { Code: 'LBS' },
                Weight: '10',
              },
              Dimensions: {
                UnitOfMeasurement: { Code: 'IN' },
                Length: '12',
                Width: '8',
                Height: '6',
              },
            }),
          },
        },
      });
    });

    it('should build request with specific service level', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '01' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '75.00' },
          },
        },
      });

      await client.getRates({
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
        serviceLevel: ServiceLevel.NEXT_DAY,
      });

      const rateCalls = mockHttpClient.post.mock.calls.filter(
        (call: any) => call[0].includes('/rating/')
      );
      const requestPayload = rateCalls[0][1] as any;
      expect(requestPayload.RateRequest.Shipment.Service).toEqual({ Code: '01' });
    });

    it('should handle multiple packages', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: {
            Service: { Code: '03' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '45.00' },
          },
        },
      });

      await client.getRates({
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
        packages: [
          { weight: 10, length: 12, width: 8, height: 6 },
          { weight: 5, length: 10, width: 6, height: 4 },
        ],
      });

      const rateCalls = mockHttpClient.post.mock.calls.filter(
        (call: any) => call[0].includes('/rating/')
      );
      const requestPayload = rateCalls[0][1] as any;
      expect(Array.isArray(requestPayload.RateRequest.Shipment.Package)).toBe(true);
      expect(requestPayload.RateRequest.Shipment.Package).toHaveLength(2);
    });
  });

  describe('Response Parsing', () => {
    beforeEach(() => {
      // Mock successful auth
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });
    });

    it('should parse single rate quote correctly', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
            TransactionReference: { CustomerContext: 'Rate-123456' },
          },
          RatedShipment: {
            Service: { Code: '03', Description: 'UPS Ground' },
            TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.50' },
            GuaranteedDelivery: { BusinessDaysInTransit: '3' },
          },
        },
      });

      const result = await client.getRates({
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
      });

      expect(result.quotes).toHaveLength(1);
      expect(result.quotes[0]).toMatchObject({
        carrier: 'UPS',
        serviceLevel: ServiceLevel.GROUND,
        serviceName: 'UPS Ground',
        totalCost: 25.5,
        currency: 'USD',
        transitDays: 3,
        isGuaranteed: true,
      });
      expect(result.requestId).toBe('Rate-123456');
    });

    it('should parse multiple rate quotes correctly', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '1', Description: 'Success' },
          },
          RatedShipment: [
            {
              Service: { Code: '03', Description: 'UPS Ground' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '25.50' },
              GuaranteedDelivery: { BusinessDaysInTransit: '3' },
            },
            {
              Service: { Code: '02', Description: 'UPS 2nd Day Air' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '45.00' },
              GuaranteedDelivery: { BusinessDaysInTransit: '2' },
            },
            {
              Service: { Code: '01', Description: 'UPS Next Day Air' },
              TotalCharges: { CurrencyCode: 'USD', MonetaryValue: '75.00' },
              GuaranteedDelivery: { BusinessDaysInTransit: '1' },
            },
          ],
        },
      });

      const result = await client.getRates({
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
      });

      expect(result.quotes).toHaveLength(3);
      expect(result.quotes[0].serviceLevel).toBe(ServiceLevel.GROUND);
      expect(result.quotes[1].serviceLevel).toBe(ServiceLevel.TWO_DAY);
      expect(result.quotes[2].serviceLevel).toBe(ServiceLevel.NEXT_DAY);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      // Mock successful auth
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });
    });

    it('should handle validation errors', async () => {
      expect(
            client.getRates({
                origin: {
                    addressLine1: '',
                    city: '',
                    stateOrProvinceCode: '',
                    postalCode: '',
                    countryCode: 'US',
                },
                destination: {
                    addressLine1: '456 Oak Ave',
                    city: 'Los Angeles',
                    stateOrProvinceCode: 'CA',
                    postalCode: '90001',
                    countryCode: 'US',
                },
                packages: [],
            } as any)
        ).rejects.toThrow(ValidationError);
    });

    it('should handle UPS API error response', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        RateResponse: {
          Response: {
            ResponseStatus: { Code: '0', Description: 'Invalid postal code' },
          },
        },
      });

      await expect(
        client.getRates({
          origin: {
            addressLine1: '123 Main St',
            city: 'Austin',
            stateOrProvinceCode: 'TX',
            postalCode: 'INVALID',
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
        })
      ).rejects.toThrow(ApiError);
    });

    it('should handle malformed response', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        InvalidStructure: 'not a valid response',
      });

      await expect(
        client.getRates({
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
        })
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockHttpClient.post.mockRejectedValueOnce(
        new Error('Network connection failed')
      );

      await expect(
        client.getRates({
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
        })
      ).rejects.toThrow();
    });

    it('should handle 429 rate limit error', async () => {
      mockHttpClient.post.mockRejectedValueOnce(
        new ApiError('Too many requests', 429, { retryAfter: 60 })
      );

      await expect(
        client.getRates({
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
        })
      ).rejects.toThrow(ApiError);
    });
  });

  describe('Health Check', () => {
    it('should return true when can obtain token', async () => {
      mockHttpClient.post.mockResolvedValueOnce({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: '3600',
      });

      const health = await client.healthCheck();
      expect(health).toBe(true);
    });

    it('should return false when cannot obtain token', async () => {
      mockHttpClient.post.mockRejectedValueOnce(new Error('Auth failed'));

      const health = await client.healthCheck();
      expect(health).toBe(false);
    });
  });
});
