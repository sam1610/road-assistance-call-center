import { defineFunction } from '@aws-amplify/backend';

/**
 * Dedicated passthrough Lambda for the `publishIncidentLiveUpdate` mutation.
 *
 * Amplify Gen 2 requires every custom operation that backs a subscription to
 * carry both an authorization rule and a `.handler(...)` reference.
 * `publishIncidentLiveUpdate` is an internal relay mutation — its only job is
 * to emit an `IncidentLiveUpdate` payload so AppSync can fan it out to
 * subscribers of `onIncidentLiveUpdate`.  The handler simply returns the
 * incoming arguments unchanged.
 *
 * Requirements: 6.9, 2.1, 2.2
 */
export const publishIncidentLiveUpdateFn = defineFunction({
  name: 'publishIncidentLiveUpdate',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
});
