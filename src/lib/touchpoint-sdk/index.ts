/**
 * Local stub module for @amazon-connect/touchpoint-sdk.
 *
 * The `@amazon-connect/touchpoint-sdk` package is not published on npm.
 * This stub exports an equivalent Touchpoint Web SDK interface under the
 * single named import `TouchpointSDK`, satisfying Requirement 1.2.
 *
 * Replace the stub bodies with real Amazon Connect Touchpoint integration
 * code once the official SDK is available or embedded via a CDN script tag.
 */

export interface TouchpointConfig {
  instanceId: string;
  region?: string;
  contactAttributes?: Record<string, string>;
}

export interface TouchpointContact {
  contactId: string;
  channel: 'VOICE' | 'CHAT' | 'TASK';
  attributes: Record<string, string>;
}

export interface LiveSyncPayload {
  incidentId: string;
  incidentStatus: string;
  truckLocationGeohash?: string;
  etaMinutes?: number;
}

export interface TouchpointSDKInterface {
  /** Initialise the Touchpoint widget and attach it to the DOM. */
  init(config: TouchpointConfig): Promise<void>;

  /** Subscribe to incoming contact events from Amazon Connect. */
  onContactConnected(handler: (contact: TouchpointContact) => void): () => void;

  /** Subscribe to contact disconnection events. */
  onContactDisconnected(handler: (contact: TouchpointContact) => void): () => void;

  /** Push a Live Sync payload to the currently active contact session. */
  pushLiveSync(payload: LiveSyncPayload): Promise<void>;

  /** Terminate the current Touchpoint session and remove the widget. */
  destroy(): void;
}

class TouchpointSDKStub implements TouchpointSDKInterface {
  async init(_config: TouchpointConfig): Promise<void> {
    console.warn('[TouchpointSDK] Stub: init() — replace with real SDK.');
  }

  onContactConnected(
    _handler: (contact: TouchpointContact) => void,
  ): () => void {
    console.warn(
      '[TouchpointSDK] Stub: onContactConnected() — replace with real SDK.',
    );
    return () => {
      /* no-op unsubscribe */
    };
  }

  onContactDisconnected(
    _handler: (contact: TouchpointContact) => void,
  ): () => void {
    console.warn(
      '[TouchpointSDK] Stub: onContactDisconnected() — replace with real SDK.',
    );
    return () => {
      /* no-op unsubscribe */
    };
  }

  async pushLiveSync(_payload: LiveSyncPayload): Promise<void> {
    console.warn(
      '[TouchpointSDK] Stub: pushLiveSync() — replace with real SDK.',
    );
  }

  destroy(): void {
    console.warn('[TouchpointSDK] Stub: destroy() — replace with real SDK.');
  }
}

/**
 * Single named export satisfying the "single named import" requirement.
 * Usage:
 *   import { TouchpointSDK } from '@/lib/touchpoint-sdk';
 */
export const TouchpointSDK: TouchpointSDKInterface = new TouchpointSDKStub();
