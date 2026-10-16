import { defineAuth } from '@aws-amplify/backend';

/**
 * Cognito User Pool configuration for the Road Assistance Agentic Call Center.
 *
 * Login identifiers:
 *   - Email   — standard Cognito email login
 *   - Phone   — E.164 format enforced by Cognito (e.g. +15555550100)
 *
 * Custom user attributes (Requirements 2.1, 2.2):
 *   - custom:membershipTier — mutable string, max 64 characters
 *     Stores the customer's membership tier (e.g. "GOLD", "SILVER", "BASIC").
 *   - custom:defaultPlate   — mutable string, max 20 characters
 *     Stores the customer's default vehicle licence plate number.
 *
 * Requirements: 2.1, 2.2
 */
export const auth = defineAuth({
  loginWith: {
    email: true,
    phone: true, // E.164 format enforced by Cognito
  },
  userAttributes: {
    'custom:membershipTier': {
      dataType: 'String',
      mutable: true,
      maxLen: 64,
    },
    'custom:defaultPlate': {
      dataType: 'String',
      mutable: true,
      maxLen: 20,
    },
  },
});
