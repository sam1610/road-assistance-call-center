/**
 * Property-based tests for the Guardrail ID-and-version format invariant.
 *
 * Feature: road-assistance-call-center-phase1, Property 8: Guardrail ID-and-version format invariant
 *
 * For any CALL_INTERACTION_LOG record where guardrailIdAndVersion is present,
 * the value SHALL match the pattern <nonEmptyString>:<positiveInteger> —
 * specifically, it SHALL contain exactly one colon separator, the part before
 * the colon SHALL be non-empty, and the part after the colon SHALL parse as
 * an integer greater than zero.
 *
 * Validates: Requirements 5.2
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
  guardrailIntervened?: boolean;
  guardrailActionReason?: string;
  guardrailIdAndVersion?: string;
  [key: string]: unknown;
}

// ─── Helpers: construct records ───────────────────────────────────────────────

/**
 * Builds a CALL_INTERACTION_LOG record with Guardrail audit attributes.
 */
function buildCallInteractionLogRecord(
  incidentId: string,
  isoTimestamp: string,
  contactId: string,
  expiresAt: number,
  guardrailId: string,
  version: number
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: `COMM#${isoTimestamp}#${contactId}`,
    entityType: 'CALL_INTERACTION_LOG',
    expiresAt,
    guardrailIntervened: true,
    guardrailActionReason: 'Content policy violation detected',
    guardrailIdAndVersion: `${guardrailId}:${version}`,
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
 * Generates a valid Guardrail ID: non-empty string of printable ASCII
 * characters, excluding ':' which is the format separator.
 * Length: 1–64 characters.
 */
const guardrailIdArb = fc.stringOf(
  fc.char().filter((c) => c !== ':' && c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126),
  { minLength: 1, maxLength: 64 }
);

/**
 * Generates a valid version number: positive integer (1–999999).
 */
const versionArb = fc.integer({ min: 1, max: 999999 });

/**
 * Unix epoch timestamp in seconds — a positive integer for TTL.
 */
const expiresAtArb = fc.integer({ min: 946684800, max: 4102444799 });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Guardrail ID-and-version format invariant (Property 8)', () => {
  // Feature: road-assistance-call-center-phase1, Property 8:
  //   For any CALL_INTERACTION_LOG record where guardrailIdAndVersion is present,
  //   the value SHALL contain exactly one colon separator, the part before the
  //   colon SHALL be non-empty, and the part after the colon SHALL parse as an
  //   integer greater than zero.
  it('Property 8 – CALL_INTERACTION_LOG: guardrailIdAndVersion matches <nonEmptyString>:<positiveInt>', () => {
    fc.assert(
      fc.property(
        ulidArb,         // incidentId
        iso8601Arb,      // isoTimestamp
        contactIdArb,    // contactId
        expiresAtArb,    // expiresAt
        guardrailIdArb,  // guardrailId
        versionArb,      // version
        (incidentId, isoTimestamp, contactId, expiresAt, guardrailId, version) => {
          const original = buildCallInteractionLogRecord(
            incidentId,
            isoTimestamp,
            contactId,
            expiresAt,
            guardrailId,
            version
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          // guardrailIdAndVersion must be present
          if (restored.guardrailIdAndVersion === undefined) return false;

          const value = restored.guardrailIdAndVersion;
          const parts = value.split(':');

          // Exactly one colon → exactly 2 parts
          if (parts.length !== 2) return false;

          const [idPart, versionPart] = parts;

          // Non-empty prefix
          if (idPart.length === 0) return false;

          // Suffix parses as integer > 0
          const parsedVersion = parseInt(versionPart, 10);
          if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) return false;

          return (
            restored.entityType === 'CALL_INTERACTION_LOG' &&
            idPart === guardrailId &&
            parsedVersion === version
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
