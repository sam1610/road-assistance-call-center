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
  locationGeohash: string;
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

// ── normalizePhone ─────────────────────────────────────────────────────────────
function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  // Remove all non-digit characters
  return phone.replace(/\D/g, '');
}

export const handler = async (event: any): Promise<IncidentMemoryContext> => {
  const args = event.arguments || event.Details?.Parameters || {};

  // Extract args — support AppSync direct path, Connect form path, and widget FAB path
  const {
    contactId,
    customerIdentifier: rawCustomerIdentifier,
    customerIdentifierFallback,
    customerPhone: rawCustomerPhone,
    voicePhoneNumber, 
    languagePreference,
    plateNumber,
    incidentType,
    incidentDescription,
    locationGeohash,
  } = args;

  // Resolve customerIdentifier
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
  const safeGeohash      = normaliseString(locationGeohash, 'thev0z');
  const safeLanguage     = normaliseString(languagePreference, 'en');

  let safeDescription = normaliseString(incidentDescription, 'None provided');
  if (!safeDescription || safeDescription.trim() === '') {
    safeDescription = 'None provided';
  }

  // Normalize phone number from contact attributes or fallback to customerIdentifier
  const normalizedPhone = normalizePhone(voicePhoneNumber || rawCustomerPhone);
  const resolvedPhone = normalizedPhone || customerIdentifier;

  console.log('[syncIncidentAndMemory] Normalised args:', {
    customerIdentifier,
    resolvedPhone,
    safePlateNumber,
    safeIncidentType,
    safeGeohash,
    safeLanguage,
    safeDescription: safeDescription.slice(0, 80),
  });

  const nowIso = new Date().toISOString();

  // Try to fetch existing customer profile
  const profileRes = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUST#${customerIdentifier}`, SK: 'PROFILE' },
    })
  );

  let finalCustomerPhone = resolvedPhone;
  let customerName       = 'Guest';   
  let membershipTier     = 'GUEST';
  let isCovered          = false;
  let dispatchFee        = 150.00;

  if (profileRes.Item && profileRes.Item.data) {
    // Parse existing profile
    let profileData: any = {};
    try {
      const raw = profileRes.Item.data;
      const once = typeof raw === 'string' ? JSON.parse(raw) : raw;
      profileData = typeof once === 'string' ? JSON.parse(once) : once;
    } catch (parseErr) {
      console.warn('[syncIncidentAndMemory] Failed to parse profile data blob:', parseErr);
    }

    finalCustomerPhone = profileData.customerPhone || resolvedPhone;
    customerName = profileData.driverName || profileData.customerName || 'Guest';

    const registeredCars: string[] = Array.isArray(profileData.cars) ? profileData.cars : [];

    if (registeredCars.includes(safePlateNumber)) {
      isCovered      = true;
      membershipTier = 'GOLD';
      dispatchFee    = 0.00;
      console.log(`[syncIncidentAndMemory] Plate ${safePlateNumber} COVERED. customerName="${customerName}"`);
    } else {
      isCovered      = false;
      membershipTier = 'GUEST';
      dispatchFee    = 50.00;
      console.log(`[syncIncidentAndMemory] Plate ${safePlateNumber} NOT covered. customerName="${customerName}"`);
    }
  } else {
    // No profile found - check if customer exists by phone number (subscription verification)
    if (normalizedPhone) {
      try {
        const phoneQuery = await ddb.send(
          new QueryCommand({
            TableName: TABLE_NAME,
            IndexName: 'GSI3',
            KeyConditionExpression: 'GSI3PK = :phone',
            ExpressionAttributeValues: {
              ':phone': `PHONE#${normalizedPhone}`,
            },
            Limit: 1,
          })
        );
        
        if (phoneQuery.Items && phoneQuery.Items.length > 0) {
          const existingProfile = phoneQuery.Items[0];
          console.log(`[syncIncidentAndMemory] Found existing customer by phone: ${normalizedPhone}`);
          
          if (existingProfile.data) {
            try {
              const phoneProfileData = typeof existingProfile.data === 'string' 
                ? JSON.parse(existingProfile.data) 
                : existingProfile.data;
              
              customerName = phoneProfileData.customerName || phoneProfileData.driverName || 'Guest';
              membershipTier = phoneProfileData.membershipTier || 'BASIC';
              
              // Check subscription status
              if (phoneProfileData.subscriptionStatus === 'ACTIVE') {
                isCovered = true;
                dispatchFee = 0.00;
                console.log(`[syncIncidentAndMemory] Active subscription found for ${normalizedPhone}`);
              }
            } catch (err) {
              console.warn('[syncIncidentAndMemory] Failed to parse phone lookup profile:', err);
            }
          }
        }
      } catch (err) {
        console.error('[syncIncidentAndMemory] Phone lookup failed:', err);
      }
    }

    // Create new GUEST profile
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
            customerPhone: finalCustomerPhone,
            membershipTier: 'GUEST',
            cars: [],
            enrolledAt: nowIso,
            notes: 'Ad-hoc call submission — standard dispatch fees apply',
          }),
        },
      })
    );
    console.log(`[syncIncidentAndMemory] Created new GUEST profile for ${customerIdentifier}.`);
  }

  // Check for existing active incident
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
    console.log(`[syncIncidentAndMemory] Recovered existing incident ${incidentId}`);
  } else {
    // Create new incident
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
          customerPhone:       finalCustomerPhone,
          languagePreference:  safeLanguage,
          incidentPlate:       safePlateNumber,
          locationGeohash:     safeGeohash,
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
            customerPhone:       finalCustomerPhone,
            languagePreference:  safeLanguage,
            incidentPlate:       safePlateNumber,
            locationGeohash:     safeGeohash,
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
    customerPhone:           finalCustomerPhone,
    customerName,            
    membershipTier,          
    defaultPlate:            safePlateNumber,
    incidentType:            safeIncidentType,
    incidentDescription:     safeDescription,
    locationGeohash:         safeGeohash,
    agentCoreMemoryId:       AGENTCORE_MEMORY_ID,
    agentCoreActorIdCustomer: `CUST#${customerIdentifier}`,
    agentCoreActorIdVehicle:  `VEH#${safePlateNumber}`,
    agentCoreSessionId:      incidentId,
  };
};
