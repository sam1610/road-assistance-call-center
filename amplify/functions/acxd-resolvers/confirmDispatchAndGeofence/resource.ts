import { defineFunction } from '@aws-amplify/backend';

/**
 * Stub Lambda resolver for the confirmDispatchAndGeofence mutation.
 *
 * Receives an AppSync resolver event carrying `incidentId` and `truckId`,
 * writes a TRUCK_DISPATCH_LOG record, and creates an Amazon Location geofence.
 * In Phase 1 this handler is a typed stub — no business logic is implemented.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const confirmDispatchAndGeofenceFn = defineFunction({
  name: 'confirmDispatchAndGeofence',
  entry: './handler.ts',
  runtime: 20,
});
