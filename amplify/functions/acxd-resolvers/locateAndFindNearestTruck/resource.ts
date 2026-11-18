import { defineFunction } from '@aws-amplify/backend';

export const locateAndFindNearestTruckFn = defineFunction({
  name: 'locateAndFindNearestTruck',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
  environment: {
    // Overridden by backend.ts with env-scoped name (e.g. RoadAssistRouteCalculator-sandbox)
    ROUTE_CALCULATOR_NAME: `RoadAssistRouteCalculator-${process.env.AWS_BRANCH ?? 'sandbox'}`
  }
});