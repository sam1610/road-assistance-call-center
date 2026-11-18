import { defineFunction } from '@aws-amplify/backend';

export const startConnectSessionFn = defineFunction({
  name: 'startConnectSession',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 22,
  timeoutSeconds: 15,
  environment: {
    CONNECT_INSTANCE_ID:     '7fc2e91f-1df5-4ecc-b4c6-b2635f9a7dd6',
    CONNECT_REGION:          'us-east-1',
    // RoadAssistance-1 contact flow
    CONNECT_CONTACT_FLOW_ID: '2c776546-4a3f-4c5e-8d9a-7a16e1a6dadf',
    // GeneralSupport queue (used as outbound queue for voice, and fallback for chat)
    CONNECT_QUEUE_ID:        '9c5598f8-085d-4fcf-bd9e-8cac8da7f345',
    // Source phone for outbound voice — leave empty until a number is claimed
    // in Connect console → Channels → Phone numbers → Claim a number
    CONNECT_SOURCE_PHONE:    '',
  },
});
