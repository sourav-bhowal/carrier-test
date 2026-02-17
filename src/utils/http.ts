/**
 * HTTP client wrapper with timeout, error handling, and retry logic
 */

import axios, { type AxiosInstance, type AxiosError, type AxiosRequestConfig } from 'axios';
import {
  NetworkError,
  TimeoutError,
  ApiError,
  RateLimitError,
  ServiceUnavailableError,
} from '../core/errors';
import { type IHttpClient } from '../core/interfaces';

export interface HttpClientOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * HTTP client implementation using axios
 */
export class HttpClient implements IHttpClient {
  private client: AxiosInstance;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: HttpClientOptions = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.retryDelayMs = options.retryDelayMs || 1000;

    // Create axios instance with default config
    this.client = axios.create({
      timeout: options.timeoutMs || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
      validateStatus: () => true, // Handle all status codes manually
    });
  }

  async get<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('GET', url, undefined, headers);
  }

  async post<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('POST', url, body, headers);
  }

  async put<T>(url: string, body: unknown, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('PUT', url, body, headers);
  }

  async delete<T>(url: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>('DELETE', url, undefined, headers);
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.executeRequest<T>(method, url, body, headers);
      } catch (error) {
        lastError = error as Error;

        // Don't retry on client errors (4xx except 429) or validation errors
        if (
          error instanceof ApiError &&
          error.statusCode !== undefined &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 429
        ) {
          throw error;
        }

        // Exponential backoff for retries
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(2, attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private async executeRequest<T>(
    method: string,
    url: string,
    body?: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    try {
      const config: AxiosRequestConfig = {
        method,
        url,
        headers,
        data: body,
      };

      const response = await this.client.request<T>(config);

      // Handle HTTP error responses
      if (response.status >= 400) {
        this.handleErrorResponse(response.status, response.statusText, response.data, response.headers);
      }

      // Return response data
      return response.data;
    } catch (error) {
      // Handle axios-specific errors
      if (axios.isAxiosError(error)) {
        const axiosError = error as AxiosError;

        // Timeout error
        if (axiosError.code === 'ECONNABORTED' || axiosError.code === 'ETIMEDOUT') {
          throw new TimeoutError(`Request to ${url} timed out`);
        }

        // Network error
        if (axiosError.code === 'ENOTFOUND' || axiosError.code === 'ECONNREFUSED' || !axiosError.response) {
          throw new NetworkError(`Network error: ${axiosError.message}`);
        }

        // Response error - handle via our error handler
        if (axiosError.response) {
          this.handleErrorResponse(
            axiosError.response.status,
            axiosError.response.statusText,
            axiosError.response.data,
            axiosError.response.headers
          );
        }
      }

      throw error;
    }
  }

  private handleErrorResponse(
    status: number,
    statusText: string,
    data: unknown,
    headers: any
  ): never {
    // Handle specific status codes
    switch (status) {
      case 401:
      case 403:
        throw new ApiError(
          `Authentication failed: ${statusText}`,
          status,
          data
        );

      case 429:
        const retryAfter = headers['retry-after'];
        throw new RateLimitError(
          'Rate limit exceeded',
          retryAfter ? parseInt(retryAfter, 10) : undefined
        );

      case 503:
        throw new ServiceUnavailableError('Service temporarily unavailable');

      default:
        throw new ApiError(
          `API error: ${status} ${statusText}`,
          status,
          data
        );
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
