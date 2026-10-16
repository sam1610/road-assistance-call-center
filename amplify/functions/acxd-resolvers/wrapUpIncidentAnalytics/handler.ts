import type { AppSyncResolverHandler } from 'aws-lambda';

/**
 * Shape of the `WrapUpInput` argument passed by the AppSync mutation.
 * Mirrors the `WrapUpInput` custom type declared in `amplify/data/resource.ts`.
 */
interface WrapUpInput {
  llmChatSummary?: string | null;
  contactLensGenAiSummary?: string | null;
  sentimentLabel?: string | null;
  sentimentScore?: number | null;
  customerEffortScore?: number | null;
  transcriptS3Uri?: string | null;
  recordingS3Uri?: string | null;
  guardrailIntervened?: boolean | null;
  guardrailActionReason?: string | null;
  guardrailIdAndVersion?: string | null;
}

/**
 * Arguments received from the AppSync `wrapUpIncidentAnalytics` mutation.
 */
interface WrapUpIncidentAnalyticsArgs {
  incidentId: string;
  wrapUpInput: WrapUpInput;
}

/**
 * Stub response shape matching the `AnalyticsWrapUpResult` AppSync custom type.
 */
interface AnalyticsWrapUpResult {
  incidentId: string | null;
  success: boolean;
  updatedFields: string[];
}

/**
 * Stub handler for the `wrapUpIncidentAnalytics` AppSync mutation.
 *
 * Phase 1: returns a conforming placeholder response.
 * No business logic — real implementation is deferred to Phase 2.
 *
 * Requirements: 7.1, 7.2, 7.4
 */
export const handler: AppSyncResolverHandler<
  WrapUpIncidentAnalyticsArgs,
  AnalyticsWrapUpResult
> = async (_event) => {
  return {
    incidentId: null,
    success: false,
    updatedFields: [],
  };
};
