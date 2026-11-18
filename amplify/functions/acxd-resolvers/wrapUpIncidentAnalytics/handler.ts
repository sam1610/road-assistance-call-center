import type { AppSyncResolverHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.ROAD_ASSIST_TABLE_NAME!;

// 1. Define the nested input shape from AppSync
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

// 2. Define the broad arguments to accept BOTH AppSync and Amazon Connect payloads
interface WrapUpArgs {
  incidentId: string;
  wrapUpInput?: WrapUpInput;
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

interface AnalyticsWrapUpResult {
  incidentId: string;
  success: boolean;
  updatedFields: string[];
}

export const handler: AppSyncResolverHandler<
  WrapUpArgs,
  AnalyticsWrapUpResult
> = async (event) => {
  // Universal Adapter — AppSync, Connect flow, and Function URL (Agentic CX External)
  let rawArgs: any = {};
  if ((event as any).arguments)             rawArgs = (event as any).arguments;
  else if ((event as any).Details?.Parameters) rawArgs = (event as any).Details.Parameters;
  else if ((event as any).body) {
    const b = (event as any).body;
    rawArgs = typeof b === 'string' ? JSON.parse(b) : b;
  } else { rawArgs = event; }
  const args = rawArgs;
  const incidentId = args.incidentId;

  if (!incidentId) {
    throw new Error('Validation Failed: Missing incidentId');
  }

  // Extract from AppSync wrapUpInput object OR fallback to flat keys from AI Tool call
  const wrapUpInput: WrapUpInput = args.wrapUpInput || {
    llmChatSummary: args.llmChatSummary,
    contactLensGenAiSummary: args.contactLensGenAiSummary,
    sentimentLabel: args.sentimentLabel,
    sentimentScore: args.sentimentScore,
    customerEffortScore: args.customerEffortScore,
    transcriptS3Uri: args.transcriptS3Uri,
    recordingS3Uri: args.recordingS3Uri,
    guardrailIntervened: args.guardrailIntervened,
    guardrailActionReason: args.guardrailActionReason,
    guardrailIdAndVersion: args.guardrailIdAndVersion,
  };

  const nowIso = new Date().toISOString();
  const ttlNinetyDays = Math.floor(Date.now() / 1000) + 90 * 86400;

  const updatedFields = Object.entries(wrapUpInput)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k]) => k);

  // Write CALL_INTERACTION_LOG item under the Incident Partition Key
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: `INC#${incidentId}`,
        SK: `COMM#${nowIso}`,
        entityType: 'CALL_INTERACTION_LOG',
        expiresAt: ttlNinetyDays,
        llmChatSummary: wrapUpInput.llmChatSummary ?? undefined,
        contactLensGenAiSummary: wrapUpInput.contactLensGenAiSummary ?? undefined,
        sentimentLabel: wrapUpInput.sentimentLabel ?? undefined,
        sentimentScore: wrapUpInput.sentimentScore ?? undefined,
        customerEffortScore: wrapUpInput.customerEffortScore ?? undefined,
        transcriptS3Uri: wrapUpInput.transcriptS3Uri ?? undefined,
        recordingS3Uri: wrapUpInput.recordingS3Uri ?? undefined,
        guardrailIntervened: wrapUpInput.guardrailIntervened ?? false,
        guardrailActionReason: wrapUpInput.guardrailActionReason ?? undefined,
        guardrailIdAndVersion: wrapUpInput.guardrailIdAndVersion ?? undefined,
      },
    })
  );

  // Roll up the latest summary & sentiment onto the master INC#<incidentId> / METADATA record
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `INC#${incidentId}`, SK: 'METADATA' },
      UpdateExpression:
        'SET llmChatSummary = :sum, sentimentLabel = :sent, sentimentScore = :score, guardrailIntervened = :gr, #status = :statusVal',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':sum': wrapUpInput.contactLensGenAiSummary || wrapUpInput.llmChatSummary || 'Completed',
        ':sent': wrapUpInput.sentimentLabel || 'NEUTRAL',
        ':score': wrapUpInput.sentimentScore ?? 0.5,
        ':gr': wrapUpInput.guardrailIntervened ?? false,
        ':statusVal': 'RESOLVED',
      },
    })
  );

  return {
    incidentId,
    success: true,
    updatedFields,
  };
};