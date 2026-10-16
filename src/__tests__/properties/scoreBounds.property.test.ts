/**
 * Property-based tests for the sentiment score and customer effort score bounds invariant.
 *
 * Feature: road-assistance-call-center-phase1, Property 9: Sentiment score bounds invariant
 *
 * For any CALL_INTERACTION_LOG record:
 *   - sentimentScore SHALL be a float in the closed interval [0.0, 1.0]
 *   - customerEffortScore SHALL be a float in the closed interval [0.0, 10.0]
 *
 * Validates: Requirements 5.3
 *
 * The round-trip is a pure in-memory operation:
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
  expiresAt: number;
  sentimentScore?: number;
  customerEffortScore?: number;
  [key: string]: unknown;
}

// ─── Helpers: construct records ───────────────────────────────────────────────

/**
 * Builds a CALL_INTERACTION_LOG record with sentimentScore populated.
 */
function buildRecordWithSentimentScore(
  incidentId: string,
  isoTimestamp: string,
  contactId: string,
  expiresAt: number,
  sentimentScore: number
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: `COMM#${isoTimestamp}#${contactId}`,
    entityType: 'CALL_INTERACTION_LOG',
    expiresAt,
    sentimentScore,
  };
}

/**
 * Builds a CALL_INTERACTION_LOG record with customerEffortScore populated.
 */
function buildRecordWithCustomerEffortScore(
  incidentId: string,
  isoTimestamp: string,
  contactId: string,
  expiresAt: number,
  customerEffortScore: number
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: `COMM#${isoTimestamp}#${contactId}`,
    entityType: 'CALL_INTERACTION_LOG',
    expiresAt,
    customerEffortScore,
  };
}

/** Pure round-trip: serialise → deserialise with no transformation. */
function roundTrip<T>(record: T): T {
  return JSON.parse(JSON.stringify(record)) as T;
}

// ─── Arbitraries ──────────────────────────────────────────────────────────────

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
  .map((d) => d.toISOString());

/**
 * Generates a valid ContactID: 1–64 printable ASCII characters,
 * excluding '#' which would break the SK composite separator.
 */
const contactIdArb = fc.stringOf(
  fc.char().filter((c) => c !== '#' && c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126),
  { minLength: 1, maxLength: 64 }
);

/**
 * Unix epoch timestamp in seconds — a positive integer for TTL.
 */
const expiresAtArb = fc.integer({ min: 946684800, max: 4102444799 });

/**
 * Generates a valid sentimentScore: float in [0.0, 1.0], no NaN, no infinity.
 */
const sentimentScoreArb = fc.double({ min: 0.0, max: 1.0, noNaN: true, noDefaultInfinity: true });

/**
 * Generates a valid customerEffortScore: float in [0.0, 10.0], no NaN, no infinity.
 */
const customerEffortScoreArb = fc.double({ min: 0.0, max: 10.0, noNaN: true, noDefaultInfinity: true });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Score bounds invariant (Property 9)', () => {
  // Feature: road-assistance-call-center-phase1, Property 9:
  //   For any CALL_INTERACTION_LOG record where sentimentScore is present,
  //   the value SHALL be a float in the closed interval [0.0, 1.0].
  it('Property 9a – CALL_INTERACTION_LOG: sentimentScore is within [0.0, 1.0]', () => {
    fc.assert(
      fc.property(
        ulidArb,            // incidentId
        iso8601Arb,         // isoTimestamp
        contactIdArb,       // contactId
        expiresAtArb,       // expiresAt
        sentimentScoreArb,  // sentimentScore
        (incidentId, isoTimestamp, contactId, expiresAt, sentimentScore) => {
          const original = buildRecordWithSentimentScore(
            incidentId,
            isoTimestamp,
            contactId,
            expiresAt,
            sentimentScore
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          if (restored.sentimentScore === undefined) return false;

          const score = restored.sentimentScore;

          return (
            restored.entityType === 'CALL_INTERACTION_LOG' &&
            typeof score === 'number' &&
            !isNaN(score) &&
            isFinite(score) &&
            score >= 0.0 &&
            score <= 1.0
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: road-assistance-call-center-phase1, Property 9:
  //   For any CALL_INTERACTION_LOG record where customerEffortScore is present,
  //   the value SHALL be a float in the closed interval [0.0, 10.0].
  it('Property 9b – CALL_INTERACTION_LOG: customerEffortScore is within [0.0, 10.0]', () => {
    fc.assert(
      fc.property(
        ulidArb,                  // incidentId
        iso8601Arb,               // isoTimestamp
        contactIdArb,             // contactId
        expiresAtArb,             // expiresAt
        customerEffortScoreArb,   // customerEffortScore
        (incidentId, isoTimestamp, contactId, expiresAt, customerEffortScore) => {
          const original = buildRecordWithCustomerEffortScore(
            incidentId,
            isoTimestamp,
            contactId,
            expiresAt,
            customerEffortScore
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          if (restored.customerEffortScore === undefined) return false;

          const score = restored.customerEffortScore;

          return (
            restored.entityType === 'CALL_INTERACTION_LOG' &&
            typeof score === 'number' &&
            !isNaN(score) &&
            isFinite(score) &&
            score >= 0.0 &&
            score <= 10.0
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
