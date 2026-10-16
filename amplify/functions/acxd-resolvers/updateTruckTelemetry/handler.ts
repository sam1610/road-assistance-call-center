import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Arguments supplied by the AppSync `updateTruckTelemetry` mutation.
 *
 * - truckId            — ID of the tow truck (1–36 alphanumeric chars)
 * - locationGeohash   — 6-character geohash encoding the truck's position
 * - operationalStatus — Current truck status: AVAILABLE | DISPATCHED | OFFLINE
 */
interface UpdateTruckTelemetryArgs {
  truckId: string;
  locationGeohash: string;
  operationalStatus: string;
}

/**
 * Phase 1 stub handler for the `updateTruckTelemetry` mutation.
 *
 * The AppSync schema declares this mutation as returning `Boolean`.  The stub
 * unconditionally returns `false` so that `npx ampx sandbox` compiles cleanly
 * and ACXD / IoT callers receive a structurally valid response.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const handler: AppSyncResolverHandler<
  UpdateTruckTelemetryArgs,
  boolean
> = async (_event) => {
  return false;
};
