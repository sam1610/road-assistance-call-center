import type { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { LocationClient, PutGeofenceCommand } from '@aws-sdk/client-location';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const locationClient = new LocationClient({ region: process.env.AWS_REGION || 'us-east-1' });

const TABLE_NAME = process.env.ROAD_ASSIST_TABLE_NAME!;
const GEOFENCE_COLLECTION_NAME = process.env.GEOFENCE_COLLECTION_NAME!;

interface ConfirmDispatchArgs {
  incidentId: string;
  truckId: string;
}

interface DispatchConfirmation {
  truckId: string;
  incidentId: string;
  geofenceStatus: string;
  dispatchTimestamp: string;
}

export const handler: AppSyncResolverHandler<
  ConfirmDispatchArgs,
  DispatchConfirmation
> = async (event) => {
  // Universal adapter: AppSync, Connect classic flow, and Function URL (Agentic CX)
  let args: any = {};
  if ((event as any).arguments) {
    args = (event as any).arguments;
  } else if ((event as any).Details?.Parameters) {
    args = (event as any).Details.Parameters;
  } else if ((event as any).body) {
    const b = (event as any).body;
    args = typeof b === 'string' ? JSON.parse(b) : b;
  } else {
    args = event;
  }
  const { incidentId, truckId: truckIdRaw } = args;

  // If incidentId is missing entirely, fail fast
  if (!incidentId || incidentId === 'undefined') {
    console.error('[confirmDispatchAndGeofence] Missing incidentId:', args);
    return { truckId: truckIdRaw || 'UNKNOWN', incidentId: 'UNKNOWN', geofenceStatus: 'FAILED', dispatchTimestamp: new Date().toISOString() };
  }

  // truckId self-heal: if the agent passed a literal "undefined" (unresolved Agentic CX variable),
  // fall through — we'll read candidateTruckId from the incident record after the GetCommand.
  const truckIdFromArgs = (!truckIdRaw || truckIdRaw === 'undefined') ? null : truckIdRaw;
  const nowIso = new Date().toISOString();
  // Epoch ms padded to 13 digits — invert for newest-first DESC sort
  const invertedTs = String(9999999999999 - Date.now()).padStart(13, '0');
  const ttlThirtyDays = Math.floor(Date.now() / 1000) + 30 * 86400;

  // 1. Fetch Incident Metadata first (truckId may be resolved from it)
  const incResult = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `INC#${incidentId}`, SK: 'METADATA' },
  }));

  const incData =
    typeof incResult.Item?.data === 'string'
      ? JSON.parse(incResult.Item.data)
      : incResult.Item?.data ?? {};

  // Resolve truckId: use args value if valid, otherwise read candidateTruckId from incident
  const truckId = truckIdFromArgs || incData.candidateTruckId || incData.assignedTruckId || null;
  if (!truckId) {
    console.error('[confirmDispatchAndGeofence] Cannot resolve truckId from args or incident record:', incData);
    return { truckId: 'UNKNOWN', incidentId, geofenceStatus: 'FAILED', dispatchTimestamp: new Date().toISOString() };
  }
  console.log(`[confirmDispatchAndGeofence] Resolved truckId: ${truckId} (from ${truckIdFromArgs ? 'args' : 'incident record'})`);

  // Now fetch truck STATUS — truckId is resolved, safe to use here
  const truckStatusResult = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRUCK#${truckId}`, SK: 'STATUS' },
  }));

  // Parse existing truck GPS data — preserved via spread when updating STATUS record
  const existingTruckData =
    typeof truckStatusResult.Item?.data === 'string'
      ? JSON.parse(truckStatusResult.Item.data)
      : truckStatusResult.Item?.data ?? {};

  const customerLat  = Number(incData.customerLat  ?? 26.1645);
  const customerLong = Number(incData.customerLong ?? 50.5123);

  // AI Résumé — synthesise from available incident fields for the Truck Driver view
  // incidentPlate is the field name written by syncIncidentAndMemory; plateNumber is a fallback alias
  const plate = incData.incidentPlate || incData.defaultPlate || incData.plateNumber || incResult.Item?.incidentPlate || 'UNKNOWN';
  const incidentType   = incData.incidentType  || 'ROADSIDE_ASSISTANCE';
  // Resolve geohash: check data blob first, then derive from lat/long if available.
  // The locateAndFindNearestTruck Lambda updates the data blob with locationGeohash,
  // but if that hasn't run yet (e.g. direct dispatch), fall back to coordinate encoding.
  const geohash = incData.locationGeohash
    || (incResult.Item as any)?.locationGeohash
    || (() => {
         try {
           const ngeohash = require('ngeohash');
           return ngeohash.encode(customerLat, customerLong, 4);
         } catch { return 'theu'; }
       })();
  // Dispatch note — brief factual record. The full AI résumé and real sentiment
  // are written by wrapUpIncidentAnalytics after the conversation ends.
  const llmChatSummary = `Truck ${truckId} dispatched for ${incidentType} (${plate}) at ${geohash}. ETA ~${incData.estimatedArrivalMinutes ?? 10} min. Geofence: ${incData.locationGeohash ? 'armed' : 'pending'}.`;
  // Use real sentiment from wrapUp if already written; otherwise leave as PENDING
  const sentimentLabel = (incData.sentimentLabel && incData.sentimentLabel !== 'NEUTRAL') ? incData.sentimentLabel : 'PENDING';
  const sentimentScore: number = typeof incData.sentimentScore === 'number' ? incData.sentimentScore : 0;

  // 2. Create 1,500-meter Circular Geofence in Amazon Location
  let geofenceStatus = 'ACTIVE';
  try {
    await locationClient.send(
      new PutGeofenceCommand({
        CollectionName: GEOFENCE_COLLECTION_NAME,
        GeofenceId: incidentId,
        Geometry: {
          Circle: {
            Center: [customerLong, customerLat],
            Radius: 1500,
          },
        },
      })
    );
  } catch (err) {
    console.error('Geofence creation failed, continuing dispatch:', err);
    geofenceStatus = 'FAILED';
  }

  // 3. Atomic Single-Table Transaction
  await ddb.send(
    new TransactWriteCommand({
      TransactItems: [
        // 3a. Update INCIDENT_METADATA — GSI4 (ops dashboard) + AI résumé + sentiment
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: `INC#${incidentId}`, SK: 'METADATA' },
            UpdateExpression: `SET GSI4PK = :opsDispatched, GSI4SK = :opsSk,
              GSI3PK = :gsi3pk, GSI3SK = :gsi3sk,
              llmChatSummary = :summary,
              sentimentLabel = :sentLabel,
              sentimentScore = :sentScore,
              #data = :incData,
              #status = :statusVal`,
            ExpressionAttributeNames: { '#data': 'data', '#status': 'status' },
            ExpressionAttributeValues: {
              ':opsDispatched': 'OPS_STATUS#DISPATCHED',
              ':opsSk':         `SEV#NORMAL#${nowIso}`,
              // GSI3: TruckActiveIncidentIndex — TRUCK#<id> / ACTIVE#<invertedTs>#<incidentId>
              // Using inverted timestamp so newest dispatches sort first (DESC) on the truck view
              ':gsi3pk':     `TRUCK#${truckId}`,
              ':gsi3sk':     `ACTIVE#${invertedTs}#${incidentId}`,
              ':summary':    llmChatSummary,
              ':sentLabel':  sentimentLabel,
              ':sentScore':  sentimentScore,
              ':statusVal': 'DISPATCHED',           // top-level for EntityStatusIndex
              ':incData': JSON.stringify({
                ...incData,
                incidentStatus:    'DISPATCHED',
                assignedTruckId:   truckId,
                geofenceStatus,
                dispatchTimestamp: nowIso,
                llmChatSummary,
                sentimentLabel,
                sentimentScore,
              }),
            },
          },
        },
        // 3b. Lock truck status — move to DISPATCHED fleet zone, update status + data blob
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: `TRUCK#${truckId}`, SK: 'STATUS' },
            UpdateExpression: `SET GSI3PK = :gsi3pk, GSI3SK = :gsi3sk, GSI2PK = :gsi2pk,
              #st = :dispatched, #data = :truckData`,
            ExpressionAttributeNames: { '#st': 'status', '#data': 'data' },
            ExpressionAttributeValues: {
              ':gsi3pk':    `TRUCK#${truckId}`,
              ':gsi3sk':    `ACTIVE#${invertedTs}#${incidentId}`,
              ':gsi2pk':    `FLEET#DISPATCHED#${geohash.slice(0, 4)}`,
              ':dispatched': 'DISPATCHED',
              // Preserve all existing truck GPS fields (currentLat, currentLong,
              // locationGeohash) — only change operationalStatus and add dispatch info.
              // This prevents the truck marker from jumping to the customer's location.
              ':truckData': JSON.stringify({
                ...existingTruckData,
                truckId,
                operationalStatus:  'DISPATCHED',
                assignedIncidentId: incidentId,
                dispatchTimestamp:  nowIso,
                // GPS fields preserved from existingTruckData via spread above
              }),
            },
          },
        },
        // 3c. Write TRUCK_DISPATCH_LOG with full AI résumé + sentiment for driver table
        {
          Put: {
            TableName: TABLE_NAME,
            Item: {
              PK:           `TRUCK#${truckId}`,
              SK:           `DISPATCH#${invertedTs}#${incidentId}`,
              entityType:   'TRUCK_DISPATCH_LOG',
              GSI3PK:       `TRUCK#${truckId}`,
              GSI3SK:       `ACTIVE#${invertedTs}#${incidentId}`,
              expiresAt:    ttlThirtyDays,
              llmChatSummary,
              sentimentLabel,
              sentimentScore,
              data: JSON.stringify({
                incidentId,
                truckId,
                geofenceStatus,
                dispatchTimestamp: nowIso,
                customerId:        incData.customerId    || '',
                plateNumber:       plate,
                incidentType,
                locationGeohash:   geohash,
                estimatedArrivalMinutes: incData.estimatedArrivalMinutes ?? 10,
                llmChatSummary,
                sentimentLabel,
                sentimentScore,
              }),
            },
          },
        },
      ],
    })
  );

  return { truckId, incidentId, geofenceStatus, dispatchTimestamp: nowIso };
};
