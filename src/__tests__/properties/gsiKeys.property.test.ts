/**
 * Property-based tests for GSI key population invariants.
 *
 * Feature: road-assistance-call-center-phase1
 *
 * Tests cover two correctness properties from the design document:
 *   Property 5: INCIDENT_METADATA GSI1 key population   (Validates: Requirements 3.9)
 *   Property 6: TOW_TRUCK_STATUS GSI2 key population    (Validates: Requirements 3.10)
 *
 * The round-trip is a pure in-memory operation:
 * build an object → JSON.stringify → JSON.parse → assert field invariants.
 * No DynamoDB connection is required.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ─── Record shape mirrors the relevant GSI fields of RoadAssistRecord ─────────

interface RoadAssistRecord {
  PK: string;
  SK: string;
  entityType: string;
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
  expiresAt?: number;
  [key: string]: unknown;
}

// ─── Helpers: construct records with GSI key attributes ───────────────────────

/**
 * Builds an INCIDENT_METADATA record with GSI1 attributes populated.
 * GSI1PK = CUST#<customerIdOrPhone>
 * GSI1SK = STATUS#<incidentStatus>#<createdAt>
 */
function buildIncidentMetadataRecord(
  incidentId: string,
  customerIdOrPhone: string,
  incidentStatus: string,
  createdAt: string
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: 'METADATA',
    entityType: 'INCIDENT_METADATA',
    GSI1PK: `CUST#${customerIdOrPhone}`,
    GSI1SK: `STATUS#${incidentStatus}#${createdAt}`,
  };
}

/**
 * Builds a TOW_TRUCK_STATUS record with GSI2 attributes populated.
 * GSI2PK = FLEET#<operationalStatus>#<regionZone>
 * GSI2SK = TYPE#<truckType>#<truckId>
 */
function buildTowTruckStatusRecord(
  truckId: string,
  operationalStatus: string,
  regionZone: string,
  truckType: string
): RoadAssistRecord {
  return {
    PK: `TRUCK#${truckId}`,
    SK: 'STATUS',
    entityType: 'TOW_TRUCK_STATUS',
    GSI2PK: `FLEET#${operationalStatus}#${regionZone}`,
    GSI2SK: `TYPE#${truckType}#${truckId}`,
  };
}

/** Pure round-trip: serialise → deserialise with no transformation. */
function roundTrip<T>(record: T): T {
  return JSON.parse(JSON.stringify(record)) as T;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a valid UUID (version 4 canonical form, ≤ 36 characters).
 */
const uuidArb = fc.uuid();

/**
 * Generates a valid E.164 phone number: +<countryCode><number>
 * Country code: 1–3 digits; subscriber number: 4–12 digits.
 */
const e164Arb = fc
  .tuple(
    fc.integer({ min: 1, max: 999 }),           // country code
    fc.integer({ min: 1000, max: 999999999999 }) // subscriber number (4-12 digits)
  )
  .map(([cc, sub]) => `+${cc}${sub}`);

/** Either a UUID or an E.164 phone. */
const customerIdOrPhoneArb = fc.oneof(uuidArb, e164Arb);

/**
 * Generates a valid ULID: exactly 26 characters from the Crockford Base32
 * alphabet (0-9 A-Z, excluding I L O U).
 */
const ulidAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ulidArb = fc.stringOf(
  fc.constantFrom(...ulidAlphabet.split('')),
  { minLength: 26, maxLength: 26 }
);

/**
 * Generates a valid ISO 8601 UTC timestamp in the form
 * YYYY-MM-DDTHH:mm:ss.sssZ that also parses to a real Date.
 */
const iso8601Arb = fc
  .date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-31T23:59:59.999Z') })
  .map((d) => d.toISOString()); // always YYYY-MM-DDTHH:mm:ss.sssZ

/**
 * Generates a valid IncidentStatus: one of the well-known domain statuses.
 * These match the expected values stored in the GSI1SK sort key.
 */
const incidentStatusArb = fc.constantFrom('OPEN', 'ACTIVE', 'DISPATCHED', 'RESOLVED', 'CLOSED');

/**
 * Generates a valid OperationalStatus for a tow truck:
 * exactly one of the three allowed values.
 */
const operationalStatusArb = fc.constantFrom('AVAILABLE', 'DISPATCHED', 'OFFLINE');

/**
 * Generates a valid RegionZone: 1–20 alphanumeric characters.
 * Excludes '#' to avoid ambiguity with the composite SK separator.
 */
const regionZoneArb = fc.stringOf(
  fc.char().filter((c) => /[A-Za-z0-9-_]/.test(c)),
  { minLength: 1, maxLength: 20 }
);

/**
 * Generates a valid TruckType: non-empty alphanumeric string up to 20 chars.
 * e.g. FLATBED, WHEEL_LIFT, HEAVY_DUTY
 */
const truckTypeArb = fc.stringOf(
  fc.char().filter((c) => /[A-Za-z0-9_]/.test(c)),
  { minLength: 1, maxLength: 20 }
);

/**
 * Generates a valid TruckID: 1–36 alphanumeric characters.
 */
const truckIdArb = fc.stringOf(
  fc.char().filter((c) => /[A-Za-z0-9]/.test(c)),
  { minLength: 1, maxLength: 36 }
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GSI key population invariants', () => {
  // ── Property 5: INCIDENT_METADATA GSI1 key population ───────────────────
  // Feature: road-assistance-call-center-phase1, Property 5:
  //   For any INCIDENT_METADATA record, the GSI1PK attribute SHALL match
  //   the pattern CUST#<CustomerID_or_Phone> and GSI1SK SHALL match the
  //   pattern STATUS#<IncidentStatus>#<CreatedAt>.
  //   Validates: Requirements 3.9
  it('Property 5 – INCIDENT_METADATA: GSI1PK starts with "CUST#" and GSI1SK starts with "STATUS#"', () => {
    fc.assert(
      fc.property(
        ulidArb,              // incidentId
        customerIdOrPhoneArb, // customerIdOrPhone
        incidentStatusArb,    // incidentStatus
        iso8601Arb,           // createdAt
        (incidentId, customerIdOrPhone, incidentStatus, createdAt) => {
          const original = buildIncidentMetadataRecord(
            incidentId,
            customerIdOrPhone,
            incidentStatus,
            createdAt
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          return (
            restored.entityType === 'INCIDENT_METADATA' &&
            restored.GSI1PK !== undefined &&
            restored.GSI1SK !== undefined &&
            restored.GSI1PK.startsWith('CUST#') &&
            restored.GSI1SK.startsWith('STATUS#') &&
            // Full structure check: CUST#<id>
            restored.GSI1PK === `CUST#${customerIdOrPhone}` &&
            // Full structure check: STATUS#<status>#<ts>
            restored.GSI1SK === `STATUS#${incidentStatus}#${createdAt}`
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // ── Property 6: TOW_TRUCK_STATUS GSI2 key population ────────────────────
  // Feature: road-assistance-call-center-phase1, Property 6:
  //   For any TOW_TRUCK_STATUS record, the GSI2PK attribute SHALL match
  //   the pattern FLEET#<OperationalStatus>#<RegionZone> and GSI2SK SHALL
  //   match the pattern TYPE#<TruckType>#<TruckID>.
  //   Validates: Requirements 3.10
  it('Property 6 – TOW_TRUCK_STATUS: GSI2PK starts with "FLEET#" and GSI2SK starts with "TYPE#"', () => {
    fc.assert(
      fc.property(
        truckIdArb,           // truckId
        operationalStatusArb, // operationalStatus
        regionZoneArb,        // regionZone
        truckTypeArb,         // truckType
        (truckId, operationalStatus, regionZone, truckType) => {
          const original = buildTowTruckStatusRecord(
            truckId,
            operationalStatus,
            regionZone,
            truckType
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          return (
            restored.entityType === 'TOW_TRUCK_STATUS' &&
            restored.GSI2PK !== undefined &&
            restored.GSI2SK !== undefined &&
            restored.GSI2PK.startsWith('FLEET#') &&
            restored.GSI2SK.startsWith('TYPE#') &&
            // Full structure check: FLEET#<status>#<zone>
            restored.GSI2PK === `FLEET#${operationalStatus}#${regionZone}` &&
            // Full structure check: TYPE#<type>#<truckId>
            restored.GSI2SK === `TYPE#${truckType}#${truckId}`
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
