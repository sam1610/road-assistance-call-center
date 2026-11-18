import { defineFunction } from '@aws-amplify/backend';

export const wrapUpIncidentAnalyticsFn = defineFunction({
  name: 'wrapUpIncidentAnalytics',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
});