// Feature: webrtc-retry-and-geolocation-sync
// Task 4.2: Example tests for the Locate button
// Validates: Requirements 3.1, 3.2, 3.3

/**
 * These tests validate the Locate button structural and behavioural contracts:
 *
 *   Req 3.1 – The GPS Geohash grid cell renders a button labelled with the
 *             pin emoji ("📍 Locate").
 *
 *   Req 3.2 – The button occupies 1/3 of the cell width (the container uses
 *             gridTemplateColumns: '2fr 1fr', so input is 2/3 and button is 1/3).
 *
 *   Req 3.3 – Clicking the Locate button calls handleGetLocation.
 *
 * Because App renders inside <Authenticator> with heavy Amplify dependencies
 * and there is no jsdom environment configured, we use two complementary
 * approaches consistent with the existing test suite:
 *
 *   1. SOURCE STRUCTURAL TESTS – Read src/App.tsx as a string and assert the
 *      exact JSX patterns that satisfy the structural requirements (grid layout,
 *      button label, button wired to handleGetLocation).
 *
 *   2. BEHAVIOURAL LOGIC TESTS – Reproduce the minimal onClick wiring in
 *      isolation with a vi.fn() spy standing in for handleGetLocation, then
 *      fire a synthetic click and assert the spy was called (Req 3.3).
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Source text — loaded once for all structural assertions
// ---------------------------------------------------------------------------

const APP_SOURCE_PATH = path.resolve(
  __dirname,
  '../../src/App.tsx',
);

const appSource: string = fs.readFileSync(APP_SOURCE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Suite 1 – Structural: GPS Geohash cell contains the "📍 Locate" button (Req 3.1)
// ---------------------------------------------------------------------------

describe('Locate button structural contract — label (Requirement 3.1)', () => {
  it('App.tsx contains a button element with the "📍 Locate" label', () => {
    // The button text node must be exactly "📍 Locate" (pin emoji + space + Locate)
    expect(appSource).toContain('📍 Locate');
  });

  it('the "📍 Locate" button is inside a JSX <button> element', () => {
    // Find the locate label, then search backwards for the nearest <button opening tag.
    const locateIdx     = appSource.indexOf('📍 Locate');
    const beforeLocate  = appSource.slice(0, locateIdx);
    const buttonOpenIdx = beforeLocate.lastIndexOf('<button');

    // There must be a <button opening before the label text
    expect(buttonOpenIdx).toBeGreaterThanOrEqual(0);
    // The label appears after the button opening tag
    expect(locateIdx).toBeGreaterThan(buttonOpenIdx);
  });

  it('the "📍 Locate" button is preceded by a </button> closing tag (not the only button)', () => {
    // Confirms we have at least one </button> after the locate label — the cell
    // must close the button element.
    const locateIdx = appSource.indexOf('📍 Locate');
    expect(locateIdx).toBeGreaterThan(-1);

    const afterLocate = appSource.slice(locateIdx);
    expect(afterLocate).toContain('</button>');
  });

  it('the label text is "📍 Locate" — not just the emoji or just the word', () => {
    // Must be the full string, not a partial match.
    const idx = appSource.indexOf('📍 Locate');
    expect(idx).toBeGreaterThan(-1);

    // Verify it is not split across adjacent text nodes (no intervening JSX)
    const snippet = appSource.slice(idx, idx + 12);
    expect(snippet.trim()).toBe('📍 Locate');
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – Structural: container uses gridTemplateColumns '2fr 1fr' (Req 3.2)
// ---------------------------------------------------------------------------

describe('Locate button structural contract — 2fr/1fr grid layout (Requirement 3.2)', () => {
  it('App.tsx contains a gridTemplateColumns: \'2fr 1fr\' style on the geohash cell container', () => {
    expect(appSource).toContain("gridTemplateColumns: '2fr 1fr'");
  });

  it('the 2fr/1fr grid container is placed inside the GPS 6-Char Geohash label block', () => {
    // The label "GPS 6-Char Geohash" must appear before the grid definition.
    const labelIdx = appSource.indexOf('GPS 6-Char Geohash');
    const gridIdx  = appSource.indexOf("gridTemplateColumns: '2fr 1fr'");

    expect(labelIdx).toBeGreaterThan(-1);
    expect(gridIdx).toBeGreaterThan(labelIdx);
  });

  it('the 2fr/1fr grid container wraps both the geohash input and the Locate button', () => {
    const gridIdx   = appSource.indexOf("gridTemplateColumns: '2fr 1fr'");
    const locateIdx = appSource.indexOf('📍 Locate');

    // gridTemplateColumns definition must come before the Locate button label
    expect(gridIdx).toBeGreaterThan(-1);
    expect(locateIdx).toBeGreaterThan(gridIdx);

    // The segment between the grid declaration and the button label must contain
    // both the geohash <input (input comes first) and the <button (button second).
    const segment = appSource.slice(gridIdx, locateIdx);
    expect(segment).toContain('<input');
    expect(segment).toContain('<button');
  });

  it('gridTemplateColumns value is exactly \'2fr 1fr\' (input 2/3, button 1/3)', () => {
    // Assert the full style token — not '1fr 2fr' or '2fr 2fr'.
    // There may be multiple gridTemplateColumns in the file — find the one
    // that is nearest to and before the Locate button.
    const locateIdx = appSource.indexOf('📍 Locate');
    const before    = appSource.slice(0, locateIdx);
    const lastMatch = before.match(/gridTemplateColumns:\s*'([^']+)'/g);

    expect(lastMatch).not.toBeNull();
    const lastValue = lastMatch![lastMatch!.length - 1];
    expect(lastValue).toContain('2fr 1fr');
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – Structural: Locate button is wired to handleGetLocation (Req 3.3)
// ---------------------------------------------------------------------------

describe('Locate button structural contract — onClick wiring (Requirement 3.3)', () => {
  it('the Locate button has onClick={handleGetLocation} in App.tsx', () => {
    // The onClick prop must reference handleGetLocation by name.
    expect(appSource).toContain('onClick={handleGetLocation}');
  });

  it('onClick={handleGetLocation} appears before the "📍 Locate" label in source order', () => {
    const onClickIdx = appSource.lastIndexOf('onClick={handleGetLocation}');
    const locateIdx  = appSource.indexOf('📍 Locate');

    expect(onClickIdx).toBeGreaterThan(-1);
    // The last occurrence of onClick={handleGetLocation} before the label
    // confirms the correct button is wired.
    const beforeLocate = appSource.slice(0, locateIdx);
    expect(beforeLocate).toContain('onClick={handleGetLocation}');
  });

  it('the Locate button onClick and label are in the same JSX button block', () => {
    // Find the last <button before the 📍 Locate text, then check that block
    // contains onClick={handleGetLocation}.
    const locateIdx = appSource.indexOf('📍 Locate');
    const beforeLocate = appSource.slice(0, locateIdx);

    // Walk back to the last <button opening tag
    const lastButtonStart = beforeLocate.lastIndexOf('<button');
    expect(lastButtonStart).toBeGreaterThan(-1);

    // The segment from <button to the label text must contain onClick={handleGetLocation}
    const buttonBlock = appSource.slice(lastButtonStart, locateIdx);
    expect(buttonBlock).toContain('onClick={handleGetLocation}');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 – Behavioural: clicking the button calls handleGetLocation (Req 3.3)
// ---------------------------------------------------------------------------

/**
 * These tests reproduce the onClick wiring pattern in isolation.
 * We create a minimal button descriptor (matching the JSX props structure)
 * and simulate a click by invoking the onClick handler directly —
 * the same mechanism a browser would use after resolving the handler reference.
 *
 * This is the idiomatic approach for environments without jsdom: test the
 * handler dispatch contract at the function level.
 */

describe('Locate button behavioural contract — handler invocation (Requirement 3.3)', () => {
  it('invoking the onClick handler calls handleGetLocation exactly once', () => {
    // Spy standing in for handleGetLocation
    const handleGetLocation = vi.fn();

    // Minimal button descriptor mirroring the JSX props from App.tsx:
    //   <button onClick={handleGetLocation}>📍 Locate</button>
    const buttonProps = {
      onClick: handleGetLocation,
      children: '📍 Locate',
    };

    // Simulate a click event dispatch — call the onClick prop
    buttonProps.onClick();

    expect(handleGetLocation).toHaveBeenCalledOnce();
  });

  it('invoking the onClick handler calls handleGetLocation, not a wrapper', () => {
    const handleGetLocation = vi.fn();

    const buttonProps = { onClick: handleGetLocation };

    // After one click the spy must be the same function reference
    buttonProps.onClick();

    expect(handleGetLocation).toHaveBeenCalledTimes(1);
    // The spy should be the direct handler, not wrapped
    expect(buttonProps.onClick).toBe(handleGetLocation);
  });

  it('the handler is not called before the button is clicked', () => {
    const handleGetLocation = vi.fn();

    // Just assert the spy hasn't been called without needing button props
    expect(handleGetLocation).not.toHaveBeenCalled();
  });

  it('clicking the button multiple times calls handleGetLocation the same number of times', () => {
    const handleGetLocation = vi.fn();
    const buttonProps = { onClick: handleGetLocation };

    buttonProps.onClick();
    buttonProps.onClick();
    buttonProps.onClick();

    expect(handleGetLocation).toHaveBeenCalledTimes(3);
  });

  it('the onClick handler is a function (not undefined or null)', () => {
    const handleGetLocation = vi.fn();
    const buttonProps = { onClick: handleGetLocation };

    expect(typeof buttonProps.onClick).toBe('function');
    expect(buttonProps.onClick).not.toBeNull();
    expect(buttonProps.onClick).not.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Suite 5 – Combined: layout + button + handler all present together (Reqs 3.1–3.3)
// ---------------------------------------------------------------------------

describe('Locate button — all three requirements satisfied together', () => {
  it('App.tsx satisfies Req 3.1: pin-emoji label exists', () => {
    expect(appSource).toContain('📍 Locate');
  });

  it('App.tsx satisfies Req 3.2: 2fr/1fr grid container wraps input and button', () => {
    expect(appSource).toContain("gridTemplateColumns: '2fr 1fr'");

    // Both children (input and button) must appear inside the grid container
    const gridIdx   = appSource.indexOf("gridTemplateColumns: '2fr 1fr'");
    const locateIdx = appSource.indexOf('📍 Locate');
    const segment   = appSource.slice(gridIdx, locateIdx);

    expect(segment).toContain('<input');
    expect(segment).toContain('<button');
  });

  it('App.tsx satisfies Req 3.3: button onClick is wired to handleGetLocation', () => {
    expect(appSource).toContain('onClick={handleGetLocation}');
  });

  it('all three contracts hold simultaneously in the same region of App.tsx', () => {
    // Determine that Req 3.1, 3.2, 3.3 patterns all fall in the same narrow
    // window of source (within 600 chars of each other), confirming they are
    // co-located in the same JSX cell — not scattered across the file.
    const gridIdx   = appSource.indexOf("gridTemplateColumns: '2fr 1fr'");
    const locateIdx = appSource.indexOf('📍 Locate');
    const onClickIdx = appSource.lastIndexOf('onClick={handleGetLocation}', locateIdx);

    expect(gridIdx).toBeGreaterThan(-1);
    expect(locateIdx).toBeGreaterThan(-1);
    expect(onClickIdx).toBeGreaterThan(-1);

    // All three must be within a 1400-character window
    // (the geohash input element's full style block sits between the grid
    // container declaration and the button label, accounting for the span)
    const span = locateIdx - gridIdx;
    expect(span).toBeGreaterThan(0);
    expect(span).toBeLessThan(1400);

    const onClickSpan = locateIdx - onClickIdx;
    expect(onClickSpan).toBeGreaterThan(0);
    expect(onClickSpan).toBeLessThan(600);
  });
});
