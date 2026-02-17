/**
 * Configuration management
 * Loads and validates environment variables
 */

export interface AppConfig {
  ups: {
    clientId: string;
    clientSecret: string;
    apiBaseUrl: string;
    authUrl: string;
  };
  api: {
    timeoutMs: number;
    tokenRefreshBufferMs: number;
  };
  env: string;
  logLevel: string;
}

/**
 * Load configuration from environment variables
 * Throws if required variables are missing
 */
export function loadConfig(): AppConfig {
  const requiredEnvVars = [
    'UPS_CLIENT_ID',
    'UPS_CLIENT_SECRET',
    'UPS_API_BASE_URL',
    'UPS_AUTH_URL',
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    ups: {
      clientId: process.env.UPS_CLIENT_ID!,
      clientSecret: process.env.UPS_CLIENT_SECRET!,
      apiBaseUrl: process.env.UPS_API_BASE_URL!,
      authUrl: process.env.UPS_AUTH_URL!,
    },
    api: {
      timeoutMs: parseInt(process.env.API_TIMEOUT_MS || '30000', 10),
      tokenRefreshBufferMs: parseInt(process.env.TOKEN_REFRESH_BUFFER_MS || '300000', 10),
    },
    env: process.env.NODE_ENV || 'development',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

export const config = loadConfig();
