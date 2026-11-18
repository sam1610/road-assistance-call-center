import { defineFunction } from '@aws-amplify/backend';

export const syncIncidentAndMemoryFn = defineFunction({
  name: 'syncIncidentAndMemory',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
});
