import { defineFunction } from '@aws-amplify/backend';

export const locateAndFindNearestTruckFn = defineFunction({
  name: 'locateAndFindNearestTruck',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
  environment: {
    ROUTE_CALCULATOR_NAME: 'RoadAssistRouteCalculator'
  }
});