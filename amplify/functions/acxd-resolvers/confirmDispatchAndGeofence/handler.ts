import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Arguments supplied by the AppSync `confirmDispatchAndGeofence` mutation.
 */
interface ConfirmDispatchAndGeofenceArgs {
  incidentId: string;
  truckId: string;
}

/**
 * Return shape matching the `DispatchConfirmation` AppSync custom type.
 *
 * Fields:
 *  - truckId            — ID of the dispatched tow truck
 *  - incidentId         — Incident the truck is dispatched to
 *  - geofenceStatus     — "CREATED" | "FAILED" (stub always returns "CREATED")
 *  - dispatchTimestamp  — ISO-8601 dispatch time
 *
 * Requirements: 7.1, 7.2, 7.4
 */
interface DispatchConfirmation {
  truckId: string;
  incidentId: string;
  geofenceStatus: string;
  dispatchTimestamp: string;
}

/**
 * Phase 1 stub handler.
 *
 * Returns a conforming `DispatchConfirmation` payload with placeholder values
 * so that `npx ampx sandbox` compiles cleanly and ACXD tool calls receive a
 * structurally valid response.
 */
export const handler: AppSyncResolverHandler<
  ConfirmDispatchAndGeofenceArgs,
  DispatchConfirmation
> = async (_event) => {
  return {
    truckId: '',
    incidentId: '',
    geofenceStatus: 'CREATED',
    dispatchTimestamp: '',
  };
};
