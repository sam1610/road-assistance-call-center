/**
 * Property-based tests for DynamoDB key-pattern round-trips.
 *
 * Feature: road-assistance-call-center-phase1
 *
 * Tests cover four correctness properties from the design document:
 *   Property 1:  CUSTOMER_PROFILE key round-trip      (Validates: Requirements 3.2)
 *   Property 2:  INCIDENT_METADATA key round-trip     (Validates: Requirements 3.4)
 *   Property 3:  CALL_INTERACTION_LOG SK sort-order   (Validates: Requirements 3.5)
 *   Property 12: TRUCK_DISPATCH_LOG SK sort-order     (Validates: Requirements 3.7)
 *
 * The "serialise/deserialise" round-trip is a pure in-memory operation:
 * build an object → JSON.stringify → JSON.parse → assert field invariants.
 * No DynamoDB connection is required.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';

// ─── Record shape mirrors the relevant fields of RoadAssistRecord ─────────────

interface RoadAssistRecord {
  PK: string;
  SK: string;
  entityType: string;
  expiresAt?: number;
  [key: string]: unknown;
}

// ─── Helpers: construct key values ────────────────────────────────────────────

function buildCustomerProfileRecord(customerIdOrPhone: string): RoadAssistRecord {
  return {
    PK: `CUST#${customerIdOrPhone}`,
    SK: 'PROFILE',
    entityType: 'CUSTOMER_PROFILE',
  };
}

function buildIncidentMetadataRecord(ulid: string): RoadAssistRecord {
  return {
    PK: `INC#${ulid}`,
    SK: 'METADATA',
    entityType: 'INCIDENT_METADATA',
  };
}

function buildCallInteractionLogSK(isoTimestamp: string, contactId: string): string {
  return `COMM#${isoTimestamp}#${contactId}`;
}

function buildTruckDispatchLogSK(isoTimestamp: string, incidentId: string): string {
  return `DISPATCH#${isoTimestamp}#${incidentId}`;
}

/** Pure round-trip: serialise → deserialise with no transformation. */
function roundTrip<T>(record: T): T {
  return JSON.parse(JSON.stringify(record)) as T;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

/**
 * Generates a valid UUID (version 4 canonical form, ≤ 36 characters).
 * Uses fast-check's built-in uuid arbitrary which produces RFC 4122 strings.
 */
const uuidArb = fc.uuid();

/**
 * Generates a valid E.164 phone number:  +<countryCode><number>
 * Country code: 1–3 digits; subscriber number: 4–12 digits.
 * Total length ≤ 16 characters (well within the ≤ 36 char limit).
 */
const e164Arb = fc
  .tuple(
    fc.integer({ min: 1, max: 999 }),          // country code
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
const ulidArb = fc
  .stringOf(fc.constantFrom(...ulidAlphabet.split('')), { minLength: 26, maxLength: 26 });

/**
 * Generates a valid ISO 8601 UTC timestamp in the form
 * YYYY-MM-DDTHH:mm:ss.sssZ that also parses to a real Date.
 *
 * We rely on fc.date() and format it manually so every generated value is a
 * real calendar date and parses back to the same numeric timestamp.
 */
const iso8601Arb = fc
  .date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-31T23:59:59.999Z') })
  .map((d) => d.toISOString()); // always YYYY-MM-DDTHH:mm:ss.sssZ

/**
 * Generates a valid ContactID: 1–64 printable ASCII characters,
 * excluding '#' which would break the SK composite separator.
 */
const contactIdArb = fc.stringOf(
  fc.char().filter((c) => c !== '#' && c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126),
  { minLength: 1, maxLength: 64 }
);

/**
 * Generates a valid TruckID: 1–36 alphanumeric characters.
 */
const truckIdArb = fc.stringOf(
  fc.char().filter((c) => /[A-Za-z0-9]/.test(c)),
  { minLength: 1, maxLength: 36 }
);

/**
 * Generates two distinct ISO 8601 timestamps where t1 < t2.
 * Returns them as `{ earlier, later }` so tests stay readable.
 */
const orderedTimestampPairArb = fc
  .tuple(
    fc.date({ min: new Date('2000-01-01T00:00:00.000Z'), max: new Date('2099-12-30T23:59:59.998Z') }),
    fc.integer({ min: 1, max: 86_400_000 }) // offset in ms (at least 1 ms, at most 1 day)
  )
  .map(([base, offsetMs]) => ({
    earlier: base.toISOString(),
    later: new Date(base.getTime() + offsetMs).toISOString(),
  }));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Key-pattern round-trip properties', () => {
  // ── Property 1: CUSTOMER_PROFILE key round-trip ─────────────────────────
  // Feature: road-assistance-call-center-phase1, Property 1:
  //   For any valid CustomerID_or_Phone, serialising and deserialising a
  //   CUSTOMER_PROFILE record SHALL yield PK starting with "CUST#",
  //   SK === "PROFILE", and entityType === "CUSTOMER_PROFILE".
  it('Property 1 – CUSTOMER_PROFILE: round-trip preserves PK prefix, SK, and entityType', () => {
    fc.assert(
      fc.property(customerIdOrPhoneArb, (id) => {
        const original = buildCustomerProfileRecord(id);
        const restored = roundTrip<RoadAssistRecord>(original);

        return (
          restored.PK.startsWith('CUST#') &&
          restored.SK === 'PROFILE' &&
          restored.entityType === 'CUSTOMER_PROFILE'
        );
      }),
      { numRuns: 100 }
    );
  });

  // ── Property 2: INCIDENT_METADATA key round-trip ────────────────────────
  // Feature: road-assistance-call-center-phase1, Property 2:
  //   For any valid ULID of exactly 26 characters, serialising and
  //   deserialising an INCIDENT_METADATA record SHALL yield PK starting
  //   with "INC#", SK === "METADATA", and entityType === "INCIDENT_METADATA".
  it('Property 2 – INCIDENT_METADATA: round-trip preserves PK prefix, SK, and entityType', () => {
    fc.assert(
      fc.property(ulidArb, (ulid) => {
        // Precondition: ULID must be exactly 26 characters
        fc.pre(ulid.length === 26);

        const original = buildIncidentMetadataRecord(ulid);
        const restored = roundTrip<RoadAssistRecord>(original);

        return (
          restored.PK.startsWith('INC#') &&
          restored.SK === 'METADATA' &&
          restored.entityType === 'INCIDENT_METADATA'
        );
      }),
      { numRuns: 100 }
    );
  });

  // ── Property 3: CALL_INTERACTION_LOG SK sort-order preservation ──────────
  // Feature: road-assistance-call-center-phase1, Property 3:
  //   For any two CALL_INTERACTION_LOG records sharing the same PK, the
  //   lexicographic order of their SK values SHALL equal the chronological
  //   order of their timestamps.
  it('Property 3 – CALL_INTERACTION_LOG: lexicographic SK order equals chronological timestamp order', () => {
    fc.assert(
      fc.property(
        ulidArb,               // shared incidentId
        orderedTimestampPairArb,
        contactIdArb,          // contactId for the first record
        contactIdArb,          // contactId for the second record
        (incidentId, { earlier, later }, contactId1, contactId2) => {
          const sharedPK = `INC#${incidentId}`;

          const sk1 = buildCallInteractionLogSK(earlier, contactId1);
          const sk2 = buildCallInteractionLogSK(later, contactId2);

          // t1 < t2  ⟹  sk1 < sk2 lexicographically
          // ISO 8601 UTC timestamps are lexicographically sortable by design.
          const lexicographicOrder = sk1 < sk2 ? -1 : sk1 > sk2 ? 1 : 0;
          const chronologicalOrder = earlier < later ? -1 : earlier > later ? 1 : 0;

          // Both records share the same PK (consistency check)
          const record1 = roundTrip({ PK: sharedPK, SK: sk1, entityType: 'CALL_INTERACTION_LOG' });
          const record2 = roundTrip({ PK: sharedPK, SK: sk2, entityType: 'CALL_INTERACTION_LOG' });

          return (
            record1.PK === record2.PK &&
            lexicographicOrder === chronologicalOrder
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // ── Property 12: TRUCK_DISPATCH_LOG SK sort-order preservation ───────────
  // Feature: road-assistance-call-center-phase1, Property 12:
  //   For any two TRUCK_DISPATCH_LOG records sharing the same PK, the
  //   lexicographic order of their SK values SHALL equal the chronological
  //   order of their dispatch timestamps.
  it('Property 12 – TRUCK_DISPATCH_LOG: lexicographic SK order equals chronological timestamp order', () => {
    fc.assert(
      fc.property(
        truckIdArb,            // shared truckId
        orderedTimestampPairArb,
        ulidArb,               // incidentId for the first log entry
        ulidArb,               // incidentId for the second log entry
        (truckId, { earlier, later }, incidentId1, incidentId2) => {
          const sharedPK = `TRUCK#${truckId}`;

          const sk1 = buildTruckDispatchLogSK(earlier, incidentId1);
          const sk2 = buildTruckDispatchLogSK(later, incidentId2);

          const lexicographicOrder = sk1 < sk2 ? -1 : sk1 > sk2 ? 1 : 0;
          const chronologicalOrder = earlier < later ? -1 : earlier > later ? 1 : 0;

          const record1 = roundTrip({ PK: sharedPK, SK: sk1, entityType: 'TRUCK_DISPATCH_LOG' });
          const record2 = roundTrip({ PK: sharedPK, SK: sk2, entityType: 'TRUCK_DISPATCH_LOG' });

          return (
            record1.PK === record2.PK &&
            lexicographicOrder === chronologicalOrder
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
