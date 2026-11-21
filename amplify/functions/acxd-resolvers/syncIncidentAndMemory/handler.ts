import type { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.ROAD_ASSIST_TABLE_NAME!;
const AGENTCORE_MEMORY_ID = process.env.AGENTCORE_MEMORY_ID || 'mem-roadassist-enterprise';

interface IncidentMemoryContext {
  incidentId: string;
  customerId: string;
  customerPhone: string;
  customerName: string;   
  membershipTier: string;
  defaultPlate: string;
  incidentType: string;        
  incidentDescription: string; 
  locationGeohash: string;     // 1. ADDED: Define in the interface
  agentCoreMemoryId: string;
  agentCoreActorIdCustomer: string;
  agentCoreActorIdVehicle: string;
  agentCoreSessionId: string;
}

// ── normaliseString ────────────────────────────────────────────────────────────
function normaliseString(raw: unknown, fallback = 'UNKNOWN'): string {
  if (!raw) return fallback;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return fallback;

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return normaliseString(parsed, fallback);
      } catch {
        return trimmed; 
      }
    }
    return trimmed;
  }

  if (Array.isArray(raw) && raw.length > 0) {
    return normaliseString(raw[0], fallback);
  }

  if (typeof raw === 'object') {
    const values = Object.values(raw as Record<string, unknown>);
    if (values.length > 0) return normaliseString(values[0], fallback);
  }

  return fallback;
}

export const handler = async (event: any): Promise<IncidentMemoryContext> => {
  const args = event.arguments || event.Details?.Parameters || {};

  // Extract args — support AppSync direct path, Connect form path, and widget FAB path.
  // Widget FAB: Connect prepends 'HostedWidget-' to all snippet contactAttributes.
  // The flow passes the HostedWidget-customerPhone value via customerIdentifierFallback.
  const {
    contactId,
    customerIdentifier: rawCustomerIdentifier,
    customerIdentifierFallback,
    plateNumber,
    incidentType,
    incidentDescription,
    locationGeohash,
  } = args;

  // Resolve customerIdentifier: direct value wins; HostedWidget fallback for FAB path.
  const customerIdentifier = (rawCustomerIdentifier && String(rawCustomerIdentifier).trim())
    ? String(rawCustomerIdentifier).trim()
    : (customerIdentifierFallback && String(customerIdentifierFallback).trim())
    ? String(customerIdentifierFallback).trim()
    : '';

  if (!contactId || !customerIdentifier) {
    console.error('Validation Failed: Missing contactId or customerIdentifier', {
      contactId, rawCustomerIdentifier, customerIdentifierFallback,
    });
    throw new Error('Validation Failed: Missing required form fields');
  }

  const safePlateNumber  = normaliseString(plateNumber,  'UNKNOWN');
  const safeIncidentType = normaliseString(incidentType, 'UNKNOWN');
  
  // 3. ADDED: Safely normalize the geohash to prevent undefined errors
  const safeGeohash      = normaliseString(locationGeohash, 'thev0z');

  let safeDescription = normaliseString(incidentDescription, 'None provided');
  if (!safeDescription || safeDescription.trim() === '') {
    safeDescription = 'None provided';
  }

  console.log('[syncIncidentAndMemory] Normalised args:', {
    customerIdentifier,
    safePlateNumber,
    safeIncidentType,
    safeGeohash,
    safeDescription: safeDescription.slice(0, 80),
  });

  const nowIso = new Date().toISOString();

  const profileRes = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUST#${customerIdentifier}`, SK: 'PROFILE' },
    })
  );

  let customerPhone  = customerIdentifier;
  let customerName   = 'Guest';   
  let membershipTier = 'GUEST';
  let isCovered      = false;
  let dispatchFee    = 150.00;

  if (profileRes.Item && profileRes.Item.data) {
    let profileData: any = {};
    try {
      const raw = profileRes.Item.data;
      const once = typeof raw === 'string' ? JSON.parse(raw) : raw;
      profileData = typeof once === 'string' ? JSON.parse(once) : once;
    } catch (parseErr) {
      console.warn('[syncIncidentAndMemory] Failed to parse profile data blob:', parseErr);
    }

    customerPhone = profileData.customerPhone || customerIdentifier;
    customerName = profileData.driverName || profileData.customerName || 'Guest';

    const registeredCars: string[] = Array.isArray(profileData.cars) ? profileData.cars : [];

    if (registeredCars.includes(safePlateNumber)) {
      isCovered      = true;
      membershipTier = 'GOLD';
      dispatchFee    = 0.00;
      console.log(`[syncIncidentAndMemory] Plate ${safePlateNumber} COVERED under policy for ${customerIdentifier}. customerName="${customerName}"`);
    } else {
      isCovered      = false;
      membershipTier = 'GUEST';
      dispatchFee    = 50.00;
      console.log(`[syncIncidentAndMemory] Plate ${safePlateNumber} NOT covered for ${customerIdentifier}. customerName="${customerName}"`);
    }
  } else {
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `CUST#${customerIdentifier}`,
          SK: 'PROFILE',
          entityType: 'CUSTOMER_PROFILE',
          status: 'GUEST',
          recordCreatedAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          agentCoreActorIdCustomer: `CUST#${customerIdentifier}`,
          data: JSON.stringify({
            customerPhone: customerIdentifier,
            membershipTier: 'GUEST',
            cars: [],
            enrolledAt: nowIso,
            notes: 'Ad-hoc web form submission — standard dispatch fees apply',
          }),
        },
      })
    );
    console.log(`[syncIncidentAndMemory] Created new GUEST profile for ${customerIdentifier}.`);
  }

  const activeIncQuery = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'CustomerActiveIncidentIndex',
      KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk':       `CUST#${customerIdentifier}`,
        ':skPrefix': 'STATUS#OPEN#',
      },
      Limit: 1,
    })
  );

  let incidentId: string;
  const existingItem = activeIncQuery.Items?.[0];

  if (existingItem) {
    incidentId = (existingItem.PK as string).replace('INC#', '');
    console.log(`[syncIncidentAndMemory] Recovered existing incident ${incidentId} for ${customerIdentifier}.`);
  } else {
    incidentId = ulid();

    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `INC#${incidentId}`,
          SK: 'METADATA',
          entityType: 'INCIDENT_METADATA',
          status:              'INTAKE',
          recordCreatedAt:     nowIso,
          createdAt:           nowIso,
          updatedAt:           nowIso,
          incidentType:        safeIncidentType,      
          incidentDescription: safeDescription,       
          customerPhone,
          incidentPlate:       safePlateNumber,
          coveredByPolicy:     isCovered,
          dispatchFeeAmount:   dispatchFee,
          paymentStatus:       isCovered
            ? 'COVERED_BY_INSURANCE'
            : 'PENDING_CUSTOMER_PAYMENT',
          GSI1PK: `CUST#${customerIdentifier}`,
          GSI1SK: `STATUS#OPEN#${nowIso}`,
          GSI4PK: 'OPS_STATUS#INTAKE',
          GSI4SK: `SEV#NORMAL#${nowIso}`,
          GSI5PK: `VEH#${safePlateNumber}`,
          GSI5SK: `STATUS#OPEN#${nowIso}`,
          agentCoreMemoryId:        AGENTCORE_MEMORY_ID,
          agentCoreActorIdCustomer: `CUST#${customerIdentifier}`,
          agentCoreActorIdVehicle:  `VEH#${safePlateNumber}`,
          agentCoreSessionId:       incidentId,
          data: JSON.stringify({
            incidentId,
            customerId:          customerIdentifier,
            customerPhone,
            incidentPlate:       safePlateNumber,
            initialContactId:    contactId,
            incidentStatus:      'INTAKE',
            coveredByPolicy:     isCovered,
            dispatchFeeAmount:   dispatchFee,
            paymentStatus:       isCovered
              ? 'COVERED_BY_INSURANCE'
              : 'PENDING_CUSTOMER_PAYMENT',
            billingNotes: isCovered
              ? 'Vehicle is registered under active customer policy.'
              : 'Unregistered vehicle. Customer is liable for standard dispatch fee.',
            createdAt: nowIso,
          }),
        },
      })
    );
    console.log(`[syncIncidentAndMemory] Created incident ${incidentId} type="${safeIncidentType}" plate="${safePlateNumber}".`);
  }

  return {
    incidentId,
    customerId:              customerIdentifier,
    customerPhone,
    customerName,            
    membershipTier,          
    defaultPlate:            safePlateNumber,
    incidentType:            safeIncidentType,
    incidentDescription:     safeDescription,
    locationGeohash:         safeGeohash,       // 4. ADDED: Return it in the final payload
    agentCoreMemoryId:       AGENTCORE_MEMORY_ID,
    agentCoreActorIdCustomer: `CUST#${customerIdentifier}`,
    agentCoreActorIdVehicle:  `VEH#${safePlateNumber}`,
    agentCoreSessionId:      incidentId,
  };
};