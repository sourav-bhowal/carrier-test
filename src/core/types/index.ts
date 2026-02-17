/**
 * Core domain types for the shipping carrier integration service
 * These types represent our internal domain model, independent of any specific carrier
 */

/**
 * Address representation
 */
export interface Address {
  /** Street address line 1 */
  addressLine1: string;
  /** Optional street address line 2 */
  addressLine2?: string;
  /** City name */
  city: string;
  /** State or province code (e.g., "CA", "NY") */
  stateOrProvinceCode: string;
  /** Postal or ZIP code */
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code (e.g., "US", "CA") */
  countryCode: string;
  /** Whether this is a residential address */
  isResidential?: boolean;
}

/**
 * Package dimensions and weight
 */
export interface Package {
  /** Weight in pounds */
  weight: number;
  /** Length in inches */
  length: number;
  /** Width in inches */
  width: number;
  /** Height in inches */
  height: number;
  /** Optional package reference/description */
  reference?: string;
}

/**
 * Service level options for shipping
 */
export enum ServiceLevel {
  GROUND = 'GROUND',
  TWO_DAY = 'TWO_DAY',
  NEXT_DAY = 'NEXT_DAY',
  NEXT_DAY_EARLY_AM = 'NEXT_DAY_EARLY_AM',
  THREE_DAY = 'THREE_DAY',
  INTERNATIONAL_ECONOMY = 'INTERNATIONAL_ECONOMY',
  INTERNATIONAL_EXPRESS = 'INTERNATIONAL_EXPRESS',
}

/**
 * Rate request from the caller
 */
export interface RateRequest {
  /** Shipment origin address */
  origin: Address;
  /** Shipment destination address */
  destination: Address;
  /** Array of packages to ship */
  packages: Package[];
  /** Optional specific service level; if omitted, returns all available services */
  serviceLevel?: ServiceLevel;
  /** Optional shipment date; defaults to current date */
  shipDate?: Date;
}

/**
 * Individual rate quote from a carrier
 */
export interface RateQuote {
  /** Carrier name (e.g., "UPS", "FedEx") */
  carrier: string;
  /** Service level for this rate */
  serviceLevel: ServiceLevel;
  /** Human-readable service name */
  serviceName: string;
  /** Total cost in USD */
  totalCost: number;
  /** Currency code (e.g., "USD") */
  currency: string;
  /** Estimated delivery date */
  estimatedDeliveryDate?: Date;
  /** Number of business days for delivery */
  transitDays?: number;
  /** Whether this service is guaranteed */
  isGuaranteed: boolean;
}

/**
 * Response containing rate quotes
 */
export interface RateResponse {
  /** Array of available rate quotes */
  quotes: RateQuote[];
  /** Request ID for tracking/debugging */
  requestId?: string;
}

/**
 * OAuth token response
 */
export interface OAuthToken {
  /** Access token for API requests */
  accessToken: string;
  /** Token type (usually "Bearer") */
  tokenType: string;
  /** Expiration time in seconds from issuance */
  expiresIn: number;
  /** Timestamp when token was issued */
  issuedAt: number;
  /** Scope of the token */
  scope?: string;
}
