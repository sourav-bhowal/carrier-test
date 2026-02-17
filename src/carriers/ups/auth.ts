/**
 * UPS OAuth 2.0 Authentication Provider
 * Implements client-credentials flow with token caching and auto-refresh
 */

import type { IAuthProvider } from '../../core/interfaces';
import type { OAuthToken } from '../../core/types';
import { AuthenticationError, InvalidResponseError } from '../../core/errors';
import { HttpClient } from '../../utils/http';
import type { UPSTokenResponse } from './types';

export interface UPSAuthConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenRefreshBufferMs: number;
  httpClient?: HttpClient; // Optional for dependency injection in tests
}

/**
 * UPS OAuth Authentication Provider
 */
export class UPSAuthProvider implements IAuthProvider {
  private token: OAuthToken | null = null;
  private httpClient: HttpClient;

  constructor(private config: UPSAuthConfig) {
    this.httpClient = config.httpClient || new HttpClient({ timeoutMs: 10000 });
  }

  /**
   * Get a valid access token
   * Returns cached token if valid, otherwise fetches a new one
   */
  async getToken(): Promise<string> {
    if (this.isTokenValid()) {
      return this.token!.accessToken;
    }

    const token = await this.refreshToken();
    return token.accessToken;
  }

  /**
   * Force acquisition of a new token
   */
  async refreshToken(): Promise<OAuthToken> {
    try {
      // Encode credentials for Basic Auth
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await this.httpClient.post<UPSTokenResponse>(
        this.config.authUrl,
        'grant_type=client_credentials',
        {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        }
      );

      if (!response.access_token || !response.expires_in) {
        throw new InvalidResponseError(
          'Invalid token response from UPS',
          response
        );
      }

      this.token = {
        accessToken: response.access_token,
        tokenType: response.token_type || 'Bearer',
        expiresIn: parseInt(response.expires_in, 10),
        issuedAt: Date.now(),
        scope: response.scope,
      };

      return this.token;
    } catch (error) {
      if (error instanceof AuthenticationError || error instanceof InvalidResponseError) {
        throw error;
      }
      throw new AuthenticationError(
        `Failed to obtain UPS access token: ${(error as Error).message}`,
        error
      );
    }
  }

  /**
   * Check if the current token is valid
   * Returns false if token doesn't exist or is expired/about to expire
   */
  isTokenValid(): boolean {
    if (!this.token) {
      return false;
    }

    const now = Date.now();
    const expiresAt = this.token.issuedAt + this.token.expiresIn * 1000;
    const refreshThreshold = expiresAt - this.config.tokenRefreshBufferMs;

    return now < refreshThreshold;
  }

  /**
   * Clear the cached token
   */
  clearToken(): void {
    this.token = null;
  }
}
