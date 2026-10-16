import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { syncIncidentAndMemoryFn } from './functions/acxd-resolvers/syncIncidentAndMemory/resource';
import { locateAndFindNearestTruckFn } from './functions/acxd-resolvers/locateAndFindNearestTruck/resource';
import { confirmDispatchAndGeofenceFn } from './functions/acxd-resolvers/confirmDispatchAndGeofence/resource';
import { wrapUpIncidentAnalyticsFn } from './functions/acxd-resolvers/wrapUpIncidentAnalytics/resource';
import { updateTruckTelemetryFn } from './functions/acxd-resolvers/updateTruckTelemetry/resource';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import { CfnTable } from 'aws-cdk-lib/aws-dynamodb';

/**
 * Amplify Gen 2 backend entry point for the Road Assistance Agentic Call Center.
 *
 * Wires together:
 *   - Cognito auth (email + phone login, custom membership/plate attributes)
 *   - AppSync data layer (single-table DynamoDB schema, five ACXD tool resolvers)
 *   - Five stub Lambda resolvers that back the ACXD AppSync tools
 *
 * Requirements: 7.5
 */
const backend = defineBackend({
  auth,
  data,
  syncIncidentAndMemoryFn,
  locateAndFindNearestTruckFn,
  confirmDispatchAndGeofenceFn,
  wrapUpIncidentAnalyticsFn,
  updateTruckTelemetryFn,
});

// ─── CDK L2 Overrides: DynamoDB Streams + TTL (Requirements: 8.1–8.5) ──────

// Obtain the underlying CfnTable from the Amplify data resource.
// Amplify Gen 2 exposes it through backend.data.resources.tables.
const tableResource = backend.data.resources.tables['RoadAssistRecord'];

if (!tableResource) {
  throw new Error('RoadAssistRecord: CfnTable not found');
}

const cfnTable = tableResource.node.defaultChild as CfnTable;

if (!cfnTable) {
  throw new Error('RoadAssistRecord: CfnTable not found');
}

// Requirement 8.1: Enable DynamoDB Streams with NEW_AND_OLD_IMAGES view type.
cfnTable.streamSpecification = { streamViewType: 'NEW_AND_OLD_IMAGES' };

// Requirement 8.2: Enable TTL on the expiresAt attribute.
cfnTable.timeToLiveSpecification = { attributeName: 'expiresAt', enabled: true };

// Requirement 8.5: Synthesis-time guard — assert both overrides are set.
if (!cfnTable.streamSpecification || !cfnTable.timeToLiveSpecification) {
  throw new Error(
    'RoadAssistRecord: CDK synthesis guard failed — streamSpecification and timeToLiveSpecification must both be set on CfnTable',
  );
}

// Requirement 8.3: Export the DynamoDB Stream ARN as a CloudFormation output.
const stack = Stack.of(cfnTable);
new CfnOutput(stack, 'RoadAssistRecordStreamArn', {
  exportName: 'RoadAssistRecordStreamArn',
  value: cfnTable.attrStreamArn,
  description: 'ARN of the DynamoDB Stream for RoadAssistRecord table',
});

export { backend };
