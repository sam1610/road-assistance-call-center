import { defineFunction } from '@aws-amplify/backend';

export const geocodeLocation = defineFunction({
  name: 'geocodeLocation',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
