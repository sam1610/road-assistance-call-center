import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Arguments received from the AppSync locateAndFindNearestTruck query.
 * Requirements: 6.2, 7.2
 */
interface LocateAndFindNearestTruckArgs {
  incidentId: string;
  locationGeohash: string;
}

/**
 * Shape mirrors the NearestTruckResult custom type defined in
 * amplify/data/resource.ts.
 * Requirements: 6.1
 */
interface NearestTruckResult {
  truckId: string | null;
  estimatedArrivalMinutes: number;
  truckType: string | null;
}

/**
 * Phase 1 stub handler — returns a placeholder NearestTruckResult so that
 * `npx ampx sandbox` compiles cleanly. No fleet-query or route-matrix logic
 * is implemented here.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const handler: AppSyncResolverHandler<
  LocateAndFindNearestTruckArgs,
  NearestTruckResult
> = async (_event) => {
  return {
    truckId: null,
    estimatedArrivalMinutes: 0,
    truckType: null,
  };
};
