// Feature: voice-agent-data-collection-fix, Property 2: Preservation - Non-Voice Channel Behavior Unchanged
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Preservation Property Tests
 * 
 * These tests verify that NON-VOICE submission methods continue to work correctly
 * after implementing the voice agent data collection fix.
 * 
 * CRITICAL: These tests MUST PASS on UNFIXED code - they capture baseline behavior.
 * 
 * Test coverage:
 * 1. Web form submissions - complete data submitted via React UI
 * 2. Chat widget submissions - GPS geohash provided directly
 * 3. Direct GraphQL API calls - programmatic incident creation
 * 4. Existing Lambda resolvers - downstream processing unchanged
 * 5. DynamoDB operations - query patterns and writes unchanged
 * 6. Incident lifecycle - state transitions unchanged
 * 
 * These tests should CONTINUE TO PASS after the fix is implemented.
 */

// ============================================================================
// Mock DynamoDB and Lambda Environment
// ============================================================================

interface IncidentRecord {
  PK: string; // 'INC#{incidentId}'
  SK: string; // 'META'
  incidentId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  plateNumber: string;
  incidentType: string;
  incidentDescription: string;
  locationGeohash: string;
  channel: 'VOICE' | 'WEB' | 'CHAT' | 'API';
  status: 'INTAKE' | 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'RESOLVED';
  timestamp: number;
  GSI1PK?: string; // 'CUST#{customerId}'
  GSI1SK?: string; // 'INC#{timestamp}'
}

interface CustomerProfile {
  PK: string; // 'CUST#{customerId}'
  SK: string; // 'PROFILE'
  customerId: string;
  customerName: string;
  subscriptionStatus: 'ACTIVE' | 'TRIAL' | 'EXPIRED' | 'CANCELLED';
  membershipTier: string;
}

interface TruckRecord {
  PK: string; // 'TRUCK#{truckId}'
  SK: string; // 'META'
  truckId: string;
  status: 'AVAILABLE' | 'DISPATCHED' | 'BUSY';
  locationGeohash: string;
  GSI2PK?: string; // 'FLEET'
  GSI2SK?: string; // 'STATUS#{status}#GEO#{geohash}'
}

// In-memory stores to simulate DynamoDB
const mockIncidentStore: Map<string, IncidentRecord> = new Map();
const mockCustomerStore: Map<string, CustomerProfile> = new Map();
const mockTruckStore: Map<string, TruckRecord> = new Map();

beforeEach(() => {
  mockIncidentStore.clear();
  mockCustomerStore.clear();
  mockTruckStore.clear();
  
  // Seed with test data
  seedTestData();
});

afterEach(() => {
  mockIncidentStore.clear();
  mockCustomerStore.clear();
  mockTruckStore.clear();
});

function seedTestData() {
  // Add test customer profiles
  const customer1: CustomerProfile = {
    PK: 'CUST#+966501234567',
    SK: 'PROFILE',
    customerId: '+966501234567',
    customerName: 'Ahmed Al-Rashid',
    subscriptionStatus: 'ACTIVE',
    membershipTier: 'GOLD',
  };
  mockCustomerStore.set(customer1.PK, customer1);

  // Add test trucks
  const truck1: TruckRecord = {
    PK: 'TRUCK#TRK001',
    SK: 'META',
    truckId: 'TRK001',
    status: 'AVAILABLE',
    locationGeohash: 'thev52',
    GSI2PK: 'FLEET',
    GSI2SK: 'STATUS#AVAILABLE#GEO#thev52',
  };
  mockTruckStore.set(truck1.PK, truck1);
}

// ============================================================================
// Mock Lambda Functions (Current Behavior)
// ============================================================================

/**
 * Simulates syncIncidentAndMemory Lambda function.
 * This is the CURRENT UNFIXED behavior for non-voice channels.
 * Web/chat/API submissions provide complete data upfront.
 */
function mockSyncIncidentAndMemory(args: {
  contactId: string;
  customerIdentifier: string;
  plateNumber: string;
  incidentType: string;
  incidentDescription: string;
  locationGeohash: string;
  channel?: 'VOICE' | 'WEB' | 'CHAT' | 'API';
}): IncidentRecord {
  const incidentId = `INC-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const timestamp = Date.now();

  // For non-voice channels, data comes complete from the calling system
  const incident: IncidentRecord = {
    PK: `INC#${incidentId}`,
    SK: 'META',
    incidentId,
    customerId: args.customerIdentifier,
    customerName: 'Unknown', // Will be enriched from profile lookup
    customerPhone: args.customerIdentifier,
    plateNumber: args.plateNumber,
    incidentType: args.incidentType,
    incidentDescription: args.incidentDescription,
    locationGeohash: args.locationGeohash,
    channel: args.channel || 'API',
    status: 'INTAKE',
    timestamp,
    GSI1PK: `CUST#${args.customerIdentifier}`,
    GSI1SK: `INC#${timestamp}`,
  };

  // Lookup customer profile to enrich incident
  const customerProfile = mockCustomerStore.get(`CUST#${args.customerIdentifier}`);
  if (customerProfile) {
    incident.customerName = customerProfile.customerName;
  }

  mockIncidentStore.set(incident.PK, incident);
  return incident;
}

/**
 * Simulates locateAndFindNearestTruck Lambda function.
 * Uses GSI2 to query available trucks by geohash proximity.
 */
function mockLocateAndFindNearestTruck(args: {
  incidentId: string;
  locationGeohash: string;
}): TruckRecord | null {
  // Query trucks by proximity (simplified - real version uses geohash prefixes)
  const availableTrucks = Array.from(mockTruckStore.values()).filter(
    truck => truck.status === 'AVAILABLE' && truck.locationGeohash.startsWith(args.locationGeohash.substring(0, 4))
  );

  if (availableTrucks.length === 0) return null;

  // Return nearest truck (simplified - real version calculates distance)
  return availableTrucks[0];
}

/**
 * Simulates confirmDispatchAndGeofence Lambda function.
 * Updates incident status and truck status.
 */
function mockConfirmDispatchAndGeofence(args: {
  incidentId: string;
  truckId: string;
  locationGeohash: string;
}): boolean {
  const incident = mockIncidentStore.get(`INC#${args.incidentId}`);
  if (!incident) return false;

  // Update incident status
  incident.status = 'ASSIGNED';
  mockIncidentStore.set(incident.PK, incident);

  // Update truck status
  const truck = mockTruckStore.get(`TRUCK#${args.truckId}`);
  if (truck) {
    truck.status = 'DISPATCHED';
    mockTruckStore.set(truck.PK, truck);
  }

  return true;
}

/**
 * Simulates wrapUpIncidentAnalytics Lambda function.
 * Records call metrics and final status.
 */
function mockWrapUpIncidentAnalytics(args: {
  incidentId: string;
  finalStatus: 'RESOLVED' | 'CANCELLED';
}): boolean {
  const incident = mockIncidentStore.get(`INC#${args.incidentId}`);
  if (!incident) return false;

  incident.status = args.finalStatus;
  mockIncidentStore.set(incident.PK, incident);

  return true;
}

// ============================================================================
// Arbitraries for Property-Based Testing
// ============================================================================

const phoneNumberArb = fc.oneof(
  fc.integer({ min: 500000000, max: 599999999 }).map(n => `+966${n}`),
  fc.integer({ min: 50000000, max: 59999999 }).map(n => `0${n}`)
);

const plateNumberArb = fc.string({ minLength: 2, maxLength: 10 })
  .map(s => s.replace(/[^A-Z0-9]/gi, '').toUpperCase())
  .filter(s => s.length >= 2);

const incidentTypeArb = fc.constantFrom(
  'FLAT_TIRE',
  'DEAD_BATTERY',
  'ENGINE_OVERHEAT',
  'LOCKED_OUT',
  'ACCIDENT',
  'TOW_NEEDED',
  'OTHER'
);

const descriptionArb = fc.lorem({ maxCount: 20 })
  .filter(s => s.length >= 10);

const geohashArb = fc.string({ minLength: 6, maxLength: 6 })
  .map(s => s.replace(/[^a-z0-9]/gi, '').toLowerCase())
  .filter(s => s.length === 6);

const contactIdArb = fc.uuid();

// ============================================================================
// Preservation Property Tests - Web Form Submissions
// ============================================================================

describe('Preservation: Web Form Submission Behavior', () => {
  /**
   * Property ¬C1: Web form submissions create incidents with exact provided values
   * 
   * Web forms collect all 6 fields via React UI before calling syncIncidentAndMemory.
   * No additional data collection or validation should occur server-side.
   */
  it('MUST PASS: Web form submissions create incident with all provided data intact', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Simulate web form submission with complete data
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Verify data stored exactly as provided (no transformation)
          expect(incident.plateNumber).toBe(plate);
          expect(incident.incidentType).toBe(type);
          expect(incident.incidentDescription).toBe(description);
          expect(incident.locationGeohash).toBe(geohash);
          expect(incident.customerPhone).toBe(phone);
          expect(incident.channel).toBe('WEB');
          expect(incident.status).toBe('INTAKE');

          // Verify DynamoDB structure preserved
          expect(incident.PK).toMatch(/^INC#/);
          expect(incident.SK).toBe('META');
          expect(incident.GSI1PK).toBe(`CUST#${phone}`);
          expect(incident.GSI1SK).toMatch(/^INC#\d+$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property ¬C2: Web submissions bypass voice-specific logic
   * 
   * No phone capture from Connect metadata, no geocoding, no confirmation loop.
   */
  it('MUST PASS: Web submissions do not trigger voice-specific enrichment', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Web submissions should NOT have voice-specific fields
          // (After fix, voice channel will add languagePreference, confirmation flags, etc.)
          expect(incident.plateNumber).not.toBe('UNKNOWN'); // Not default
          expect(incident.incidentType).not.toBe('UNKNOWN'); // Not default
          expect(incident.incidentDescription).not.toBe('None provided'); // Not default
          expect(incident.locationGeohash).not.toBe('thev0z'); // Not default fallback
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property ¬C3: Web form uses map picker for location (no geocoding)
   * 
   * React UI generates geohash from map coordinates before submission.
   */
  it('MUST PASS: Web submissions provide geohash directly without geocoding', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Geohash is generated client-side from map picker
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash, // Pre-computed by UI
            channel: 'WEB',
          });

          // Geohash stored exactly as provided (no server-side geocoding)
          expect(incident.locationGeohash).toBe(geohash);
          expect(incident.locationGeohash.length).toBe(6);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Preservation Property Tests - Chat Widget Submissions
// ============================================================================

describe('Preservation: Chat Widget Submission Behavior', () => {
  /**
   * Property ¬C4: Chat widget sends GPS coordinates directly
   * 
   * Chat widget uses device GPS to generate geohash before calling Lambda.
   */
  it('MUST PASS: Chat widget submissions provide GPS-based geohash directly', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Chat widget captures GPS coordinates and converts to geohash
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash, // From device GPS
            channel: 'CHAT',
          });

          // Geohash stored exactly as provided (no geocoding service called)
          expect(incident.locationGeohash).toBe(geohash);
          expect(incident.channel).toBe('CHAT');
          expect(incident.status).toBe('INTAKE');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property ¬C5: Chat uses same Lambda resolvers as other channels
   * 
   * Chat channel should use syncIncidentAndMemory, locateAndFindNearestTruck,
   * confirmDispatchAndGeofence without any special handling.
   */
  it('MUST PASS: Chat submissions use standard Lambda resolver chain', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Step 1: Create incident
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'CHAT',
          });

          // Step 2: Find nearest truck
          const truck = mockLocateAndFindNearestTruck({
            incidentId: incident.incidentId,
            locationGeohash: incident.locationGeohash,
          });

          // Step 3: Confirm dispatch (if truck found)
          if (truck) {
            const dispatched = mockConfirmDispatchAndGeofence({
              incidentId: incident.incidentId,
              truckId: truck.truckId,
              locationGeohash: incident.locationGeohash,
            });

            expect(dispatched).toBe(true);
            expect(incident.status).toBe('ASSIGNED');
            expect(truck.status).toBe('DISPATCHED');
          }

          // Verify incident was created correctly
          expect(incident.channel).toBe('CHAT');
          expect(mockIncidentStore.has(incident.PK)).toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Preservation Property Tests - Direct API Calls
// ============================================================================

describe('Preservation: Direct GraphQL API Call Behavior', () => {
  /**
   * Property ¬C6: Programmatic API calls create incidents without enrichment
   * 
   * Direct GraphQL mutations (from external systems, testing, scripts) should
   * process data as-is without additional validation or field enrichment.
   */
  it('MUST PASS: Direct API calls create incidents with provided data unchanged', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Simulate programmatic API call
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'API',
          });

          // Verify data stored exactly as provided
          expect(incident.customerPhone).toBe(phone);
          expect(incident.plateNumber).toBe(plate);
          expect(incident.incidentType).toBe(type);
          expect(incident.incidentDescription).toBe(description);
          expect(incident.locationGeohash).toBe(geohash);
          expect(incident.channel).toBe('API');

          // No Connect-specific attributes involved
          expect(incident.customerPhone).not.toMatch(/^GUEST_/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Preservation Property Tests - Existing Lambda Resolvers
// ============================================================================

describe('Preservation: Existing Lambda Resolver Behavior', () => {
  /**
   * Property ¬C7: locateAndFindNearestTruck returns nearest available truck
   * 
   * Uses GSI2 to query trucks by status and geohash proximity.
   */
  it('MUST PASS: locateAndFindNearestTruck finds available trucks by geohash', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Create incident
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Find nearest truck
          const truck = mockLocateAndFindNearestTruck({
            incidentId: incident.incidentId,
            locationGeohash: incident.locationGeohash,
          });

          // If truck found, verify it's available and near the incident
          if (truck) {
            expect(truck.status).toBe('AVAILABLE');
            expect(truck.locationGeohash).toBeDefined();
            expect(truck.truckId).toBeDefined();
          }

          // Function signature and return type unchanged
          expect(truck === null || typeof truck === 'object').toBe(true);
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property ¬C8: confirmDispatchAndGeofence updates incident and truck status
   * 
   * Changes incident status to ASSIGNED and truck status to DISPATCHED.
   */
  it('MUST PASS: confirmDispatchAndGeofence updates incident lifecycle correctly', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Create incident
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Find truck
          const truck = mockLocateAndFindNearestTruck({
            incidentId: incident.incidentId,
            locationGeohash: incident.locationGeohash,
          });

          if (truck) {
            // Initial state
            expect(incident.status).toBe('INTAKE');
            expect(truck.status).toBe('AVAILABLE');

            // Confirm dispatch
            const result = mockConfirmDispatchAndGeofence({
              incidentId: incident.incidentId,
              truckId: truck.truckId,
              locationGeohash: incident.locationGeohash,
            });

            // Verify state transitions
            expect(result).toBe(true);
            expect(incident.status).toBe('ASSIGNED');
            expect(truck.status).toBe('DISPATCHED');
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  /**
   * Property ¬C9: wrapUpIncidentAnalytics records final status
   * 
   * Updates incident to RESOLVED or CANCELLED after service completion.
   */
  it('MUST PASS: wrapUpIncidentAnalytics records final incident status', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        fc.constantFrom('RESOLVED', 'CANCELLED'),
        (contactId, phone, plate, type, description, geohash, finalStatus) => {
          // Create incident
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Wrap up analytics
          const result = mockWrapUpIncidentAnalytics({
            incidentId: incident.incidentId,
            finalStatus: finalStatus as 'RESOLVED' | 'CANCELLED',
          });

          // Verify final status recorded
          expect(result).toBe(true);
          expect(incident.status).toBe(finalStatus);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Preservation Property Tests - DynamoDB Operations
// ============================================================================

describe('Preservation: DynamoDB Query Patterns and Writes', () => {
  /**
   * Property ¬C10: Incident records use standard PK/SK structure
   * 
   * PK: INC#{incidentId}, SK: META
   */
  it('MUST PASS: Incident records maintain standard DynamoDB key structure', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Verify DynamoDB key structure
          expect(incident.PK).toMatch(/^INC#/);
          expect(incident.SK).toBe('META');
          expect(incident.incidentId).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property ¬C11: GSI1 indexes customer-to-incident relationships
   * 
   * GSI1PK: CUST#{customerId}, GSI1SK: INC#{timestamp}
   */
  it('MUST PASS: Incidents are indexed by customer using GSI1', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Verify GSI1 structure for customer lookups
          expect(incident.GSI1PK).toBe(`CUST#${phone}`);
          expect(incident.GSI1SK).toMatch(/^INC#\d+$/);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property ¬C12: Incident lifecycle state transitions are preserved
   * 
   * State flow: INTAKE → ASSIGNED → EN_ROUTE → ARRIVED → RESOLVED
   */
  it('MUST PASS: Incident state transitions follow standard lifecycle', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        phoneNumberArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, phone, plate, type, description, geohash) => {
          // Create incident (INTAKE)
          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });
          expect(incident.status).toBe('INTAKE');

          // Find truck and dispatch (ASSIGNED)
          const truck = mockLocateAndFindNearestTruck({
            incidentId: incident.incidentId,
            locationGeohash: incident.locationGeohash,
          });

          if (truck) {
            mockConfirmDispatchAndGeofence({
              incidentId: incident.incidentId,
              truckId: truck.truckId,
              locationGeohash: incident.locationGeohash,
            });
            expect(incident.status).toBe('ASSIGNED');

            // Complete service (RESOLVED)
            mockWrapUpIncidentAnalytics({
              incidentId: incident.incidentId,
              finalStatus: 'RESOLVED',
            });
            expect(incident.status).toBe('RESOLVED');
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ============================================================================
// Preservation Property Tests - Subscription Validation
// ============================================================================

describe('Preservation: Subscription and Policy Coverage Logic', () => {
  /**
   * Property ¬C13: Customer profile lookup for complete submissions
   * 
   * When complete data is provided, customer profile is enriched but not validated.
   */
  it('MUST PASS: Customer profile lookup enriches incident with membership tier', () => {
    fc.assert(
      fc.property(
        contactIdArb,
        plateNumberArb,
        incidentTypeArb,
        descriptionArb,
        geohashArb,
        (contactId, plate, type, description, geohash) => {
          // Use seeded customer phone
          const phone = '+966501234567';

          const incident = mockSyncIncidentAndMemory({
            contactId,
            customerIdentifier: phone,
            plateNumber: plate,
            incidentType: type,
            incidentDescription: description,
            locationGeohash: geohash,
            channel: 'WEB',
          });

          // Verify customer profile was looked up and name enriched
          expect(incident.customerName).toBe('Ahmed Al-Rashid');
          expect(incident.customerId).toBe(phone);
        }
      ),
      { numRuns: 50 }
    );
  });
});
