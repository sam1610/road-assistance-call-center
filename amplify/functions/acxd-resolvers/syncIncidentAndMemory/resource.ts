import { defineFunction } from '@aws-amplify/backend';

/**
 * Amplify Gen 2 function resource for the `syncIncidentAndMemory` AppSync query resolver.
 *
 * At call-start, ACXD invokes this resolver to retrieve the customer's profile,
 * any existing INCIDENT_METADATA record, and the AgentCore memory session context.
 * In Phase 1 this is a typed stub — no business logic is implemented.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const syncIncidentAndMemoryFn = defineFunction({
  name: 'syncIncidentAndMemory',
  entry: './handler.ts',
  runtime: 20,
});
