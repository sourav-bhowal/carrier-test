# Carrier Integration Service

A production-ready, extensible shipping carrier integration service built with **TypeScript** and **Bun**. Currently implements the **UPS Rating API** as the first carrier, with a pluggable architecture that makes adding new carriers (FedEx, USPS, DHL, etc.) straightforward.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [How It Works](#how-it-works)
  - [Request Flow](#request-flow)
  - [Authentication Flow (OAuth 2.0)](#authentication-flow-oauth-20)
  - [Error Handling](#error-handling)
- [Key Design Decisions](#key-design-decisions)
- [Setup & Installation](#setup--installation)
- [Configuration](#configuration)
- [Running Tests](#running-tests)
- [Usage Examples](#usage-examples)
- [Adding a New Carrier](#adding-a-new-carrier)

---

## Overview

This service provides a **unified interface** for fetching shipping rates from multiple carriers. It abstracts away the differences between carrier APIs behind a common domain model, so consumers of this library work with a single `RateRequest` / `RateResponse` shape regardless of which carrier is being queried.

**Key features:**

- **Pluggable carrier architecture** — register any carrier that implements `ICarrierClient`
- **UPS Rating API v1** — full implementation with OAuth 2.0 client-credentials flow
- **Runtime validation** — Zod schemas validate every request before it hits the network
- **Retry with exponential backoff** — automatic retries on transient failures (5xx, timeouts)
- **Structured error hierarchy** — typed error classes for auth, validation, rate-limit, network, and API errors
- **Token caching** — OAuth tokens are cached in memory and auto-refreshed before expiry
- **Dependency injection** — HTTP client is injectable, making the entire stack testable without network calls

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Consumer / Caller                    │
└───────────────────────────┬─────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                   ShippingService                       │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────┐  │
│  │  Validation   │  │  Carrier      │  │  Multi-     │  │
│  │  (Zod)        │  │  Registry     │  │  carrier    │  │
│  │               │  │  (Map)        │  │  aggregation│  │
│  └───────────────┘  └───────┬───────┘  └─────────────┘  │
└─────────────────────────────┼───────────────────────────┘
                              │ ICarrierClient interface
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
      │  UPSClient  │  │  FedExClient│  │  USPSClient │
      │  (impl.)    │  │  (future)   │  │  (future)   │
      └──────┬──────┘  └─────────────┘  └─────────────┘
             │
     ┌───────┼───────┐
     ▼               ▼
┌──────────┐  ┌──────────────┐
│ AuthProv │  │   Mapper     │
│ (OAuth)  │  │ (domain ↔    │
│          │  │  UPS types)  │
└────┬─────┘  └──────────────┘
     │
     ▼
┌──────────────────────────────┐
│         HttpClient           │
│  (Axios + retry + timeout)   │
└──────────────────────────────┘
```

---

## Project Structure

```
carrier-test/
├── src/
│   ├── index.ts                     # Library entry point — re-exports everything
│   │
│   ├── core/                        # Domain layer (carrier-agnostic)
│   │   ├── types/index.ts           # Domain models: Address, Package, RateRequest, RateResponse, ServiceLevel
│   │   ├── interfaces/index.ts      # Contracts: ICarrierClient, IAuthProvider, IHttpClient
│   │   └── errors/index.ts          # Error hierarchy: CarrierError → AuthenticationError, ValidationError, etc.
│   │
│   ├── carriers/                    # Carrier implementations
│   │   ├── index.ts                 # Barrel file for all carriers
│   │   ├── base/
│   │   │   └── carrier.client.ts    # Abstract BaseCarrierClient with logging & default healthCheck
│   │   └── ups/
│   │       ├── client.ts            # UPSClient — getRates(), request building, response parsing
│   │       ├── auth.ts              # UPSAuthProvider — OAuth 2.0 token lifecycle
│   │       ├── mapper.ts            # Bidirectional mapping: domain types ↔ UPS API format
│   │       └── types.ts             # UPS-specific type definitions (API shapes)
│   │
│   ├── services/
│   │   └── shipping.service.ts      # ShippingService — carrier registry, rate aggregation
│   │
│   ├── config/
│   │   └── index.ts                 # Environment-based configuration loader
│   │
│   ├── utils/
│   │   ├── http.ts                  # Axios-based HttpClient with retry & backoff
│   │   └── validation.ts            # Zod schemas & validate() / safeValidate() helpers
│   │
│   └── __tests__/
│       ├── ups.integration.test.ts  # UPS client tests (15 tests) — mocked HTTP layer
│       └── shipping.service.test.ts # ShippingService tests (11 tests) — mock carriers
│
├── package.json
├── tsconfig.json
└── README.md
```

---

## How It Works

### Request Flow

A rate request flows through the system like this:

```
1. Consumer calls  shippingService.getRates("UPS", rateRequest)

2. ShippingService validates the request with Zod schemas
   └─ Invalid? → throws ValidationError with field-level details

3. ShippingService looks up "UPS" in its carrier registry
   └─ Not found? → throws ValidationError listing available carriers

4. UPSClient.getRates() is called:
   a. Request is validated again at the carrier level
   b. UPSAuthProvider.getToken() returns a cached or fresh OAuth token
   c. Mapper converts domain types → UPS API format (addresses, packages, service codes)
   d. HttpClient.post() sends the request to UPS Rating API v1
   e. Response is parsed: UPS format → domain RateQuote objects
   f. RateResponse with sorted quotes is returned

5. Consumer receives RateResponse { quotes: RateQuote[], requestId?: string }
```

### Authentication Flow (OAuth 2.0)

The UPS API uses OAuth 2.0 **client-credentials** flow:

```
1. UPSAuthProvider.getToken() is called
2. Is there a cached token still valid (with 5-minute buffer)?
   ├─ YES → return cached token immediately
   └─ NO  → call refreshToken()
3. refreshToken():
   a. Base64-encode clientId:clientSecret
   b. POST to UPS token endpoint with grant_type=client_credentials
   c. Parse response → store OAuthToken { accessToken, expiresIn, issuedAt }
   d. Return the fresh token
```

Token caching avoids unnecessary auth round-trips. The 5-minute buffer (`tokenRefreshBufferMs`) ensures tokens are refreshed *before* they expire, preventing mid-request failures.

### Error Handling

Every error thrown is a typed subclass of `CarrierError`:

| Error Class                | HTTP Status | When                                          |
|---------------------------|-------------|-----------------------------------------------|
| `ValidationError`          | 400         | Invalid request fields (Zod validation fails) |
| `AuthenticationError`      | 401         | OAuth token acquisition fails                 |
| `ApiError`                 | 4xx/5xx     | UPS API returns an error response             |
| `RateLimitError`           | 429         | Too many requests                             |
| `TimeoutError`             | 408         | Request exceeds timeout                       |
| `NetworkError`             | 503         | DNS failure, connection refused, etc.         |
| `InvalidResponseError`     | 502         | Response doesn't match expected structure     |
| `ServiceUnavailableError`  | 503         | Carrier service is down                       |

All errors carry a `code` string, optional `statusCode`, and optional `details` for structured logging.

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Interface-driven design** (`ICarrierClient`, `IAuthProvider`, `IHttpClient`) | Enables adding new carriers without modifying existing code (Open/Closed Principle) |
| **Abstract base class** (`BaseCarrierClient`) | Shares logging and default `healthCheck()` across all carriers |
| **Separate mapper layer** | Keeps carrier-specific API format translation isolated from business logic |
| **Zod for validation** | Provides runtime type safety with TypeScript type inference — catches bad input before network calls |
| **Dependency injection for HttpClient** | Tests inject mocks without touching the network; no monkey-patching required |
| **Axios with manual status handling** | `validateStatus: () => true` allows structured handling of 4xx/5xx rather than relying on axios throwing |
| **Exponential backoff retries** | Automatically retries transient failures (5xx, timeouts) but immediately throws on client errors (4xx) |
| **Token caching with refresh buffer** | Avoids token expiry during in-flight requests by refreshing 5 minutes early |
| **Enum-based ServiceLevel** | Type-safe mapping between normalized service levels and carrier-specific codes (UPS: `'03'` → `GROUND`) |

---

## Setup & Installation

### Prerequisites

- [Bun](https://bun.sh) v1.2+ (runtime & test runner)
- Node.js 18+ (for TypeScript typings)

### Install

```bash
bun install
```

---

## Configuration

Create a `.env` file in the project root (or set these environment variables):

```env
# Required — UPS API credentials
UPS_CLIENT_ID=your_ups_client_id
UPS_CLIENT_SECRET=your_ups_client_secret
UPS_API_BASE_URL=https://onlinetools.ups.com/api
UPS_AUTH_URL=https://onlinetools.ups.com/security/v1/oauth/token

# Optional
API_TIMEOUT_MS=30000              # HTTP request timeout (default: 30s)
TOKEN_REFRESH_BUFFER_MS=300000    # Refresh token 5 min before expiry
NODE_ENV=development
LOG_LEVEL=info
```

> **Note:** For UPS sandbox/testing, use `https://wwwcie.ups.com/api` as the base URL.

---

## Running Tests

Tests use **Bun's built-in test runner** with mocked HTTP clients (no real API calls):

```bash
# Run all tests
bun test

# Run with watch mode
bun test --watch

# Run a specific test file
bun test src/__tests__/ups.integration.test.ts
```

**Test coverage (26 tests):**

| Suite | Tests | What's Covered |
|-------|-------|---------------|
| UPS Client | 15 | OAuth flow, request building, response parsing, service level mapping, multi-package, error handling (4xx, 5xx, network, auth, rate-limit, timeout), input validation |
| Shipping Service | 11 | Carrier registration, case-insensitive lookup, single-carrier rates, multi-carrier aggregation, price sorting, partial failures, input validation, health checks |

---

## Usage Examples

### Basic: Get rates from UPS

```typescript
import { ShippingService, UPSClient, ServiceLevel } from './src';

// Create and configure UPS client
const upsClient = new UPSClient({
  clientId: process.env.UPS_CLIENT_ID!,
  clientSecret: process.env.UPS_CLIENT_SECRET!,
  apiBaseUrl: 'https://onlinetools.ups.com/api',
  authUrl: 'https://onlinetools.ups.com/security/v1/oauth/token',
  tokenRefreshBufferMs: 300000,
});

// Register with the shipping service
const shipping = new ShippingService();
shipping.registerCarrier(upsClient);

// Fetch rates
const response = await shipping.getRates('UPS', {
  origin: {
    addressLine1: '123 Main St',
    city: 'New York',
    stateOrProvinceCode: 'NY',
    postalCode: '10001',
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
  serviceLevel: ServiceLevel.GROUND,
});

console.log(response.quotes);
// [{ carrier: 'UPS', serviceName: 'UPS Ground', totalCost: 15.99, ... }]
```

### Advanced: Compare rates across all carriers

```typescript
// Register multiple carriers
shipping.registerCarrier(upsClient);
// shipping.registerCarrier(fedexClient);  // future

// Get cheapest rate across all carriers (sorted by price)
const allRates = await shipping.getRatesFromAllCarriers(request);
const cheapest = allRates.quotes[0];
```

---

## Adding a New Carrier

To add a new carrier (e.g., FedEx), create these files:

```
src/carriers/fedex/
├── client.ts    # Implements ICarrierClient (extend BaseCarrierClient)
├── auth.ts      # Implements IAuthProvider (if OAuth is needed)
├── mapper.ts    # Domain types ↔ FedEx API format
└── types.ts     # FedEx-specific API types
```

**Minimal implementation:**

```typescript
import { BaseCarrierClient } from '../base/carrier.client';
import type { RateRequest, RateResponse } from '../../core/types';

export class FedExClient extends BaseCarrierClient {
  readonly name = 'FedEx';

  async getRates(request: RateRequest): Promise<RateResponse> {
    // 1. Authenticate
    // 2. Map domain request → FedEx format
    // 3. Call FedEx API
    // 4. Map FedEx response → domain RateResponse
    return { quotes: [] };
  }
}
```

Then register it:

```typescript
shipping.registerCarrier(new FedExClient(config));
```

No changes to `ShippingService` or any other existing code are needed.
