import type { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { LocationClient, CalculateRouteMatrixCommand } from '@aws-sdk/client-location';
import ngeohash from 'ngeohash';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const locationClient = new LocationClient({});

const TABLE_NAME = process.env.ROAD_ASSIST_TABLE_NAME!;
const ROUTE_CALCULATOR_NAME = process.env.ROUTE_CALCULATOR_NAME!;

interface LocateAndFindNearestTruckArgs {
  incidentId: string;
  locationGeohash: string;
}

interface NearestTruckResult {
  truckId: string | null;
  estimatedArrivalMinutes: number;
  truckType: string | null;
  driverPhone: string | null;
}

export const handler: AppSyncResolverHandler<
  LocateAndFindNearestTruckArgs,
  NearestTruckResult
> = async (event) => {
  
  // --- START OF UNIVERSAL ADAPTER ---
  let args: any = {};

  if (event.arguments) {
    // AppSync GraphQL invocation
    args = event.arguments;
  } else if ((event as any).Details?.Parameters) {
    // Amazon Connect classic flow module invocation
    args = (event as any).Details.Parameters;
  } else if ((event as any).body) {
    // Function URL POST with JSON body (Amazon Connect "External" type)
    const body = (event as any).body;
    args = typeof body === 'string' ? JSON.parse(body) : body;
  } else {
    // Direct payload (e.g., from AWS Console Lambda Test tab)
    args = event;
  }
  // --- END OF UNIVERSAL ADAPTER ---

  const { incidentId, locationGeohash } = args;

  // Safety check: ensure required parameters exist before executing math
  if (!incidentId || !locationGeohash) {
    console.error('Missing required args. Received:', args);
    return { 
      truckId: null, 
      estimatedArrivalMinutes: 0, 
      truckType: null, 
      driverPhone: null 
    };
  }

  // 1. Decode coordinates
  const decoded = ngeohash.decode(locationGeohash.slice(0, 6));
  const customerLat = decoded.latitude;
  const customerLong = decoded.longitude;

  // 2. Query ALL available trucks across the entire country.
  //
  // Strategy: fan-out parallel queries across every known 4-char geohash prefix
  // for Bahrain. Amazon Location RouteMatrix then picks the closest by road distance.
  // This avoids the single-zone limitation where a truck in an adjacent zone is
  // missed simply because the customer's geohash prefix differs by one character.
  //
  // For production: replace this list with a country-level GSI scan or a dedicated
  // "country" partition key (e.g. FLEET#AVAILABLE#BH) to avoid hardcoding prefixes.
  const BAHRAIN_GEOHASH_PREFIXES = [
    'theu', 'thev', 'theg', 'thes', 'thew', 'thet', 'they', 'thek',
    'them', 'then', 'thep', 'theq', 'ther', 'thex', 'thez',
  ];

  const zoneResults = await Promise.all(
    BAHRAIN_GEOHASH_PREFIXES.map((zone) =>
      ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'FleetAvailabilityIndex',
          KeyConditionExpression: 'GSI2PK = :pk',
          ExpressionAttributeValues: { ':pk': `FLEET#AVAILABLE#${zone}` },
        })
      ).then((r) => r.Items ?? [])
       .catch(() => [] as any[])
    )
  );

  const candidateTrucks = zoneResults.flat();

  console.log(`[locateAndFindNearestTruck] Found ${candidateTrucks.length} available trucks across all Bahrain zones`);

  if (candidateTrucks.length === 0) {
    console.warn('[locateAndFindNearestTruck] No available trucks in any zone');
    return { 
      truckId: null, 
      estimatedArrivalMinutes: 0, 
      truckType: null,
      driverName: null,
      driverPhone: null 
    };
  }

  // 3. Prepare Amazon Location Route Matrix [Long, Lat]
  const departurePositions: number[][] = candidateTrucks.map((truck) => {
    const payload = typeof truck.data === 'string' ? JSON.parse(truck.data) : truck.data ?? {};
    if (payload.currentLong !== undefined && payload.currentLat !== undefined) {
      return [Number(payload.currentLong), Number(payload.currentLat)];
    }
    const truckCoords = ngeohash.decode(payload.locationGeohash || locationGeohash);
    return [truckCoords.longitude, truckCoords.latitude];
  });

  // 4. Execute AWS Location Service Calculator
  let bestIndex = 0;
  let minDurationSeconds = Number.MAX_SAFE_INTEGER;

  try {
    const matrixResult = await locationClient.send(
      new CalculateRouteMatrixCommand({
        CalculatorName: ROUTE_CALCULATOR_NAME,
        DeparturePositions: departurePositions,
        DestinationPositions: [[customerLong, customerLat]],
        TravelMode: 'Truck', // Esri supports 'Truck' routing
      })
    );

    matrixResult.RouteMatrix?.forEach((row, idx) => {
      const cell = row[0];
      if (cell?.DurationSeconds !== undefined && cell.DurationSeconds < minDurationSeconds) {
        minDurationSeconds = cell.DurationSeconds;
        bestIndex = idx;
      }
    });
  } catch (err) {
    console.warn('RouteMatrix fallback to first available truck:', err);
    minDurationSeconds = 900; // 15 min fallback
  }

  const winningTruck = candidateTrucks[bestIndex];
  const truckData = typeof winningTruck.data === 'string' ? JSON.parse(winningTruck.data) : winningTruck.data ?? {};
  const truckId = (winningTruck.PK as string).replace('TRUCK#', '');
  const etaMinutes = Math.max(1, Math.ceil(minDurationSeconds / 60));
  const truckType = truckData.truckType || 'FLATBED';

  // 5. SAFELY MERGE METADATA (Prevent Data Loss)
  const existingRecord = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `INC#${incidentId}`, SK: 'METADATA' }
    })
  );
  
  const existingData = existingRecord.Item?.data 
    ? JSON.parse(existingRecord.Item.data) 
    : {};

  const mergedData = {
    ...existingData, // Keep customer phone, plate number, payment status
    customerLat,
    customerLong,
    locationGeohash,
    candidateTruckId: truckId,
    estimatedArrivalMinutes: etaMinutes,
    dispatchStatus: 'TRUCK_ASSIGNED',
    truckType,
  };

  // Write GSI3PK/GSI3SK so the driver can query their candidate missions immediately.
  // confirmDispatchAndGeofence will overwrite these with a confirmed ACTIVE pointer;
  // using CANDIDATE prefix here distinguishes pre-confirmation from confirmed dispatch.
  const nowTs = new Date().toISOString();
  const invertedTs = String(9999999999999 - Date.now()).padStart(13, '0');

  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `INC#${incidentId}`, SK: 'METADATA' },
      UpdateExpression: `SET #data = :updatedData,
        GSI3PK = :gsi3pk, GSI3SK = :gsi3sk,
        GSI4PK = :gsi4pk, GSI4SK = :gsi4sk,
        createdAt = if_not_exists(createdAt, :ts),
        updatedAt = :ts`,
      ExpressionAttributeNames: { '#data': 'data' },
      ExpressionAttributeValues: {
        ':updatedData': JSON.stringify(mergedData),
        ':gsi3pk': `TRUCK#${truckId}`,
        ':gsi3sk': `CANDIDATE#${invertedTs}#${incidentId}`,
        ':gsi4pk': 'OPS_STATUS#TRIAGE',
        ':gsi4sk': `SEV#NORMAL#${nowTs}`,
        ':ts':     nowTs,
      },
    })
  );

  // 6. Fetch the PROFILE record for the winning truck to get driver details.
  // The STATUS record (used for fleet queries) contains GPS but not driver info.
  // The PROFILE record contains driverName and driverPhone.
  let driverName: string | null = null;
  let driverPhone: string | null = null;

  try {
    const profileRes = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `TRUCK#${truckId}`, SK: 'PROFILE' },
      })
    );
    if (profileRes.Item?.data) {
      const profileData = typeof profileRes.Item.data === 'string'
        ? JSON.parse(profileRes.Item.data)
        : profileRes.Item.data;
      driverName  = profileData.driverName  || null;
      driverPhone = profileData.driverPhone || null;
    }
  } catch (err) {
    console.warn('[locateAndFindNearestTruck] Could not fetch truck profile:', err);
  }

  console.log(`[locateAndFindNearestTruck] Winner: ${truckId} | ETA: ${etaMinutes}min | Driver: ${driverName} | Phone: ${driverPhone}`);

  return {
    truckId,
    estimatedArrivalMinutes: etaMinutes,
    truckType,
    driverName,
    driverPhone,
  };
};