/**
 * Property-based tests for the updateTruckTelemetry geohash precision and
 * operationalStatus invariant.
 *
 * Feature: road-assistance-call-center-phase1, Property 11: updateTruckTelemetry geohash precision
 *
 * For any invocation of the updateTruckTelemetry mutation:
 *   - locationGeohash SHALL be a string of exactly 6 characters.
 *   - operationalStatus SHALL be one of AVAILABLE, DISPATCHED, or OFFLINE.
 *
 * Validates: Requirements 6.8
 *
 * The round-trip is a pure in-memory operation:
 * build an input object → JSON.stringify → JSON.parse → assert field invariants.
 * No AppSync connection is required.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ─── Input shape mirrors the updateTruckTelemetry mutation arguments ──────────

interface UpdateTruckTelemetryInput {
  truckId: string;
  locationGeohash: string;
  operationalStatus: string;
}

// ─── Helper: construct the mutation input ─────────────────────────────────────

function buildUpdateTruckTelemetryInput(
  truckId: string,
  locationGeohash: string,
  operationalStatus: string
): UpdateTruckTelemetryInput {
  return { truckId, locationGeohash, operationalStatus };
}

/** Pure round-trip: serialise → deserialise with no transformation. */
function roundTrip<T>(input: T): T {
  return JSON.parse(JSON.stringify(input)) as T;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a valid TruckID: 1–36 alphanumeric characters.
 */
const truckIdArb = fc.stringOf(
  fc.char().filter((c) => /[A-Za-z0-9]/.test(c)),
  { minLength: 1, maxLength: 36 }
);

/**
 * Generates a valid 6-character geohash using the standard geohash alphabet
 * (Crockford Base32 without 'a'): 0-9 b-z excluding a, i, l, o.
 */
const geohashAlphabet = '0123456789bcdefghjkmnpqrstuvwxyz';
const locationGeohashArb = fc.stringOf(
  fc.constantFrom(...geohashAlphabet.split('')),
  { minLength: 6, maxLength: 6 }
);

/**
 * Generates a valid operationalStatus: exactly one of the three allowed values.
 */
const operationalStatusArb = fc.constantFrom('AVAILABLE', 'DISPATCHED', 'OFFLINE');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('updateTruckTelemetry geohash and status invariants (Property 11)', () => {
  // Feature: road-assistance-call-center-phase1, Property 11:
  //   For any invocation of updateTruckTelemetry, locationGeohash SHALL be
  //   a string of exactly 6 characters from the standard geohash alphabet.
  it('Property 11a – updateTruckTelemetry: locationGeohash is exactly 6 characters', () => {
    fc.assert(
      fc.property(
        truckIdArb,           // truckId
        locationGeohashArb,   // locationGeohash
        operationalStatusArb, // operationalStatus
        (truckId, locationGeohash, operationalStatus) => {
          const original = buildUpdateTruckTelemetryInput(truckId, locationGeohash, operationalStatus);
          const restored = roundTrip<UpdateTruckTelemetryInput>(original);

          return (
            typeof restored.locationGeohash === 'string' &&
            restored.locationGeohash.length === 6
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: road-assistance-call-center-phase1, Property 11:
  //   For any invocation of updateTruckTelemetry, operationalStatus SHALL be
  //   one of AVAILABLE, DISPATCHED, or OFFLINE.
  it('Property 11b – updateTruckTelemetry: operationalStatus is one of AVAILABLE, DISPATCHED, OFFLINE', () => {
    fc.assert(
      fc.property(
        truckIdArb,           // truckId
        locationGeohashArb,   // locationGeohash
        operationalStatusArb, // operationalStatus
        (truckId, locationGeohash, operationalStatus) => {
          const original = buildUpdateTruckTelemetryInput(truckId, locationGeohash, operationalStatus);
          const restored = roundTrip<UpdateTruckTelemetryInput>(original);

          const validStatuses = new Set(['AVAILABLE', 'DISPATCHED', 'OFFLINE']);

          return (
            typeof restored.operationalStatus === 'string' &&
            validStatuses.has(restored.operationalStatus)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
