import type { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  LocationClient,
  BatchUpdateDevicePositionCommand,
} from '@aws-sdk/client-location';
import ngeohash from 'ngeohash';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const locationClient = new LocationClient({});

const TABLE_NAME = process.env.ROAD_ASSIST_TABLE_NAME!;
const FLEET_TRACKER_NAME = process.env.FLEET_TRACKER_NAME!;

interface UpdateTruckTelemetryArgs {
  truckId: string;
  locationGeohash: string;
  operationalStatus: string;
}

export const handler: AppSyncResolverHandler<
  UpdateTruckTelemetryArgs,
  boolean
> = async (event) => {
  const { truckId, locationGeohash, operationalStatus } = event.arguments;
  const nowIso = new Date().toISOString();
  const regionZone = locationGeohash.slice(0, 4);
  const { latitude, longitude } = ngeohash.decode(locationGeohash.slice(0, 6));

  // 1. Update TOW_TRUCK_STATUS — merge with existing record to preserve GPS history.
  // Fetch current record first so we can spread existing GPS fields.
  const existing = await ddb.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: `TRUCK#${truckId}`, SK: 'STATUS' },
  }));
  const existingData = typeof existing.Item?.data === 'string'
    ? JSON.parse(existing.Item.data)
    : existing.Item?.data ?? {};

  // If a real geohash is provided (non-empty, non-fallback), update GPS.
  // If the caller passes a stale incident geohash, preserve the truck's own coordinates.
  const isRealGpsUpdate = locationGeohash && locationGeohash !== 'theutx' && locationGeohash !== 'thev0z';

  const updatedData = {
    ...existingData,
    truckId,
    operationalStatus,
    updatedAt: nowIso,
    // Only update GPS fields when this is a genuine driver telemetry update
    ...(isRealGpsUpdate ? {
      locationGeohash,
      currentLat: latitude,
      currentLong: longitude,
    } : {}),
  };

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `TRUCK#${truckId}`, SK: 'STATUS' },
      UpdateExpression: `SET #status = :status, GSI2PK = :gsi2pk, GSI2SK = :gsi2sk,
        #data = :data, recordCreatedAt = :ts,
        createdAt = if_not_exists(createdAt, :ts),
        updatedAt = :ts`,
      ExpressionAttributeNames: { '#status': 'status', '#data': 'data' },
      ExpressionAttributeValues: {
        ':status':  operationalStatus,
        ':gsi2pk':  `FLEET#${operationalStatus}#${regionZone}`,
        ':gsi2sk':  `TYPE#FLATBED#${truckId}`,
        ':data':    JSON.stringify(updatedData),
        ':ts':      nowIso,
      },
    })
  );

  // 2. Stream GPS coordinates to Amazon Location Tracker (evaluates 1.5km Geofence proximity)
  try {
    await locationClient.send(
      new BatchUpdateDevicePositionCommand({
        TrackerName: FLEET_TRACKER_NAME,
        Updates: [
          {
            DeviceId: truckId,
            SampleTime: new Date(),
            Position: [longitude, latitude], // [Long, Lat]
          },
        ],
      })
    );
  } catch (err) {
    console.warn('Tracker position update warning:', err);
  }

  return true;
};