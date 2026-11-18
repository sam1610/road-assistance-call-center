import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Passthrough Lambda resolver for the `publishIncidentLiveUpdate` mutation.
 *
 * This mutation exists solely to act as the source for the
 * `onIncidentLiveUpdate` AppSync subscription.  Amplify Gen 2 requires every
 * custom mutation/query to carry a `.handler(...)` binding; without it, CDK
 * synthesis fails with:
 *
 *   [InvalidSchemaError] Custom operation onIncidentLiveUpdate requires both
 *   an authorization rule and a handler reference
 *
 * The handler itself performs no DynamoDB writes — it simply echoes the
 * incoming arguments back as the return value.  AppSync then broadcasts that
 * payload to all connected subscriber clients that match the `incidentId`
 * filter.
 *
 * The actual business mutations (`confirmDispatchAndGeofence` and
 * `updateTruckTelemetry`) invoke this mutation via an AppSync mutation call
 * in their own Lambda handlers to trigger the subscription fan-out.
 *
 * Requirements: 6.9, 2.2, 2.3
 */

interface PublishIncidentLiveUpdateArgs {
  incidentId: string;
  incidentStatus: string;
  truckLocationGeohash: string;
  etaMinutes: number;
}

interface IncidentLiveUpdate {
  incidentId: string;
  incidentStatus: string;
  truckLocationGeohash: string;
  etaMinutes: number;
}

export const handler: AppSyncResolverHandler<
  PublishIncidentLiveUpdateArgs,
  IncidentLiveUpdate
> = async (event) => {
  const { incidentId, incidentStatus, truckLocationGeohash, etaMinutes } =
    event.arguments;

  // Passthrough: return the arguments directly so AppSync can fan out to
  // all subscribers of onIncidentLiveUpdate filtered by incidentId.
  return {
    incidentId,
    incidentStatus,
    truckLocationGeohash,
    etaMinutes,
  };
};
