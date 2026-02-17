/**
 * UPS-specific type definitions
 * Maps UPS API structures to/from our internal domain types
 */

/**
 * UPS OAuth Token Response
 */
export interface UPSTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: string;
  scope?: string;
}

/**
 * UPS API Address format
 */
export interface UPSAddress {
  AddressLine?: string[];
  City: string;
  StateProvinceCode: string;
  PostalCode: string;
  CountryCode: string;
  ResidentialAddressIndicator?: string;
}

/**
 * UPS Package Weight
 */
export interface UPSPackageWeight {
  UnitOfMeasurement: {
    Code: string; // "LBS" or "KGS"
  };
  Weight: string;
}

/**
 * UPS Package Dimensions
 */
export interface UPSPackageDimensions {
  UnitOfMeasurement: {
    Code: string; // "IN" or "CM"
  };
  Length: string;
  Width: string;
  Height: string;
}

/**
 * UPS Package
 */
export interface UPSPackage {
  PackagingType: {
    Code: string; // "02" for package/custom
  };
  Dimensions: UPSPackageDimensions;
  PackageWeight: UPSPackageWeight;
}

/**
 * UPS Shipment
 */
export interface UPSShipment {
  Shipper: {
    Address: UPSAddress;
  };
  ShipTo: {
    Address: UPSAddress;
  };
  ShipFrom: {
    Address: UPSAddress;
  };
  Package: UPSPackage | UPSPackage[];
  Service?: {
    Code: string;
  };
}

/**
 * UPS Rate Request
 */
export interface UPSRateRequest {
  RateRequest: {
    Request: {
      TransactionReference?: {
        CustomerContext?: string;
      };
    };
    Shipment: UPSShipment;
  };
}

/**
 * UPS Rated Shipment
 */
export interface UPSRatedShipment {
  Service: {
    Code: string;
    Description?: string;
  };
  TotalCharges: {
    CurrencyCode: string;
    MonetaryValue: string;
  };
  TimeInTransit?: {
    ServiceSummary: {
      EstimatedArrival: {
        Date: string;
      };
      Service: {
        Description: string;
      };
    };
  };
  GuaranteedDelivery?: {
    BusinessDaysInTransit: string;
  };
  RatedShipmentWarning?: Array<{
    Code: string;
    Description: string;
  }>;
}

/**
 * UPS Rate Response
 */
export interface UPSRateResponse {
  RateResponse: {
    Response: {
      ResponseStatus: {
        Code: string;
        Description: string;
      };
      TransactionReference?: {
        CustomerContext?: string;
      };
    };
    RatedShipment: UPSRatedShipment | UPSRatedShipment[];
  };
}

/**
 * UPS Error Response
 */
export interface UPSErrorResponse {
  response?: {
    errors?: Array<{
      code: string;
      message: string;
    }>;
  };
  Fault?: {
    detail: {
      Errors: {
        ErrorDetail: {
          PrimaryErrorCode: {
            Code: string;
            Description: string;
          };
        };
      };
    };
  };
}

/**
 * UPS Service Code Mapping
 */
export const UPS_SERVICE_CODES: Record<string, string> = {
  '01': 'UPS Next Day Air',
  '02': 'UPS 2nd Day Air',
  '03': 'UPS Ground',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early A.M.',
  '65': 'UPS Worldwide Saver',
  '07': 'UPS Worldwide Express',
  '08': 'UPS Worldwide Expedited',
};
