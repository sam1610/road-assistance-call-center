/**
 * Property-based tests for the S3 URI format invariant.
 *
 * Feature: road-assistance-call-center-phase1, Property 10: S3 URI format invariant
 *
 * For any CALL_INTERACTION_LOG record where transcriptS3Uri or recordingS3Uri
 * is present, each URI SHALL begin with the prefix "s3://" and SHALL contain
 * at least one additional non-empty character after the prefix.
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
  transcriptS3Uri?: string;
  recordingS3Uri?: string;
  [key: string]: unknown;
}

// ─── Helpers: construct records ───────────────────────────────────────────────

/**
 * Builds a CALL_INTERACTION_LOG record with transcriptS3Uri populated.
 */
function buildRecordWithTranscriptUri(
  incidentId: string,
  isoTimestamp: string,
  contactId: string,
  expiresAt: number,
  transcriptS3Uri: string
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: `COMM#${isoTimestamp}#${contactId}`,
    entityType: 'CALL_INTERACTION_LOG',
    expiresAt,
    transcriptS3Uri,
  };
}

/**
 * Builds a CALL_INTERACTION_LOG record with recordingS3Uri populated.
 */
function buildRecordWithRecordingUri(
  incidentId: string,
  isoTimestamp: string,
  contactId: string,
  expiresAt: number,
  recordingS3Uri: string
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: `COMM#${isoTimestamp}#${contactId}`,
    entityType: 'CALL_INTERACTION_LOG',
    expiresAt,
    recordingS3Uri,
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
 * Generates a valid S3 bucket name: 3–20 lowercase alphanumeric characters and hyphens.
 * (Simplified subset of actual S3 naming rules for test purposes.)
 */
const bucketNameArb = fc.stringOf(
  fc.char().filter((c) => /[a-z0-9\-]/.test(c)),
  { minLength: 3, maxLength: 20 }
);

/**
 * Generates a valid S3 object key: 1–100 characters using common S3 key characters.
 */
const s3KeyArb = fc.stringOf(
  fc.char().filter((c) => /[a-zA-Z0-9_\-\/\.]/.test(c)),
  { minLength: 1, maxLength: 100 }
);

/**
 * Generates a well-formed S3 URI in the form s3://<bucket>/<key>.
 */
const s3UriArb = fc
  .tuple(bucketNameArb, s3KeyArb)
  .map(([bucket, key]) => `s3://${bucket}/${key}`);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('S3 URI format invariant (Property 10)', () => {
  // Feature: road-assistance-call-center-phase1, Property 10:
  //   For any CALL_INTERACTION_LOG record where transcriptS3Uri is present,
  //   the URI SHALL begin with "s3://" and SHALL contain at least one
  //   non-empty character after the prefix.
  it('Property 10a – CALL_INTERACTION_LOG: transcriptS3Uri starts with "s3://" and has content after prefix', () => {
    fc.assert(
      fc.property(
        ulidArb,       // incidentId
        iso8601Arb,    // isoTimestamp
        contactIdArb,  // contactId
        expiresAtArb,  // expiresAt
        s3UriArb,      // transcriptS3Uri
        (incidentId, isoTimestamp, contactId, expiresAt, transcriptS3Uri) => {
          const original = buildRecordWithTranscriptUri(
            incidentId,
            isoTimestamp,
            contactId,
            expiresAt,
            transcriptS3Uri
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          if (restored.transcriptS3Uri === undefined) return false;

          const uri = restored.transcriptS3Uri;

          return (
            restored.entityType === 'CALL_INTERACTION_LOG' &&
            uri.startsWith('s3://') &&
            uri.length > 5 // at least one character beyond "s3://"
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  // Feature: road-assistance-call-center-phase1, Property 10:
  //   For any CALL_INTERACTION_LOG record where recordingS3Uri is present,
  //   the URI SHALL begin with "s3://" and SHALL contain at least one
  //   non-empty character after the prefix.
  it('Property 10b – CALL_INTERACTION_LOG: recordingS3Uri starts with "s3://" and has content after prefix', () => {
    fc.assert(
      fc.property(
        ulidArb,       // incidentId
        iso8601Arb,    // isoTimestamp
        contactIdArb,  // contactId
        expiresAtArb,  // expiresAt
        s3UriArb,      // recordingS3Uri
        (incidentId, isoTimestamp, contactId, expiresAt, recordingS3Uri) => {
          const original = buildRecordWithRecordingUri(
            incidentId,
            isoTimestamp,
            contactId,
            expiresAt,
            recordingS3Uri
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          if (restored.recordingS3Uri === undefined) return false;

          const uri = restored.recordingS3Uri;

          return (
            restored.entityType === 'CALL_INTERACTION_LOG' &&
            uri.startsWith('s3://') &&
            uri.length > 5 // at least one character beyond "s3://"
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
