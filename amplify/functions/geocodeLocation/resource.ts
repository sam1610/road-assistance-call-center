import { defineFunction } from '@aws-amplify/backend';

export const geocodeLocationFn = defineFunction({
  name: 'geocodeLocation',
  entry: './handler.ts',
  resourceGroupName: 'data',
  timeoutSeconds: 30,
});
