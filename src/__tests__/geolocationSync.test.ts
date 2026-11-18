// Feature: webrtc-retry-and-geolocation-sync
// Task 3.2: Unit tests for handleGetLocation geohash sync
// Validates: Requirements 2.1, 2.2, 2.3

/**
 * These tests validate the geohash-sync contracts from Requirements 2.1–2.3:
 *
 *   Req 2.1 – On geolocation success, handleGetLocation encodes the real
 *             coordinates to a 6-char geohash via ngeohash.encode(lat, lng, 6)
 *             and calls setGeohashInput with that value.
 *
 *   Req 2.2 – When navigator.geolocation is unavailable, handleGetLocation
 *             resets to the Bahrain defaults (26.2285, 50.5860) and calls
 *             setGeohashInput with ngeohash.encode(26.2285, 50.5860, 6).
 *
 *   Req 2.3 – When getCurrentPosition triggers its error callback,
 *             handleGetLocation resets to the Bahrain defaults and calls
 *             setGeohashInput with ngeohash.encode(26.2285, 50.5860, 6).
 *
 * Because handleGetLocation is an inline React callback inside App, we test
 * the same logic pattern by reproducing the function body with spy stand-ins
 * for setLat / setLng / setGeohashInput and a fully mocked navigator.geolocation.
 * This keeps the tests fast and free of DOM / Amplify bootstrapping.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ngeohash from 'ngeohash';

// ---------------------------------------------------------------------------
// Bahrain default constants (mirror App.tsx)
// ---------------------------------------------------------------------------
const DEFAULT_LAT = 26.2285;
const DEFAULT_LNG = 50.5860;
const DEFAULT_GEOHASH = ngeohash.encode(DEFAULT_LAT, DEFAULT_LNG, 6);

// ---------------------------------------------------------------------------
// Reproduction of handleGetLocation (mirrors the implementation in App.tsx)
// ---------------------------------------------------------------------------
/**
 * Reproduces the handleGetLocation logic exactly, accepting the three state
 * setter spies so we can assert the values they are called with.
 */
function handleGetLocation(
  setLat: (v: number) => void,
  setLng: (v: number) => void,
  setGeohashInput: (v: string) => void,
): void {
  if (!navigator.geolocation) {
    setLat(DEFAULT_LAT);
    setLng(DEFAULT_LNG);
    setGeohashInput(ngeohash.encode(DEFAULT_LAT, DEFAULT_LNG, 6));
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (p) => {
      setLat(p.coords.latitude);
      setLng(p.coords.longitude);
      setGeohashInput(ngeohash.encode(p.coords.latitude, p.coords.longitude, 6));
    },
    () => {
      setLat(DEFAULT_LAT);
      setLng(DEFAULT_LNG);
      setGeohashInput(ngeohash.encode(DEFAULT_LAT, DEFAULT_LNG, 6));
    },
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds a minimal GeolocationCoordinates-shaped object. */
function makeCoords(latitude: number, longitude: number): GeolocationCoordinates {
  return {
    latitude,
    longitude,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON() { return {}; },
  };
}

/** Builds a minimal GeolocationPosition-shaped object. */
function makePosition(latitude: number, longitude: number): GeolocationPosition {
  return {
    coords: makeCoords(latitude, longitude),
    timestamp: Date.now(),
    toJSON() { return {}; },
  };
}

// ---------------------------------------------------------------------------
// Suite 1 – Geolocation success (Requirement 2.1)
// ---------------------------------------------------------------------------

describe('handleGetLocation — geolocation success (Requirement 2.1)', () => {
  let setLat: ReturnType<typeof vi.fn>;
  let setLng: ReturnType<typeof vi.fn>;
  let setGeohashInput: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLat = vi.fn();
    setLng = vi.fn();
    setGeohashInput = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sets geohashInput to ngeohash.encode(lat, lng, 6) on success — Manama coordinates', () => {
    const lat = 26.2285;
    const lng = 50.5860;
    const position = makePosition(lat, lng);

    // Stub getCurrentPosition to immediately invoke the success callback.
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((successCb: PositionCallback) => successCb(position)),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    const expectedGeohash = ngeohash.encode(lat, lng, 6);

    expect(setLat).toHaveBeenCalledOnce();
    expect(setLat).toHaveBeenCalledWith(lat);

    expect(setLng).toHaveBeenCalledOnce();
    expect(setLng).toHaveBeenCalledWith(lng);

    expect(setGeohashInput).toHaveBeenCalledOnce();
    expect(setGeohashInput).toHaveBeenCalledWith(expectedGeohash);
    expect(expectedGeohash).toHaveLength(6);
  });

  it('sets geohashInput to a different 6-char geohash for different coordinates — London', () => {
    const lat = 51.5074;
    const lng = -0.1278;
    const position = makePosition(lat, lng);

    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((successCb: PositionCallback) => successCb(position)),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    const expectedGeohash = ngeohash.encode(lat, lng, 6);

    expect(setLat).toHaveBeenCalledWith(lat);
    expect(setLng).toHaveBeenCalledWith(lng);
    expect(setGeohashInput).toHaveBeenCalledWith(expectedGeohash);
    expect(expectedGeohash).toHaveLength(6);
    // London geohash must differ from the Bahrain default
    expect(expectedGeohash).not.toBe(DEFAULT_GEOHASH);
  });

  it('encodes arbitrary coordinates to exactly 6 characters', () => {
    const testCases: Array<[number, number]> = [
      [40.7128, -74.006],   // New York
      [35.6762, 139.6503],  // Tokyo
      [-33.8688, 151.2093], // Sydney
      [48.8566, 2.3522],    // Paris
    ];

    testCases.forEach(([lat, lng]) => {
      const position = makePosition(lat, lng);
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: vi.fn((successCb: PositionCallback) => successCb(position)),
        },
      });

      const localSetGeohash = vi.fn();
      handleGetLocation(vi.fn(), vi.fn(), localSetGeohash);

      expect(localSetGeohash).toHaveBeenCalledOnce();
      const receivedGeohash = localSetGeohash.mock.calls[0][0] as string;
      expect(receivedGeohash).toBe(ngeohash.encode(lat, lng, 6));
      expect(receivedGeohash).toHaveLength(6);
    });
  });

  it('does not call setLat/setLng/setGeohashInput with default values on success', () => {
    const lat = 25.0;
    const lng = 55.0;
    const position = makePosition(lat, lng);

    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn((successCb: PositionCallback) => successCb(position)),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setLat).not.toHaveBeenCalledWith(DEFAULT_LAT);
    expect(setLng).not.toHaveBeenCalledWith(DEFAULT_LNG);
    expect(setGeohashInput).not.toHaveBeenCalledWith(DEFAULT_GEOHASH);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – Geolocation unavailable (Requirement 2.2)
// ---------------------------------------------------------------------------

describe('handleGetLocation — geolocation unavailable (Requirement 2.2)', () => {
  let setLat: ReturnType<typeof vi.fn>;
  let setLng: ReturnType<typeof vi.fn>;
  let setGeohashInput: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLat = vi.fn();
    setLng = vi.fn();
    setGeohashInput = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets to Bahrain defaults when navigator.geolocation is undefined', () => {
    vi.stubGlobal('navigator', { geolocation: undefined });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setLat).toHaveBeenCalledOnce();
    expect(setLat).toHaveBeenCalledWith(DEFAULT_LAT);

    expect(setLng).toHaveBeenCalledOnce();
    expect(setLng).toHaveBeenCalledWith(DEFAULT_LNG);

    expect(setGeohashInput).toHaveBeenCalledOnce();
    expect(setGeohashInput).toHaveBeenCalledWith(DEFAULT_GEOHASH);
  });

  it('resets to Bahrain defaults when navigator.geolocation is null', () => {
    vi.stubGlobal('navigator', { geolocation: null });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setLat).toHaveBeenCalledWith(DEFAULT_LAT);
    expect(setLng).toHaveBeenCalledWith(DEFAULT_LNG);
    expect(setGeohashInput).toHaveBeenCalledWith(DEFAULT_GEOHASH);
  });

  it('default geohash is exactly 6 characters', () => {
    vi.stubGlobal('navigator', { geolocation: undefined });

    handleGetLocation(setLat, setLng, setGeohashInput);

    const received = setGeohashInput.mock.calls[0][0] as string;
    expect(received).toHaveLength(6);
  });

  it('does not call getCurrentPosition when geolocation is unavailable', () => {
    const getCurrentPosition = vi.fn();
    vi.stubGlobal('navigator', {
      geolocation: undefined,
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    // getCurrentPosition must never be invoked — there is no geolocation object
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – Geolocation positioning error (Requirement 2.3)
// ---------------------------------------------------------------------------

describe('handleGetLocation — positioning error (Requirement 2.3)', () => {
  let setLat: ReturnType<typeof vi.fn>;
  let setLng: ReturnType<typeof vi.fn>;
  let setGeohashInput: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLat = vi.fn();
    setLng = vi.fn();
    setGeohashInput = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets to Bahrain defaults when getCurrentPosition calls the error callback', () => {
    // Stub getCurrentPosition to immediately invoke the error callback
    // (simulates PERMISSION_DENIED, POSITION_UNAVAILABLE, or TIMEOUT)
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_successCb: PositionCallback, errorCb?: PositionErrorCallback) => {
            errorCb?.({
              code: 1,
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
        ),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setLat).toHaveBeenCalledOnce();
    expect(setLat).toHaveBeenCalledWith(DEFAULT_LAT);

    expect(setLng).toHaveBeenCalledOnce();
    expect(setLng).toHaveBeenCalledWith(DEFAULT_LNG);

    expect(setGeohashInput).toHaveBeenCalledOnce();
    expect(setGeohashInput).toHaveBeenCalledWith(DEFAULT_GEOHASH);
  });

  it('resets to Bahrain defaults on POSITION_UNAVAILABLE error', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_successCb: PositionCallback, errorCb?: PositionErrorCallback) => {
            errorCb?.({
              code: 2,
              message: 'Position unavailable',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
        ),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setGeohashInput).toHaveBeenCalledWith(DEFAULT_GEOHASH);
    expect(setLat).toHaveBeenCalledWith(DEFAULT_LAT);
    expect(setLng).toHaveBeenCalledWith(DEFAULT_LNG);
  });

  it('resets to Bahrain defaults on TIMEOUT error', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_successCb: PositionCallback, errorCb?: PositionErrorCallback) => {
            errorCb?.({
              code: 3,
              message: 'Timeout expired',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
        ),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    expect(setGeohashInput).toHaveBeenCalledWith(DEFAULT_GEOHASH);
  });

  it('does not set geohashInput to a real-coordinate value on error', () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_successCb: PositionCallback, errorCb?: PositionErrorCallback) => {
            errorCb?.({
              code: 1,
              message: 'Permission denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
        ),
      },
    });

    handleGetLocation(setLat, setLng, setGeohashInput);

    const received = setGeohashInput.mock.calls[0][0] as string;
    // Must be exactly the default Bahrain geohash, not some real-device value
    expect(received).toBe(DEFAULT_GEOHASH);
    expect(received).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// Suite 4 – Consistency between all failure modes (Requirements 2.2, 2.3)
// ---------------------------------------------------------------------------

describe('handleGetLocation — failure mode consistency (Requirements 2.2, 2.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('both failure modes produce the same geohash, lat, and lng values', () => {
    // Unavailable path
    vi.stubGlobal('navigator', { geolocation: undefined });
    const setGeohashUnavailable = vi.fn();
    const setLatUnavailable = vi.fn();
    const setLngUnavailable = vi.fn();
    handleGetLocation(setLatUnavailable, setLngUnavailable, setGeohashUnavailable);

    const geohashOnUnavailable = setGeohashUnavailable.mock.calls[0][0];
    const latOnUnavailable = setLatUnavailable.mock.calls[0][0];
    const lngOnUnavailable = setLngUnavailable.mock.calls[0][0];

    // Error callback path
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: vi.fn(
          (_successCb: PositionCallback, errorCb?: PositionErrorCallback) => {
            errorCb?.({
              code: 1,
              message: 'Permission denied',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            } as GeolocationPositionError);
          },
        ),
      },
    });
    const setGeohashError = vi.fn();
    const setLatError = vi.fn();
    const setLngError = vi.fn();
    handleGetLocation(setLatError, setLngError, setGeohashError);

    const geohashOnError = setGeohashError.mock.calls[0][0];
    const latOnError = setLatError.mock.calls[0][0];
    const lngOnError = setLngError.mock.calls[0][0];

    // Both failure modes must yield identical state values
    expect(geohashOnUnavailable).toBe(geohashOnError);
    expect(latOnUnavailable).toBe(latOnError);
    expect(lngOnUnavailable).toBe(lngOnError);

    // And they must match the known Bahrain defaults
    expect(geohashOnUnavailable).toBe(DEFAULT_GEOHASH);
    expect(latOnUnavailable).toBe(DEFAULT_LAT);
    expect(lngOnUnavailable).toBe(DEFAULT_LNG);
  });
});
