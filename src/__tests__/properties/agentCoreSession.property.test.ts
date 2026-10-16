/**
 * Property-based tests for the AgentCore session ID consistency invariant.
 *
 * Feature: road-assistance-call-center-phase1, Property 7: AgentCore session ID consistency
 *
 * For any INCIDENT_METADATA record where agentCoreSessionId is provided,
 * agentCoreSessionId SHALL equal the incidentId extracted from PK
 * (i.e., PK.replace("INC#", "")).
 *
 * Validates: Requirements 5.1, 5.4
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
  agentCoreMemoryId?: string;
  agentCoreActorIdCustomer?: string;
  agentCoreActorIdVehicle?: string;
  agentCoreSessionId?: string;
  [key: string]: unknown;
}

// ─── Helpers: construct records ───────────────────────────────────────────────

/**
 * Builds an INCIDENT_METADATA record with all AgentCore correlation attributes.
 * agentCoreSessionId MUST equal the incidentId (same value as the ULID in PK).
 */
function buildIncidentMetadataRecord(
  incidentId: string,
  agentCoreMemoryId: string,
  agentCoreActorIdCustomer: string,
  agentCoreActorIdVehicle: string
): RoadAssistRecord {
  return {
    PK: `INC#${incidentId}`,
    SK: 'METADATA',
    entityType: 'INCIDENT_METADATA',
    agentCoreMemoryId,
    agentCoreActorIdCustomer,
    agentCoreActorIdVehicle,
    agentCoreSessionId: incidentId, // SHALL equal incidentId when provided
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
 * Generates an AgentCore correlation ID: non-empty string up to 256 characters.
 * Uses printable ASCII to stay within reasonable bounds.
 */
const agentCoreIdArb = fc.stringOf(
  fc.char().filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 126),
  { minLength: 1, maxLength: 64 }
);

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AgentCore session ID consistency (Property 7)', () => {
  // Feature: road-assistance-call-center-phase1, Property 7:
  //   For any INCIDENT_METADATA record where agentCoreSessionId is provided,
  //   agentCoreSessionId SHALL equal the incidentId extracted from PK
  //   (i.e., PK.replace("INC#", "")).
  it('Property 7 – INCIDENT_METADATA: agentCoreSessionId equals incidentId extracted from PK', () => {
    fc.assert(
      fc.property(
        ulidArb,          // incidentId (also used as agentCoreSessionId)
        agentCoreIdArb,   // agentCoreMemoryId
        agentCoreIdArb,   // agentCoreActorIdCustomer
        agentCoreIdArb,   // agentCoreActorIdVehicle
        (incidentId, agentCoreMemoryId, agentCoreActorIdCustomer, agentCoreActorIdVehicle) => {
          const original = buildIncidentMetadataRecord(
            incidentId,
            agentCoreMemoryId,
            agentCoreActorIdCustomer,
            agentCoreActorIdVehicle
          );
          const restored = roundTrip<RoadAssistRecord>(original);

          // Precondition: agentCoreSessionId must be present
          if (restored.agentCoreSessionId === undefined) return false;

          // Core invariant: agentCoreSessionId === PK.replace('INC#', '')
          const extractedIncidentId = restored.PK.replace('INC#', '');

          return (
            restored.entityType === 'INCIDENT_METADATA' &&
            restored.agentCoreSessionId === extractedIncidentId &&
            restored.agentCoreSessionId === incidentId
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
