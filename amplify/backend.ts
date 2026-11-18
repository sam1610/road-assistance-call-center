import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { syncIncidentAndMemoryFn } from './functions/acxd-resolvers/syncIncidentAndMemory/resource';
import { locateAndFindNearestTruckFn } from './functions/acxd-resolvers/locateAndFindNearestTruck/resource';
import { confirmDispatchAndGeofenceFn } from './functions/acxd-resolvers/confirmDispatchAndGeofence/resource';
import { wrapUpIncidentAnalyticsFn } from './functions/acxd-resolvers/wrapUpIncidentAnalytics/resource';
import { updateTruckTelemetryFn } from './functions/acxd-resolvers/updateTruckTelemetry/resource';
import { publishIncidentLiveUpdateFn } from './functions/acxd-resolvers/publishIncidentLiveUpdate/resource';
import { startConnectSessionFn } from './functions/acxd-resolvers/startConnectSession/resource';
import { CfnResource } from 'aws-cdk-lib';
import { StreamViewType } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  CfnMap,
  CfnPlaceIndex,
  CfnRouteCalculator,
  CfnGeofenceCollection,
  CfnTracker,
  CfnTrackerConsumer,
} from 'aws-cdk-lib/aws-location';

const backend = defineBackend({
  auth,
  data,
  syncIncidentAndMemoryFn,
  locateAndFindNearestTruckFn,
  confirmDispatchAndGeofenceFn,
  wrapUpIncidentAnalyticsFn,
  updateTruckTelemetryFn,
  publishIncidentLiveUpdateFn,
  startConnectSessionFn,
});

// ─── 1. DynamoDB Streams + TTL ────────────────────────────────────────────────
// Find the Custom::AmplifyDynamoDBTable resource and configure it in-place.
// We do NOT call Stack.of() on it or use cross-stack token references from it.
function findAmplifyDynamoTable(
  scope: import('constructs').IConstruct
): CfnResource | undefined {
  if (
    scope instanceof CfnResource &&
    scope.cfnResourceType === 'Custom::AmplifyDynamoDBTable'
  ) {
    return scope;
  }
  for (const child of scope.node.children) {
    const found = findAmplifyDynamoTable(child);
    if (found) return found;
  }
  return undefined;
}

const tableResource = findAmplifyDynamoTable(backend.data.node.scope!);
if (!tableResource) {
  throw new Error('Custom::AmplifyDynamoDBTable not found');
}

// Configure stream and TTL directly on the custom resource.
// These stay inside the nested stack where the table lives — no cross-stack refs.
tableResource.addPropertyOverride('streamSpecification', {
  streamViewType: StreamViewType.NEW_AND_OLD_IMAGES,
});
tableResource.addPropertyOverride('timeToLiveSpecification', {
  enabled: true,
  attributeName: 'expiresAt',
});

// ─── 2. Amazon Location Service — deployed on the ROOT stack ─────────────────
// Using backend.stack (the root Amplify stack) avoids cross-nested-stack
// resource reference errors that occur when Stack.of(tableResource) resolves
// to the RoadAssistRecord nested stack.
const rootStack = backend.stack;

// ── Environment-scoped resource naming ───────────────────────────────────────
// AWS_BRANCH is set by Amplify CI/CD (e.g. "main", "staging").
// In local sandbox it is undefined — we fall back to "sandbox".
// This prevents resource name collisions between branches and sandbox.
const envSuffix = process.env.AWS_BRANCH ?? 'sandbox';

const placeIndex = new CfnPlaceIndex(rootStack, 'RoadAssistPlaceIndex', {
  indexName: `RoadAssistPlaceIndex-${envSuffix}`,
  dataSource: 'Esri',
});

const routeCalculator = new CfnRouteCalculator(rootStack, 'RoadAssistRouteCalculator', {
  calculatorName: `RoadAssistRouteCalculator-${envSuffix}`,
  dataSource: 'Esri',
});

const geofenceCollection = new CfnGeofenceCollection(rootStack, 'RoadAssistGeofenceCollection', {
  collectionName: `RoadAssistGeofences-${envSuffix}`,
});

const fleetTracker = new CfnTracker(rootStack, 'RoadAssistFleetTracker', {
  trackerName: `RoadAssistFleetTracker-${envSuffix}`,
  positionFiltering: 'AccuracyBased',
});

new CfnTrackerConsumer(rootStack, 'RoadAssistTrackerConsumer', {
  trackerName: fleetTracker.trackerName,
  consumerArn: geofenceCollection.attrCollectionArn,
});

const roadAssistMap = new CfnMap(rootStack, 'RoadAssistMap', {
  mapName: `RoadAssistMap-${envSuffix}`,
  description: 'Road Assistance basemap — Esri Street style',
  configuration: {
    style: 'VectorEsriStreets',
  },
});

// ─── 3. IAM policies for ACXD resolver Lambdas ───────────────────────────────
// DynamoDB: use '*' for the resource ARN to avoid cross-nested-stack token
// references. The Lambdas are scoped to this account/region so this is safe
// for a sandbox POC.
const dynamoPolicy = new PolicyStatement({
  actions: [
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'dynamodb:Query',
    'dynamodb:Scan',
    'dynamodb:BatchGetItem',
    'dynamodb:BatchWriteItem',
    'dynamodb:ConditionCheckItem',
  ],
  resources: ['*'],
});

const locationPolicy = new PolicyStatement({
  actions: [
    'geo:SearchPlaceIndexForText',
    'geo:SearchPlaceIndexForPosition',
    'geo:CalculateRouteMatrix',
    'geo:PutGeofence',
    'geo:BatchUpdateDevicePosition',
    'geo:GetDevicePosition',
    'geo:GetMapStyleDescriptor',
    'geo:GetMapSprites',
    'geo:GetMapGlyphs',
    'geo:GetMapTile',
  ],
  resources: [
    placeIndex.attrIndexArn,
    routeCalculator.attrCalculatorArn,
    geofenceCollection.attrCollectionArn,
    fleetTracker.attrTrackerArn,
    roadAssistMap.attrMapArn,
  ],
});

// The table name is deterministic: RoadAssistRecord-<ApiId>-NONE
// Amplify exposes the AppSync API ID as a stable attribute on the data construct.
const apiId: string = backend.data.resources.graphqlApi.apiId;
const tableName = `RoadAssistRecord-${apiId}-NONE`;

const acxdLambdas = [
  backend.syncIncidentAndMemoryFn,
  backend.locateAndFindNearestTruckFn,
  backend.confirmDispatchAndGeofenceFn,
  backend.wrapUpIncidentAnalyticsFn,
  backend.updateTruckTelemetryFn,
  backend.publishIncidentLiveUpdateFn,
  backend.startConnectSessionFn, // Automatically grants DynamoDB & Location access to the Start Session Lambda
];

for (const fn of acxdLambdas) {
  fn.resources.lambda.addToRolePolicy(dynamoPolicy);
  fn.resources.lambda.addToRolePolicy(locationPolicy);
  fn.addEnvironment('ROAD_ASSIST_TABLE_NAME', tableName);
  fn.addEnvironment('PLACE_INDEX_NAME', placeIndex.indexName);
  fn.addEnvironment('ROUTE_CALCULATOR_NAME', routeCalculator.calculatorName);
  fn.addEnvironment('GEOFENCE_COLLECTION_NAME', geofenceCollection.collectionName);
  fn.addEnvironment('FLEET_TRACKER_NAME', fleetTracker.trackerName);
  fn.addEnvironment('AGENTCORE_MEMORY_ID', 'mem-roadassist-enterprise');
}

// ─── 4. startConnectSession Lambda — Amazon Connect permissions ───────────────
backend.startConnectSessionFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['connect:StartWebRTCContact', 'connect:StartChatContact'],
    resources: ['*'],
  })
);
backend.startConnectSessionFn.addEnvironment(
  'CONNECT_INSTANCE_ID',
  '7fc2e91f-1df5-4ecc-b4c6-b2635f9a7dd6'
);
backend.startConnectSessionFn.addEnvironment(
  'CONNECT_CONTACT_FLOW_ID',
  '2c776546-4a3f-4c5e-8d9a-7a16e1a6dadf'
);

export { backend };