import { defineFunction } from '@aws-amplify/backend';

/**
 * Stub Lambda resolver for the `wrapUpIncidentAnalytics` AppSync mutation.
 * Phase 1: typed stub only — no business logic.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const wrapUpIncidentAnalyticsFn = defineFunction({
  name: 'wrapUpIncidentAnalytics',
  entry: './handler.ts',
  runtime: 20,
});
