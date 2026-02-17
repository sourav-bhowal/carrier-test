/**
 * Mappers to convert between UPS API format and our internal domain types
 */

import { type Address, type Package, type RateQuote, ServiceLevel } from '../../core/types';
import type {
  UPSAddress,
  UPSPackage,
  UPSRatedShipment,
  UPSShipment,
} from './types';
import { UPS_SERVICE_CODES } from './types';

/**
 * Service level to UPS service code mapping
 */
const SERVICE_LEVEL_TO_UPS_CODE: Record<ServiceLevel, string> = {
  [ServiceLevel.GROUND]: '03',
  [ServiceLevel.TWO_DAY]: '02',
  [ServiceLevel.NEXT_DAY]: '01',
  [ServiceLevel.NEXT_DAY_EARLY_AM]: '14',
  [ServiceLevel.THREE_DAY]: '12',
  [ServiceLevel.INTERNATIONAL_ECONOMY]: '08',
  [ServiceLevel.INTERNATIONAL_EXPRESS]: '07',
};

/**
 * UPS service code to our service level mapping
 */
const UPS_CODE_TO_SERVICE_LEVEL: Record<string, ServiceLevel> = {
  '03': ServiceLevel.GROUND,
  '02': ServiceLevel.TWO_DAY,
  '01': ServiceLevel.NEXT_DAY,
  '14': ServiceLevel.NEXT_DAY_EARLY_AM,
  '13': ServiceLevel.NEXT_DAY, // Next Day Air Saver
  '12': ServiceLevel.THREE_DAY,
  '08': ServiceLevel.INTERNATIONAL_ECONOMY,
  '07': ServiceLevel.INTERNATIONAL_EXPRESS,
  '65': ServiceLevel.INTERNATIONAL_ECONOMY, // Worldwide Saver
};

/**
 * Convert our internal Address to UPS format
 */
export function toUPSAddress(address: Address): UPSAddress {
  const addressLines: string[] = [address.addressLine1];
  if (address.addressLine2) {
    addressLines.push(address.addressLine2);
  }

  const upsAddress: UPSAddress = {
    AddressLine: addressLines,
    City: address.city,
    StateProvinceCode: address.stateOrProvinceCode,
    PostalCode: address.postalCode,
    CountryCode: address.countryCode,
  };

  if (address.isResidential) {
    upsAddress.ResidentialAddressIndicator = '1';
  }

  return upsAddress;
}

/**
 * Convert our internal Package to UPS format
 */
export function toUPSPackage(pkg: Package): UPSPackage {
  return {
    PackagingType: {
      Code: '02', // Customer Supplied Package
    },
    Dimensions: {
      UnitOfMeasurement: {
        Code: 'IN', // Inches
      },
      Length: pkg.length.toString(),
      Width: pkg.width.toString(),
      Height: pkg.height.toString(),
    },
    PackageWeight: {
      UnitOfMeasurement: {
        Code: 'LBS', // Pounds
      },
      Weight: pkg.weight.toString(),
    },
  };
}

/**
 * Build UPS shipment object from our rate request
 */
export function buildUPSShipment(
  origin: Address,
  destination: Address,
  packages: Package[],
  serviceLevel?: ServiceLevel
): UPSShipment {
  const shipment: UPSShipment = {
    Shipper: {
      Address: toUPSAddress(origin),
    },
    ShipFrom: {
      Address: toUPSAddress(origin),
    },
    ShipTo: {
      Address: toUPSAddress(destination),
    },
    Package: packages.length === 1 ? toUPSPackage(packages[0]) : packages.map(toUPSPackage),
  };

  // Add service code if specific level requested
  if (serviceLevel) {
    const serviceCode = SERVICE_LEVEL_TO_UPS_CODE[serviceLevel];
    if (serviceCode) {
      shipment.Service = { Code: serviceCode };
    }
  }

  return shipment;
}

/**
 * Convert UPS rated shipment to our internal RateQuote
 */
export function fromUPSRatedShipment(rated: UPSRatedShipment): RateQuote {
  const serviceCode = rated.Service.Code;
  const serviceLevel = UPS_CODE_TO_SERVICE_LEVEL[serviceCode] || ServiceLevel.GROUND;
  const serviceName = UPS_SERVICE_CODES[serviceCode] || rated.Service.Description || 'UPS Service';

  const quote: RateQuote = {
    carrier: 'UPS',
    serviceLevel,
    serviceName,
    totalCost: parseFloat(rated.TotalCharges.MonetaryValue),
    currency: rated.TotalCharges.CurrencyCode,
    isGuaranteed: !!rated.GuaranteedDelivery,
  };

  // Add delivery date if available
  if (rated.TimeInTransit?.ServiceSummary?.EstimatedArrival?.Date) {
    quote.estimatedDeliveryDate = new Date(
      rated.TimeInTransit.ServiceSummary.EstimatedArrival.Date
    );
  }

  // Add transit days if available
  if (rated.GuaranteedDelivery?.BusinessDaysInTransit) {
    quote.transitDays = parseInt(rated.GuaranteedDelivery.BusinessDaysInTransit, 10);
  }

  return quote;
}

/**
 * Get service level from UPS service code
 */
export function getServiceLevelFromCode(code: string): ServiceLevel {
  return UPS_CODE_TO_SERVICE_LEVEL[code] || ServiceLevel.GROUND;
}

/**
 * Get UPS service code from service level
 */
export function getUPSCodeFromServiceLevel(level: ServiceLevel): string {
  return SERVICE_LEVEL_TO_UPS_CODE[level] || '03';
}
