# Requirements Document

## Introduction

Phase 1 of the enterprise "Road Assistance Agentic Call Center" establishes the foundational scaffolding for a production-grade platform. The system is built on React 19 + Vite + TypeScript for the frontend and AWS Amplify Gen 2 (`@aws-amplify/backend`) for the backend. The core data layer uses a Single-Table DynamoDB design (`RoadAssistEnterpriseTable`) exposed via AWS AppSync (GraphQL), supporting six domain entity patterns, five Global Secondary Indexes (GSIs), Bedrock AgentCore Memory correlation, and strongly-typed GraphQL operations consumed by both the React Live Sync UI and Amazon Connect Agentic CX Designer (ACXD).

## Glossary

- **System**: The Road Assistance Agentic Call Center platform comprising frontend and backend components.
- **Frontend**: The React 19 + Vite + TypeScript single-page application.
- **Backend**: The AWS Amplify Gen 2 (`@aws-amplify/backend`) infrastructure and Lambda resolvers.
- **RoadAssistEnterpriseTable**: The single DynamoDB table implementing the Single-Table Design pattern.
- **RoadAssistRecord**: The Amplify data model representing every entity stored in `RoadAssistEnterpriseTable`.
- **PK**: Partition Key attribute on `RoadAssistRecord`.
- **SK**: Sort Key attribute on `RoadAssistRecord`.
- **GSI**: Global Secondary Index on `RoadAssistEnterpriseTable`.
- **EntityType**: The `entityType` string discriminator stored on every `RoadAssistRecord` item that identifies its domain entity.
- **ACXD**: Amazon Connect Agentic CX Designer — the Amazon Connect AI tool-calling layer that issues GraphQL queries and mutations.
- **AppSync**: The AWS AppSync GraphQL API that exposes the data layer to the Frontend and ACXD.
- **AgentCore Memory**: Amazon Bedrock AgentCore Memory service used to store and retrieve conversational memory across incidents.
- **Contact Lens**: Amazon Connect Contact Lens, the post-call analytics and transcription service.
- **Geofence**: An Amazon Location Service geographic boundary used to detect tow-truck arrival events.
- **ULID**: Universally Unique Lexicographically Sortable Identifier used for incident and record IDs.
- **Geohash**: A geographic hash encoding used to index truck locations for proximity searches.
- **TTL**: DynamoDB Time-To-Live attribute (`expiresAt`) that automatically expires stale records.
- **Sandbox**: The `npx ampx sandbox` local development environment provided by Amplify Gen 2.
- **Touchpoint SDK**: The `@amazon-connect/touchpoint-sdk` (or local wrapper) used for ACXD Live Sync integration.
- **Guardrail**: An Amazon Bedrock Guardrail applied during LLM inference that may intervene in a response.

---

## Requirements

### Requirement 1: Project Workspace and Dependency Initialization

**User Story:** As a developer, I want the project workspace initialized with all required frontend and backend packages, so that the development environment is reproducible and ready for feature development.

#### Acceptance Criteria

1. WHEN the project is initialized, THE System SHALL configure a `package.json` declaring React (≥19.0.0), Vite (≥5.0.0), and TypeScript (≥5.0.0) as the frontend build toolchain.
2. WHEN the project is initialized, THE Frontend SHALL declare the following packages as dependencies: `aws-amplify`, `@aws-amplify/ui-react`, `@aws-amplify/geo`, `maplibre-gl`, `@maplibre/maplibre-gl-draw`, `lucide-react`, `tailwindcss`, `amazon-chime-sdk-js`, and either `@amazon-connect/touchpoint-sdk` or a local module that exports an equivalent Touchpoint Web SDK interface under a single named import.
3. WHEN the project is initialized, THE Backend SHALL declare the following packages as dependencies: `@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `@aws-sdk/client-location`, `@aws-sdk/client-bedrock-agent-runtime`, `@aws-sdk/client-connect`, `@aws-sdk/client-sns`, `ulid`, and `ngeohash`.
4. WHEN the project is initialized, THE System SHALL configure Tailwind CSS with a `tailwind.config.ts` and insert the `@tailwind base`, `@tailwind components`, and `@tailwind utilities` directives into the root CSS entry point.
5. WHEN the Sandbox is started with `npx ampx sandbox`, THE Backend SHALL compile without TypeScript errors across all `amplify/` source files.

---

### Requirement 2: Authentication Configuration

**User Story:** As an end user (customer or dispatcher), I want to authenticate using my email address or phone number, so that the system can associate my session with my profile and enforce role-based access.

#### Acceptance Criteria

1. THE Backend SHALL enable Cognito User Pool login with both `email` and `phoneNumber` as allowed login identifiers, where phone numbers must be provided in E.164 format.
2. WHEN a user registers, THE Backend SHALL collect and store the custom Cognito User Pool attributes `custom:membershipTier` (string, max 64 characters) and `custom:defaultPlate` (string, max 20 characters).
3. THE AppSync SHALL enforce IAM authorization on every GraphQL query and mutation, accepting only requests that present a valid Cognito-issued access token.
4. IF an unauthenticated request reaches AppSync, THEN THE AppSync SHALL reject it with an authorization error and return no query or mutation result data.
5. IF a required Cognito User Pool attribute (`custom:membershipTier` or `custom:defaultPlate`) is absent during registration, THEN THE Backend SHALL return a validation error that identifies the name of each missing attribute.

---

### Requirement 3: Single-Table DynamoDB Schema Definition

**User Story:** As a backend engineer, I want a Single-Table DynamoDB design declared in Amplify Gen 2, so that all domain entities share one table with composite keys and are accessible via a strongly-typed GraphQL API.

#### Acceptance Criteria

1. THE Backend SHALL declare a single Amplify model named `RoadAssistRecord` in `amplify/data/resource.ts` with composite primary keys: `PK` (string, required) as the Partition Key and `SK` (string, required) as the Sort Key, configured via `.identifier(['PK', 'SK'])`, and SHALL include `entityType` (string, required), `data` (JSON blob, optional), and `expiresAt` (integer, optional) as additional model attributes.
2. WHEN an item is stored as a `CUSTOMER_PROFILE` entity, THE RoadAssistRecord SHALL use `PK` in the format `CUST#<CustomerID_or_Phone>` (where CustomerID_or_Phone is a UUID or an E.164 phone number of at most 36 characters) and `SK` equal to the literal string `PROFILE`, with `entityType` set to `CUSTOMER_PROFILE`.
3. WHEN an item is stored as a `CUSTOMER_VEHICLE` entity, THE RoadAssistRecord SHALL use `PK` in the format `CUST#<CustomerID_or_Phone>` and `SK` in the format `VEH#<PlateNumber>` (where PlateNumber is 1–20 alphanumeric characters), with `entityType` set to `CUSTOMER_VEHICLE`.
4. WHEN an item is stored as an `INCIDENT_METADATA` entity, THE RoadAssistRecord SHALL use `PK` in the format `INC#<IncidentID>` (where IncidentID is a ULID of exactly 26 characters) and `SK` equal to the literal string `METADATA`, with `entityType` set to `INCIDENT_METADATA`.
5. WHEN an item is stored as a `CALL_INTERACTION_LOG` entity, THE RoadAssistRecord SHALL use `PK` in the format `INC#<IncidentID>` and `SK` in the format `COMM#<ISO8601Timestamp>#<ContactID>` (where ISO8601Timestamp is formatted as `YYYY-MM-DDTHH:mm:ss.sssZ` in UTC and ContactID is 1–64 characters), with `entityType` set to `CALL_INTERACTION_LOG`.
6. WHEN an item is stored as a `TOW_TRUCK_STATUS` entity, THE RoadAssistRecord SHALL use `PK` in the format `TRUCK#<TruckID>` (where TruckID is 1–36 alphanumeric characters) and `SK` equal to the literal string `STATUS`, with `entityType` set to `TOW_TRUCK_STATUS`.
7. WHEN an item is stored as a `TRUCK_DISPATCH_LOG` entity, THE RoadAssistRecord SHALL use `PK` in the format `TRUCK#<TruckID>` and `SK` in the format `DISPATCH#<ISO8601Timestamp>#<IncidentID>` (where ISO8601Timestamp is formatted as `YYYY-MM-DDTHH:mm:ss.sssZ` in UTC), with `entityType` set to `TRUCK_DISPATCH_LOG`.
8. THE RoadAssistRecord SHALL include an `expiresAt` attribute (integer, optional) storing a Unix epoch timestamp in seconds; this attribute SHALL be populated for `CALL_INTERACTION_LOG` and `TRUCK_DISPATCH_LOG` entities and SHALL be omitted for `CUSTOMER_PROFILE`, `CUSTOMER_VEHICLE`, `INCIDENT_METADATA`, and `TOW_TRUCK_STATUS` entities.
9. THE Backend SHALL populate the `GSI1PK` attribute (string, format `CUST#<CustomerID_or_Phone>`) and `GSI1SK` attribute (string, format `STATUS#<IncidentStatus>#<CreatedAt>`) on `INCIDENT_METADATA` records to enable customer-to-incident lookups via `GSI1`.
10. THE Backend SHALL populate the `GSI2PK` attribute (string, format `FLEET#<OperationalStatus>#<RegionZone>`) and `GSI2SK` attribute (string, format `TYPE#<TruckType>#<TruckID>`) on `TOW_TRUCK_STATUS` records to enable fleet availability lookups via `GSI2`.

---

### Requirement 4: Global Secondary Indexes

**User Story:** As a backend engineer, I want five GSIs on the DynamoDB table, so that the system can support all high-speed read access patterns required by the call center, dispatcher UI, and IoT pipeline.

#### Acceptance Criteria

1. THE Backend SHALL provision `GSI1` (`CustomerActiveIncidentIndex`) on `RoadAssistRecord` with partition key `GSI1PK` (String, format `CUST#<CustomerID_or_Phone>`), sort key `GSI1SK` (String, format `STATUS#<IncidentStatus>#<CreatedAt>`), and an ALL projection, to support look-up of a customer's active incidents at call start.
2. THE Backend SHALL provision `GSI2` (`FleetAvailabilityIndex`) on `RoadAssistRecord` with partition key `GSI2PK` (String, format `FLEET#<OperationalStatus>#<RegionZone>`), sort key `GSI2SK` (String, format `TYPE#<TruckType>#<TruckID>`), and an ALL projection, to pre-filter available tow trucks by region and type before invoking Amazon Location `CalculateRouteMatrix`.
3. THE Backend SHALL provision `GSI3` (`TruckActiveIncidentIndex`) on `RoadAssistRecord` as a sparse index — populated only by items of type Truck Assignment — with partition key `GSI3PK` (String, format `TRUCK#<TruckID>`), sort key `GSI3SK` (String, format `ACTIVE#<IncidentID>`), and an ALL projection, to resolve customer and incident context when a tow truck triggers an Amazon Location Geofence `ENTER` event.
4. THE Backend SHALL provision `GSI4` (`OperationsControlIndex`) on `RoadAssistRecord` with partition key `GSI4PK` (String, format `OPS_STATUS#<IncidentStatus>`), sort key `GSI4SK` (String, format `SEV#<Severity>#<UpdatedAt>`), and an ALL projection, to power the dispatcher supervisor queue using eventually consistent reads.
5. THE Backend SHALL provision `GSI5` (`VehicleIncidentHistoryIndex`) on `RoadAssistRecord` as a sparse index — populated only by items of type Vehicle Incident — with partition key `GSI5PK` (String, format `VEH#<PlateNumber>`), sort key `GSI5SK` (String, format `STATUS#<IncidentStatus>#<CreatedAt>`), and an ALL projection, to resolve active incidents and vehicle history when an unauthenticated caller provides a license plate mid-call.

---

### Requirement 5: AgentCore Memory Pointers and Guardrail Telemetry Attributes

**User Story:** As an AI/ML engineer, I want Bedrock AgentCore Memory correlation pointers and Guardrail audit telemetry stored natively on DynamoDB records, so that conversational state and compliance audits are traceable across incidents and LLM invocations.

#### Acceptance Criteria

1. WHEN storing an `INCIDENT_METADATA` entity, THE RoadAssistRecord SHALL include the AgentCore Memory correlation attributes: `agentCoreMemoryId` (string, max 256 characters, optional), `agentCoreActorIdCustomer` (string, max 256 characters, optional), `agentCoreActorIdVehicle` (string, max 256 characters, optional), and `agentCoreSessionId` (string, max 256 characters, optional, set to the same value as `incidentId` when provided), persisted in the same single `PutItem` or `UpdateItem` DynamoDB API call as the parent `INCIDENT_METADATA` record.
2. WHEN storing a `CALL_INTERACTION_LOG` entity, THE RoadAssistRecord SHALL include Guardrail audit attributes: `guardrailIntervened` (boolean, optional), `guardrailActionReason` (string, max 512 characters, optional), and `guardrailIdAndVersion` (string in the format `<guardrailId>:<versionNumber>` where `guardrailId` is a non-empty string and `versionNumber` is a positive integer, optional).
3. WHEN storing a `CALL_INTERACTION_LOG` entity, THE RoadAssistRecord SHALL include Contact Lens and post-call analytics attributes: `llmChatSummary` (string, max 4096 characters, optional), `contactLensGenAiSummary` (string, max 4096 characters, optional), `sentimentLabel` (string, optional), `sentimentScore` (float in the range 0.0 to 1.0 inclusive, optional), `customerEffortScore` (float in the range 0.0 to 10.0 inclusive, optional), `transcriptS3Uri` (string in `s3://` URI format, optional), and `recordingS3Uri` (string in `s3://` URI format, optional).
4. IF an AgentCore Memory correlation attribute is present but `agentCoreSessionId` does not match the `incidentId` of the parent `INCIDENT_METADATA` record, THEN THE RoadAssistRecord SHALL reject the write operation and return an error indicating a session identifier mismatch.

---

### Requirement 6: AppSync GraphQL Custom Types, Queries, Mutations, and Subscriptions

**User Story:** As a frontend engineer and ACXD integration engineer, I want strongly-typed AppSync GraphQL operations, so that the React Live Sync UI and ACXD tool-calling layer can interact with the data layer through a schema-validated, real-time API.

#### Acceptance Criteria

1. THE Backend SHALL declare Custom Types (`a.customType`) in `amplify/data/resource.ts` for every query input, mutation input, and response shape referenced by the schema, including `IncidentMemoryContext`, `NearestTruckResult`, `DispatchConfirmation`, `AnalyticsWrapUpResult`, `IncidentLiveUpdate`, and `WrapUpInput`.
2. WHEN ACXD invokes Tool 1 at call start, THE AppSync SHALL expose a `syncIncidentAndMemory` query that accepts a `contactId` and `customerIdentifier`, retrieves or creates the `INCIDENT_METADATA` and `CUSTOMER_PROFILE` records, and returns an `IncidentMemoryContext` custom type containing the AgentCore Memory pointers and customer profile fields.
3. IF the `syncIncidentAndMemory` query cannot retrieve or create the required records, THEN THE AppSync SHALL return a GraphQL error indicating which record type failed and preserve any partially created records for retry.
4. WHEN ACXD invokes Tool 2 to find a tow truck, THE AppSync SHALL expose a `locateAndFindNearestTruck` query that accepts an `incidentId` and `locationGeohash` of 6-character precision, queries `GSI2` for trucks with `operationalStatus` of `AVAILABLE` in the matching geohash prefix, and returns a `NearestTruckResult` custom type containing the `truckId`, estimated arrival time in whole minutes, and `truckType`.
4. WHEN ACXD invokes Tool 3 to dispatch a truck, THE AppSync SHALL expose a `confirmDispatchAndGeofence` mutation that accepts an `incidentId` and `truckId`, writes a `TRUCK_DISPATCH_LOG` record, creates an Amazon Location Geofence for the incident location, and returns a `DispatchConfirmation` custom type.
5. IF the `confirmDispatchAndGeofence` mutation fails to create the Amazon Location Geofence, THEN THE AppSync SHALL still return the `DispatchConfirmation` with a `geofenceStatus` field set to a value indicating failure, and the `TRUCK_DISPATCH_LOG` record SHALL be written regardless of geofence creation outcome.
6. WHEN ACXD invokes Tool 4 post-call, THE AppSync SHALL expose a `wrapUpIncidentAnalytics` mutation that accepts an `incidentId` and a `WrapUpInput` containing Contact Lens analytics fields, updates the `CALL_INTERACTION_LOG` record with post-call data, and returns an `AnalyticsWrapUpResult` custom type.
7. WHEN a Contact Lens EventBridge rule fires post-call, THE AppSync SHALL invoke the `wrapUpIncidentAnalytics` mutation with the extracted `incidentId` and Contact Lens analytics payload mapped to `WrapUpInput` fields.
8. WHEN an IoT device or driver app pushes a GPS update, THE AppSync SHALL expose an `updateTruckTelemetry` mutation that accepts a `truckId`, a `locationGeohash` of exactly 6 characters, and an `operationalStatus` value of `AVAILABLE`, `DISPATCHED`, or `OFFLINE`, and updates the `TOW_TRUCK_STATUS` record and the `GSI2` projection attributes.
9. WHEN the React Frontend subscribes to incident updates, THE AppSync SHALL expose an `onIncidentLiveUpdate` subscription filtered by `incidentId` that emits an `IncidentLiveUpdate` custom type containing the current incident status, tow truck location, and ETA in whole minutes, triggered by any successful `confirmDispatchAndGeofence` or `updateTruckTelemetry` mutation referencing that `incidentId`.
10. IF AppSync is configured to resolve a query or mutation using a Lambda function, THEN THE Backend SHALL configure the resolver with `a.handler.function()` pointing to a handler file in `amplify/functions/acxd-resolvers/` that returns a response conforming to the declared return type of that query or mutation.

---

### Requirement 7: Lambda Resolver Stubs for Sandbox Compilation

**User Story:** As a developer, I want stubbed TypeScript Lambda handler files in `amplify/functions/acxd-resolvers/`, so that `npx ampx sandbox` compiles cleanly in Phase 1 without requiring full business logic implementation.

#### Acceptance Criteria

1. WHEN Phase 1 scaffolding is complete, THE Backend SHALL contain one TypeScript handler file per AppSync Custom resolver — `syncIncidentAndMemory`, `locateAndFindNearestTruck`, `confirmDispatchAndGeofence`, `wrapUpIncidentAnalytics`, and `updateTruckTelemetry` — each exporting a `handler` function typed with the AppSync Lambda resolver event type from `@aws-amplify/backend`.
2. WHEN a stub handler is invoked during Sandbox execution, THE Backend SHALL return a response value whose shape satisfies the declared GraphQL return type for that resolver, using `null` or a typed placeholder object for each required field, so that AppSync schema validation passes without runtime type errors.
3. WHEN `npx ampx sandbox` is executed, THE System SHALL compile all files under `amplify/` without TypeScript type errors or missing module errors.
4. THE Backend SHALL declare each stub function using `defineFunction` from `@aws-amplify/backend` with a `name` matching the resolver name, an `entry` pointing to the corresponding handler file, and a `runtime` of `nodejs20.x`.
5. WHEN Phase 1 scaffolding is complete, THE Backend SHALL export all five stub `defineFunction` instances from the `amplify/backend.ts` configuration so that the sandbox compiler resolves each function without missing module errors.

---

### Requirement 8: DynamoDB Streams and TTL CDK Overrides

**User Story:** As a platform engineer, I want DynamoDB Streams and TTL enabled on the `RoadAssistRecord` table via Amplify Gen 2 CDK L2 overrides, so that downstream Lambda consumers can react to data changes in real time and stale records are automatically cleaned up.

#### Acceptance Criteria

1. THE Backend SHALL apply a CDK L2 override on the `RoadAssistRecord` underlying DynamoDB table in `amplify/backend.ts` to set `StreamViewType` to `NEW_AND_OLD_IMAGES`.
2. THE Backend SHALL apply a CDK L2 override on the `RoadAssistRecord` underlying DynamoDB table in `amplify/backend.ts` to enable the TTL attribute named `expiresAt`.
3. IF the DynamoDB Stream is enabled, THEN THE Backend SHALL output the Stream ARN as a CloudFormation output named `RoadAssistRecordStreamArn` containing a non-empty ARN matching the DynamoDB stream ARN pattern (`arn:aws:dynamodb:<region>:<account>:table/<table>/stream/<timestamp>`).
4. IF the CDK override cannot locate the underlying `CfnTable` resource, THEN THE Backend SHALL throw a synthesis-time error whose message includes the string `RoadAssistRecord` and the phrase `CfnTable not found`.
5. WHEN the CDK overrides are applied, THE Backend SHALL verify at synthesis time that both `StreamViewType` and `ttlAttribute` are set on the same `CfnTable` resource before emitting the CloudFormation template.
