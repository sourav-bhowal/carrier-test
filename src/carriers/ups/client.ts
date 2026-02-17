/**
 * UPS Carrier Client Implementation
 * Handles rate requests to the UPS Rating API
 */

import { BaseCarrierClient } from '../base/carrier.client';
import type { RateRequest, RateResponse } from '../../core/types';
import { ApiError, InvalidResponseError } from '../../core/errors';
import { HttpClient } from '../../utils/http';
import { validate, RateRequestSchema } from '../../utils/validation';
import { UPSAuthProvider } from './auth';
import { buildUPSShipment, fromUPSRatedShipment } from './mapper';
import type { UPSRateRequest, UPSRateResponse, UPSErrorResponse } from './types';

export interface UPSClientConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  authUrl: string;
  tokenRefreshBufferMs: number;
  timeoutMs?: number;
  httpClient?: HttpClient; // Optional for dependency injection in tests
}

/**
 * UPS Rating API Client
 */
export class UPSClient extends BaseCarrierClient {
  readonly name = 'UPS';
  private authProvider: UPSAuthProvider;
  private httpClient: HttpClient;
  private apiBaseUrl: string;

  constructor(config: UPSClientConfig) {
    super();
    this.apiBaseUrl = config.apiBaseUrl;
    this.httpClient = config.httpClient || new HttpClient({
      timeoutMs: config.timeoutMs || 30000,
      maxRetries: 2,
    });
    this.authProvider = new UPSAuthProvider({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      authUrl: config.authUrl,
      tokenRefreshBufferMs: config.tokenRefreshBufferMs,
      httpClient: this.httpClient,
    });
  }

  /**
   * Get shipping rates from UPS
   */
  async getRates(request: RateRequest): Promise<RateResponse> {
    // Validate input
    const validatedRequest = validate(RateRequestSchema, request);

    this.log('info', 'Fetching rates from UPS', {
      origin: validatedRequest.origin.postalCode,
      destination: validatedRequest.destination.postalCode,
      packages: validatedRequest.packages.length,
    });

    try {
      // Get auth token
      const accessToken = await this.authProvider.getToken();

      // Build UPS request payload
      const upsRequest = this.buildRateRequest(validatedRequest);

      // Make API call
      const url = `${this.apiBaseUrl}/rating/v1/Rate`;
      const response = await this.httpClient.post<UPSRateResponse>(
        url,
        upsRequest,
        {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        }
      );

      // Parse and return response
      return this.parseRateResponse(response);
    } catch (error) {
      this.log('error', 'Error fetching rates from UPS', error);
      throw this.handleError(error);
    }
  }

  /**
   * Build UPS rate request payload
   */
  private buildRateRequest(request: RateRequest): UPSRateRequest {
    const shipment = buildUPSShipment(
      request.origin,
      request.destination,
      request.packages,
      request.serviceLevel
    );

    return {
      RateRequest: {
        Request: {
          TransactionReference: {
            CustomerContext: `Rate-${Date.now()}`,
          },
        },
        Shipment: shipment,
      },
    };
  }

  /**
   * Parse UPS rate response into our domain model
   */
  private parseRateResponse(response: UPSRateResponse): RateResponse {
    if (!response.RateResponse) {
      throw new InvalidResponseError('Invalid UPS response structure', response);
    }

    const { RateResponse: rateResponse } = response;

    // Check response status
    if (rateResponse.Response.ResponseStatus.Code !== '1') {
      throw new ApiError(
        `UPS API error: ${rateResponse.Response.ResponseStatus.Description}`,
        400,
        response
      );
    }

    // Handle both single and multiple rated shipments
    const ratedShipments = Array.isArray(rateResponse.RatedShipment)
      ? rateResponse.RatedShipment
      : [rateResponse.RatedShipment];

    const quotes = ratedShipments.map(fromUPSRatedShipment);

    return {
      quotes,
      requestId: rateResponse.Response.TransactionReference?.CustomerContext,
    };
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown): Error {
    if (error instanceof ApiError) {
      // Try to extract UPS-specific error details
      const body = error.responseBody as UPSErrorResponse | undefined;
      
      if (body?.response?.errors) {
        const errors = body.response.errors;
        const errorMessages = errors.map(e => `${e.code}: ${e.message}`).join('; ');
        return new ApiError(
          `UPS API error: ${errorMessages}`,
          error.statusCode || 400,
          body
        );
      }

      if (body?.Fault?.detail?.Errors) {
        const errorDetail = body.Fault.detail.Errors.ErrorDetail.PrimaryErrorCode;
        return new ApiError(
          `UPS error ${errorDetail.Code}: ${errorDetail.Description}`,
          error.statusCode || 400,
          body
        );
      }
    }

    return error as Error;
  }

  /**
   * Health check specific to UPS
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Just check if we can get a valid token
      await this.authProvider.getToken();
      return true;
    } catch {
      return false;
    }
  }
}
