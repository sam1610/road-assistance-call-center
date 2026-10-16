import { defineFunction } from '@aws-amplify/backend';

/**
 * Lambda resolver stub for the locateAndFindNearestTruck AppSync query.
 *
 * Accepts (incidentId: String!, locationGeohash: String!) and returns a
 * NearestTruckResult. In Phase 1 the handler returns a typed stub; no
 * business logic is required.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const locateAndFindNearestTruckFn = defineFunction({
  name: 'locateAndFindNearestTruck',
  entry: './handler.ts',
  runtime: 20,
});
