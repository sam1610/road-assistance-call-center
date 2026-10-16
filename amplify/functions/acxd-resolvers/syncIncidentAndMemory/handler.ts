import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Arguments accepted by the `syncIncidentAndMemory` AppSync query.
 * Requirements: 6.2
 */
interface SyncIncidentAndMemoryArgs {
  contactId: string;
  customerIdentifier: string;
}

/**
 * Shape of the `IncidentMemoryContext` custom type returned by this resolver.
 * All fields are optional strings in the AppSync schema (`a.string()` without
 * `.required()`), so the stub returns empty strings for every field.
 *
 * Requirements: 6.1, 7.1, 7.4
 */
interface IncidentMemoryContext {
  incidentId: string | null;
  customerId: string | null;
  customerPhone: string | null;
  membershipTier: string | null;
  defaultPlate: string | null;
  agentCoreMemoryId: string | null;
  agentCoreActorIdCustomer: string | null;
  agentCoreActorIdVehicle: string | null;
  agentCoreSessionId: string | null;
}

/**
 * Stub Lambda resolver for the `syncIncidentAndMemory` AppSync query.
 *
 * Phase 1: returns a conforming `IncidentMemoryContext` with all fields set to
 * empty strings.  No DynamoDB reads or AgentCore calls are performed yet.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const handler: AppSyncResolverHandler<
  SyncIncidentAndMemoryArgs,
  IncidentMemoryContext
> = async (_event) => {
  return {
    incidentId: '',
    customerId: '',
    customerPhone: '',
    membershipTier: '',
    defaultPlate: '',
    agentCoreMemoryId: '',
    agentCoreActorIdCustomer: '',
    agentCoreActorIdVehicle: '',
    agentCoreSessionId: '',
  };
};
