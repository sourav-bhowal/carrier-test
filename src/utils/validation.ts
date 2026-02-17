/**
 * Runtime validation utilities using Zod
 * Provides type-safe validation for all domain models
 */

import { z } from 'zod';
import { ValidationError } from '../core/errors';
import { ServiceLevel } from '../core/types';

/**
 * Address schema
 */
export const AddressSchema = z.object({
  addressLine1: z.string().min(1, 'Address line 1 is required'),
  addressLine2: z.string().optional(),
  city: z.string().min(1, 'City is required'),
  stateOrProvinceCode: z.string().min(2).max(3),
  postalCode: z.string().min(1, 'Postal code is required'),
  countryCode: z.string().length(2, 'Country code must be 2 characters (ISO 3166-1 alpha-2)'),
  isResidential: z.boolean().optional(),
});

/**
 * Package schema
 */
export const PackageSchema = z.object({
  weight: z.number().positive('Weight must be positive'),
  length: z.number().positive('Length must be positive'),
  width: z.number().positive('Width must be positive'),
  height: z.number().positive('Height must be positive'),
  reference: z.string().optional(),
});

/**
 * Service level schema
 */
export const ServiceLevelSchema = z.nativeEnum(ServiceLevel);

/**
 * Rate request schema
 */
export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1, 'At least one package is required'),
  serviceLevel: ServiceLevelSchema.optional(),
  shipDate: z.date().optional(),
});

/**
 * Validate input against a schema
 * Throws ValidationError if validation fails
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues.map((e: z.ZodIssue) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      throw new ValidationError(
        `Validation failed: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
        details
      );
    }
    throw error;
  }
}

/**
 * Safe validation that returns a result object instead of throwing
 */
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: ValidationError } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const details = error.issues.map((e: z.ZodIssue) => ({
        path: e.path.join('.'),
        message: e.message,
      }));
      return {
        success: false,
        error: new ValidationError(
          `Validation failed: ${error.issues.map((e: z.ZodIssue) => e.message).join(', ')}`,
          details
        ),
      };
    }
    return {
      success: false,
      error: new ValidationError('Unknown validation error', error),
    };
  }
}
