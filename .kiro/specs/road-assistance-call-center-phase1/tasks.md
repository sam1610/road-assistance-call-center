# Implementation Plan: Road Assistance Agentic Call Center — Phase 1

## Overview

Phase 1 establishes the complete production-grade scaffolding for the Road Assistance Agentic Call Center. The implementation covers frontend dependency initialization, Amplify Gen 2 backend configuration (Cognito auth, single-table DynamoDB schema, five GSIs, AppSync custom types/queries/mutations/subscriptions, stub Lambda resolvers), CDK L2 overrides for DynamoDB Streams and TTL, and a property-based testing suite validating all 12 correctness properties. Implementation language is **TypeScript** throughout (Node 20.x for Lambda). No business logic is required — all Lambda handlers are typed stubs that return conforming placeholder responses so that `npx ampx sandbox` compiles cleanly.

## Tasks

- [x] 1. Initialize project workspace and install frontend dependencies

  - [x] 1.1 Create `package.json` with React ≥19.0.0, Vite ≥5.0.0, TypeScript ≥5.0.0 as the build toolchain
    - Create `package.json` declaring `react`, `react-dom`, `vite`, and `typescript` at the required minimum versions
    - Add `vite.config.ts`, `tsconfig.json`, and `tsconfig.node.json` with paths matching the directory structure in the design
    - Add `index.html` as the Vite entry point and `src/main.tsx` as the React root
    - _Requirements: 1.1_
  - [x] 1.2 Install frontend runtime and UI dependencies
    - Add `aws-amplify`, `@aws-amplify/ui-react`, `@aws-amplify/geo` to `dependencies`
    - Add `maplibre-gl`, `@maplibre/maplibre-gl-draw` to `dependencies`
    - Add `lucide-react`, `tailwindcss` to `dependencies`
    - Add `amazon-chime-sdk-js` to `dependencies`
    - Add `@amazon-connect/touchpoint-sdk` (or a local wrapper module exporting an equivalent interface under a single named import) to `dependencies`
    - _Requirements: 1.2_

- [x] 2. Configure Tailwind CSS and root CSS entry point
  - [x] 2.1 Create `tailwind.config.ts` with content glob covering `src/**/*.{ts,tsx}`
    - Write `tailwind.config.ts` exporting a Tailwind `Config` object with `content` array pointing to all TypeScript source files
    - _Requirements: 1.4_
  - [x] 2.2 Inject Tailwind directives into the root CSS entry point
    - Create `src/index.css` containing `@tailwind base;`, `@tailwind components;`, and `@tailwind utilities;` as the first three directives
    - Import `src/index.css` in `src/main.tsx`
    - _Requirements: 1.4_

- [x] 3. Install backend and Lambda resolver dependencies
  - [x] 3.1 Add AWS SDK v3 packages and utility libraries as backend dependencies
    - Add `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb` to `dependencies`
    - Add `@aws-sdk/client-location`, `@aws-sdk/client-bedrock-agent-runtime`, `@aws-sdk/client-connect`, `@aws-sdk/client-sns` to `dependencies`
    - Add `ulid`, `ngeohash` to `dependencies`
    - Add `@types/ngeohash` to `devDependencies`
    - _Requirements: 1.3_

- [x] 4. Implement Amplify Auth resource (Cognito User Pool)
  - [x] 4.1 Create `amplify/auth/resource.ts` with email and phone login, and custom user attributes
    - Call `defineAuth` with `loginWith: { email: true, phone: true }` (phone enforces E.164 via Cognito)
    - Declare `custom:membershipTier` as a mutable string attribute with `maxLen: 64`
    - Declare `custom:defaultPlate` as a mutable string attribute with `maxLen: 20`
    - Export the `auth` constant
    - _Requirements: 2.1, 2.2_

- [x] 5. Define the RoadAssistRecord Amplify data model with composite keys and all attributes
  - [x] 5.1 Create `amplify/data/resource.ts` skeleton with `RoadAssistRecord` model and composite primary keys
    - Declare the Amplify `schema` importing `a` from `@aws-amplify/backend`
    - Add `RoadAssistRecord` model with `PK: a.string().required()` and `SK: a.string().required()` configured via `.identifier(['PK', 'SK'])`
    - Add `entityType: a.string().required()`, `data: a.json()`, and `expiresAt: a.integer()` base attributes
    - _Requirements: 3.1_
  - [x] 5.2 Add all GSI key attributes and domain-specific attributes to RoadAssistRecord
    - Add optional string attributes: GSI1PK, GSI1SK, GSI2PK, GSI2SK, GSI3PK, GSI3SK, GSI4PK, GSI4SK, GSI5PK, GSI5SK
    - Add `agentCoreMemoryId`, `agentCoreActorIdCustomer`, `agentCoreActorIdVehicle`, `agentCoreSessionId` as optional strings
    - Add `guardrailIntervened: a.boolean()`, `guardrailActionReason: a.string()`, `guardrailIdAndVersion: a.string()` as optional
    - Add `llmChatSummary: a.string()`, `contactLensGenAiSummary: a.string()`, `sentimentLabel: a.string()` as optional strings
    - Add `sentimentScore: a.float()`, `customerEffortScore: a.float()` as optional floats
    - Add `transcriptS3Uri: a.string()`, `recordingS3Uri: a.string()` as optional strings
    - Verify `tsc --noEmit --project amplify/tsconfig.json` passes with zero errors
    - _Requirements: 3.9, 3.10, 4.1–4.5, 5.1, 5.2, 5.3_

- [x] 6. Provision all five Global Secondary Indexes and define AppSync Custom Types
  - [x] 6.1 Add all five GSIs to the RoadAssistRecord model
    - Call `.secondaryIndexes(indexes => [...])` on the `RoadAssistRecord` model
    - GSI1 (`CustomerActiveIncidentIndex`): `partitionKey: 'GSI1PK'`, `sortKey: 'GSI1SK'`
    - GSI2 (`FleetAvailabilityIndex`): `partitionKey: 'GSI2PK'`, `sortKey: 'GSI2SK'`
    - GSI3 (`TruckActiveIncidentIndex`): `partitionKey: 'GSI3PK'`, `sortKey: 'GSI3SK'` (sparse)
    - GSI4 (`OperationsControlIndex`): `partitionKey: 'GSI4PK'`, `sortKey: 'GSI4SK'`
    - GSI5 (`VehicleIncidentHistoryIndex`): `partitionKey: 'GSI5PK'`, `sortKey: 'GSI5SK'` (sparse)
    - _Requirements: 4.1–4.5_
  - [x] 6.2 Declare all six AppSync Custom Types in the schema
    - `IncidentMemoryContext`: `incidentId`, `customerId`, `customerPhone`, `membershipTier`, `defaultPlate`, `agentCoreMemoryId`, `agentCoreActorIdCustomer`, `agentCoreActorIdVehicle`, `agentCoreSessionId` (all strings)
    - `NearestTruckResult`: `truckId` (string), `estimatedArrivalMinutes` (integer), `truckType` (string)
    - `DispatchConfirmation`: `truckId`, `incidentId`, `geofenceStatus`, `dispatchTimestamp` (all strings)
    - `AnalyticsWrapUpResult`: `incidentId` (string), `success` (boolean), `updatedFields` (string array)
    - `IncidentLiveUpdate`: `incidentId`, `incidentStatus`, `truckLocationGeohash` (strings), `etaMinutes` (integer)
    - `WrapUpInput`: `llmChatSummary`, `contactLensGenAiSummary`, `sentimentLabel`, `transcriptS3Uri`, `recordingS3Uri`, `guardrailActionReason`, `guardrailIdAndVersion` (strings), `sentimentScore`, `customerEffortScore` (floats), `guardrailIntervened` (boolean)
    - _Requirements: 6.1_

- [x] 7. Create all five stub Lambda resolver functions
  - [x] 7.1 Create `syncIncidentAndMemory` stub — `resource.ts` and `handler.ts`
    - Write `amplify/functions/acxd-resolvers/syncIncidentAndMemory/resource.ts` calling `defineFunction({ name: 'syncIncidentAndMemory', entry: './handler.ts', runtime: 20 })`
    - Write `handler.ts` exporting a `handler` function returning a stub `IncidentMemoryContext` with all fields as empty strings or null
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 7.2 Create `locateAndFindNearestTruck` stub — `resource.ts` and `handler.ts`
    - `defineFunction` named `locateAndFindNearestTruck`, runtime 20
    - `handler.ts` returning stub `NearestTruckResult` with `truckId: null`, `estimatedArrivalMinutes: 0`, `truckType: null`
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 7.3 Create `confirmDispatchAndGeofence` stub — `resource.ts` and `handler.ts`
    - `defineFunction` named `confirmDispatchAndGeofence`, runtime 20
    - `handler.ts` returning stub `DispatchConfirmation` with `geofenceStatus: 'CREATED'` and other fields as empty strings
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 7.4 Create `wrapUpIncidentAnalytics` stub — `resource.ts` and `handler.ts`
    - `defineFunction` named `wrapUpIncidentAnalytics`, runtime 20
    - `handler.ts` returning stub `AnalyticsWrapUpResult` with `incidentId: null`, `success: false`, `updatedFields: []`
    - _Requirements: 7.1, 7.2, 7.4_
  - [x] 7.5 Create `updateTruckTelemetry` stub — `resource.ts` and `handler.ts`
    - `defineFunction` named `updateTruckTelemetry`, runtime 20
    - `handler.ts` returning `false` (Boolean)
    - _Requirements: 7.1, 7.2, 7.4_

- [x] 8. Declare AppSync Queries, Mutations, and Subscription in the schema
  - [x] 8.1 Declare `syncIncidentAndMemory` and `locateAndFindNearestTruck` queries
    - Import the five `defineFunction` resources at the top of `amplify/data/resource.ts`
    - Add `syncIncidentAndMemory` query: `contactId` and `customerIdentifier` (required strings), returns `IncidentMemoryContext`, `a.handler.function(syncIncidentAndMemoryFn)`, IAM auth
    - Add `locateAndFindNearestTruck` query: `incidentId` and `locationGeohash` (required strings), returns `NearestTruckResult`
    - _Requirements: 6.2, 6.4, 2.3_
  - [x] 8.2 Declare `confirmDispatchAndGeofence`, `wrapUpIncidentAnalytics`, and `updateTruckTelemetry` mutations
    - `confirmDispatchAndGeofence`: `incidentId` and `truckId` (required strings), returns `DispatchConfirmation`
    - `wrapUpIncidentAnalytics`: `incidentId` (required string) and `wrapUpInput` (ref to `WrapUpInput`, required), returns `AnalyticsWrapUpResult`
    - `updateTruckTelemetry`: `truckId`, `locationGeohash`, `operationalStatus` (required strings), returns boolean
    - Apply `.authorization(allow => [allow.authenticated('iam')])` on the schema
    - _Requirements: 6.5, 6.6, 6.7, 6.8, 2.3, 2.4_
  - [x] 8.3 Declare `onIncidentLiveUpdate` subscription filtered by `incidentId`
    - Add `onIncidentLiveUpdate` subscription: `incidentId` (required string), returns `IncidentLiveUpdate`
    - Configure to fire on `confirmDispatchAndGeofence` and `updateTruckTelemetry` mutations
    - Verify `tsc --noEmit --project amplify/tsconfig.json` passes
    - _Requirements: 6.9_

- [x] 9. Assemble `amplify/backend.ts` with CDK L2 overrides
  - [x] 9.1 Wire auth, data, and all five stub functions into `amplify/backend.ts`
    - Create `amplify/backend.ts` importing `auth`, `data`, and all five `defineFunction` instances
    - Call `defineBackend({ auth, data, syncIncidentAndMemoryFn, locateAndFindNearestTruckFn, confirmDispatchAndGeofenceFn, wrapUpIncidentAnalyticsFn, updateTruckTelemetryFn })`
    - _Requirements: 7.5_
  - [x] 9.2 Apply CDK L2 overrides for Streams, TTL, and CloudFormation output
    - Obtain `CfnTable` via `backend.data.resources.tables['RoadAssistRecord']`; throw `'RoadAssistRecord: CfnTable not found'` if falsy
    - Set `cfnTable.streamSpecification = { streamViewType: 'NEW_AND_OLD_IMAGES' }`
    - Set `cfnTable.timeToLiveSpecification = { attributeName: 'expiresAt', enabled: true }`
    - Add synthesis-time guard asserting both properties are set
    - Instantiate `CfnOutput` with `exportName: 'RoadAssistRecordStreamArn'` and `value: cfnTable.attrStreamArn`
    - Verify `tsc --noEmit --project amplify/tsconfig.json` passes
    - _Requirements: 8.1–8.5_

- [x] 10. Scaffold frontend React components
  - [x] 10.1 Create `src/App.tsx` with Amplify configuration wrapper and Authenticator
    - Import `Amplify` from `aws-amplify` and configure it with `amplify_outputs.json`
    - Wrap the app in Authenticator via `AuthWrapper.tsx`
    - Update `src/main.tsx` to render `<App />` instead of the placeholder div
    - _Requirements: Design — Frontend Components_
  - [x] 10.2 Create stub frontend components
    - Create `src/components/AuthWrapper.tsx` wrapping `Authenticator` with email/phone login toggle
    - Create `src/components/DispatcherDashboard.tsx` (stub subscribing to `onIncidentLiveUpdate`)
    - Create `src/components/IncidentPanel.tsx` (static stub sidebar)
    - Create `src/components/TruckMap.tsx` (stub MapLibre GL map container)
    - _Requirements: Design — Frontend Components_

- [x] 11. Set up property-based testing and implement all 12 correctness property tests
  - [x] 11.1 Install Vitest and fast-check; configure test runner
    - Add `vitest`, `@vitest/coverage-v8`, and `fast-check` to `devDependencies`
    - Ensure `test` script in `package.json` runs `vitest --run`
    - Create `vitest.config.ts` covering `src/__tests__` and `amplify/__tests__` directories
    - _Requirements: Design — Testing Strategy_
  - [x] 11.2 Write property tests for key-pattern round-trips (Properties 1, 2, 3, 12)
    - Create `src/__tests__/properties/keyPatterns.property.test.ts`
    - Property 1: CUSTOMER_PROFILE key round-trip — `PK` starts with `'CUST#'`, `SK === 'PROFILE'`, `entityType === 'CUSTOMER_PROFILE'`
    - Property 2: INCIDENT_METADATA key round-trip — 26-char ULID, `PK` starts with `'INC#'`, `SK === 'METADATA'`
    - Property 3: CALL_INTERACTION_LOG SK sort-order — lexicographic SK order equals chronological timestamp order
    - Property 12: TRUCK_DISPATCH_LOG SK sort-order — same for dispatch timestamps
    - `numRuns: 100`
    - _Requirements: 3.2, 3.4, 3.5, 3.7_
  - [x] 11.3 Write property test for TTL population invariant (Property 4)
    - Create `src/__tests__/properties/ttlInvariant.property.test.ts`
    - CALL_INTERACTION_LOG and TRUCK_DISPATCH_LOG: `expiresAt` is a positive integer
    - CUSTOMER_PROFILE, CUSTOMER_VEHICLE, INCIDENT_METADATA, TOW_TRUCK_STATUS: `expiresAt` is absent
    - `numRuns: 100`
    - _Requirements: 3.8_
  - [x] 11.4 Write property tests for GSI key population invariants (Properties 5, 6)
    - Create `src/__tests__/properties/gsiKeys.property.test.ts`
    - Property 5: `INCIDENT_METADATA` GSI1 keys match `CUST#` and `STATUS#` patterns
    - Property 6: `TOW_TRUCK_STATUS` GSI2 keys match `FLEET#` and `TYPE#` patterns
    - `numRuns: 100`
    - _Requirements: 3.9, 3.10_
  - [x] 11.5 Write property tests for AgentCore, Guardrail, score bounds, S3 URI, and geohash (Properties 7–11)
    - `src/__tests__/properties/agentCoreSession.property.test.ts` — Property 7: `agentCoreSessionId === PK.replace('INC#', '')`
    - `src/__tests__/properties/guardrailFormat.property.test.ts` — Property 8: `guardrailIdAndVersion` matches `<id>:<positiveInt>`
    - `src/__tests__/properties/scoreBounds.property.test.ts` — Property 9: `sentimentScore` ∈ [0.0,1.0], `customerEffortScore` ∈ [0.0,10.0]
    - `src/__tests__/properties/s3UriFormat.property.test.ts` — Property 10: `transcriptS3Uri` and `recordingS3Uri` start with `s3://`
    - `src/__tests__/properties/truckTelemetry.property.test.ts` — Property 11: `locationGeohash` exactly 6 chars; `operationalStatus` ∈ {AVAILABLE, DISPATCHED, OFFLINE}
    - All `numRuns: 100`
    - _Requirements: 5.1, 5.2, 5.3, 6.8_

- [x] 12. Final checkpoint — compile all sources and run the full test suite
  - Run `tsc --noEmit` across root `tsconfig.json` and `amplify/tsconfig.json` — confirm zero errors
  - Run `vitest --run` — confirm all required property-based tests pass
  - Verify `amplify/backend.ts` CDK synthesis guard throws the correct error message when `CfnTable` is absent
  - _Requirements: 1.5, 7.3, 8.4, 8.5_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP pass
- All Lambda handlers are **typed stubs only** in Phase 1 — no business logic
- `@amazon-connect/touchpoint-sdk` is the local wrapper at `src/lib/touchpoint-sdk/`
- `@aws-amplify/backend` is already installed as a devDependency at `^1.25.1`
- `npx ampx sandbox` is the authoritative smoke-test
- Each property-based test must run with `numRuns: 100` and use fast-check shrinking
- The `CfnOutput` for `RoadAssistRecordStreamArn` must use `cfnTable.attrStreamArn` (the CloudFormation intrinsic), not a hardcoded string

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["5.2"] },
    { "id": 1, "tasks": ["6.1", "6.2"] },
    { "id": 2, "tasks": ["7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 3, "tasks": ["8.1", "8.2"] },
    { "id": 4, "tasks": ["8.3"] },
    { "id": 5, "tasks": ["9.1"] },
    { "id": 6, "tasks": ["9.2", "10.1", "11.1"] },
    { "id": 7, "tasks": ["10.2", "11.2"] },
    { "id": 8, "tasks": ["11.3", "11.4", "11.5"] },
    { "id": 9, "tasks": ["12"] }
  ]
}
```
