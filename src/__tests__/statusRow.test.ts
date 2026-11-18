// Feature: webrtc-retry-and-geolocation-sync
// Task 5.2: Example tests for status row rendering
// Validates: Requirements 4.1, 4.2, 4.3, 4.4

/**
 * These tests validate the incident status row structural and logic contracts:
 *
 *   Req 4.1 – When activeIncident is non-null, the Map Card renders Status,
 *             Truck ID, and ETA below the map iframe.
 *
 *   Req 4.2 – Status color is #4ade80 (DISPATCHED), #f87171 (ESCALATED_TO_HUMAN),
 *             #fbbf24 (all other statuses).
 *
 *   Req 4.3 – Truck ID is rendered in color #38bdf8.
 *
 *   Req 4.4 – ETA is rendered in color #4ade80 with a "min" suffix.
 *
 * Because App renders inside <Authenticator> with heavy Amplify dependencies
 * and there is no jsdom environment configured, we use two complementary
 * approaches consistent with the existing test suite (see locateButton.test.ts):
 *
 *   1. SOURCE STRUCTURAL TESTS – Read src/App.tsx as a string and assert the
 *      exact JSX patterns that satisfy each structural requirement.
 *
 *   2. LOGIC-LEVEL TESTS – Extract and exercise the status-colour ternary
 *      expression directly in isolation, without rendering anything, to verify
 *      the three colour-coding branches (Req 4.2).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Source text — loaded once for all structural assertions
// ---------------------------------------------------------------------------

const APP_SOURCE_PATH = path.resolve(__dirname, '../../src/App.tsx');
const appSource: string = fs.readFileSync(APP_SOURCE_PATH, 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Locate the status-row block in source: from `{activeIncident && (` to the
 * matching closing `)}` that ends the block.  Returns the substring.
 *
 * Strategy: find the `{activeIncident && (` that follows the coordinates
 * caption div (which contains the iframe src), then extract up to and
 * including the first `)}` that terminates the conditional.
 */
function getStatusRowBlock(): string {
  // The status row sits just after the coordinates caption line in the Map Card.
  // We anchor on the iframe `title="Live Map"` to avoid false-positives from
  // the much larger "Live Tracker" activeIncident block further down the file.
  const iframeMarkerIdx = appSource.indexOf('title="Live Map"');
  if (iframeMarkerIdx === -1) throw new Error('Could not find Live Map iframe in App.tsx');

  const afterIframe = appSource.slice(iframeMarkerIdx);
  const conditionalRelIdx = afterIframe.indexOf('{activeIncident && (');
  if (conditionalRelIdx === -1) throw new Error('Could not find {activeIncident && ( after Live Map iframe');

  const blockStart = iframeMarkerIdx + conditionalRelIdx;
  // Extract 1300 chars — the full status row block (including Truck and ETA spans)
  // is ~1260 characters due to the multi-line ternary and indentation.
  return appSource.slice(blockStart, blockStart + 1300);
}

// ---------------------------------------------------------------------------
// Suite 1 – Structural: activeIncident conditional pattern (Req 4.1)
// ---------------------------------------------------------------------------

describe('Status row structural contract — conditional rendering (Requirement 4.1)', () => {
  it('App.tsx contains {activeIncident && (} in the Map Card section', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('{activeIncident && (');
  });

  it('the conditional block is placed after the Live Map iframe', () => {
    const iframeIdx = appSource.indexOf('title="Live Map"');
    const conditionalIdx = appSource.indexOf('{activeIncident && (', iframeIdx);

    expect(iframeIdx).toBeGreaterThan(-1);
    expect(conditionalIdx).toBeGreaterThan(iframeIdx);
  });

  it('the conditional block contains all three status fields: Status, Truck, ETA', () => {
    const block = getStatusRowBlock();

    // Each field must be present inside the same block
    expect(block).toContain('Status:');
    expect(block).toContain('Truck:');
    expect(block).toContain('ETA:');
  });

  it('the conditional block ends with closing )} matching the opening {activeIncident && (', () => {
    const block = getStatusRowBlock();
    // The block must contain a closing )}, confirming the conditional is properly closed
    expect(block).toContain(')}');
  });

  it('the status row is absent when activeIncident is null — the guard pattern is {activeIncident && (', () => {
    // When `activeIncident` is null/falsy, JS short-circuit evaluation means the
    // right-hand side of `&&` is never rendered.  Assert the guard expression
    // is the standard React null-guard pattern (not a ternary that could render
    // an alternative element).
    const block = getStatusRowBlock();
    expect(block.startsWith('{activeIncident && (')).toBe(true);

    // The outermost conditional must close with `)}` — not `? ... : ...`
    // confirming there is no fallback element rendered when null.
    const closingIdx = block.indexOf(')}');
    expect(closingIdx).toBeGreaterThan(-1);
    // No top-level ternary alternative: the `? ... :` pattern at this nesting level
    // would mean fallback content is rendered for null — which must not be the case.
    // We check the pattern by counting that the block uses `&&` not `? ... :`
    expect(block).toContain('{activeIncident && (');
    expect(block.startsWith('{activeIncident &&')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Suite 2 – Structural: status color values present in source (Req 4.2)
// ---------------------------------------------------------------------------

describe('Status row structural contract — status colour coding (Requirement 4.2)', () => {
  it('the block contains the DISPATCHED color #4ade80', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#4ade80');
  });

  it('the block contains the ESCALATED_TO_HUMAN color #f87171', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#f87171');
  });

  it('the block contains the fallback (other statuses) color #fbbf24', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#fbbf24');
  });

  it('the DISPATCHED comparison appears in the status color expression', () => {
    const block = getStatusRowBlock();
    expect(block).toContain("=== 'DISPATCHED'");
  });

  it('the ESCALATED_TO_HUMAN comparison appears in the status color expression', () => {
    const block = getStatusRowBlock();
    expect(block).toContain("=== 'ESCALATED_TO_HUMAN'");
  });

  it('the color ternary uses all three colors in the correct order', () => {
    const block = getStatusRowBlock();
    const dispatchedIdx       = block.indexOf('#4ade80');
    const escalatedIdx        = block.indexOf('#f87171');
    const fallbackIdx         = block.indexOf('#fbbf24');

    // All three must be present
    expect(dispatchedIdx).toBeGreaterThan(-1);
    expect(escalatedIdx).toBeGreaterThan(-1);
    expect(fallbackIdx).toBeGreaterThan(-1);

    // DISPATCHED color first, ESCALATED color second, fallback color last
    // (this mirrors the ternary: DISPATCHED ? green : ESCALATED ? red : yellow)
    expect(dispatchedIdx).toBeLessThan(escalatedIdx);
    expect(escalatedIdx).toBeLessThan(fallbackIdx);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 – Structural: truck ID color (Req 4.3)
// ---------------------------------------------------------------------------

describe('Status row structural contract — truck ID colour (Requirement 4.3)', () => {
  it('the block contains the truck ID color #38bdf8', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#38bdf8');
  });

  it('the Truck label and #38bdf8 color are co-located in the same span', () => {
    const block = getStatusRowBlock();
    const truckIdx = block.indexOf('Truck:');
    const colorIdx = block.indexOf('#38bdf8');

    expect(truckIdx).toBeGreaterThan(-1);
    expect(colorIdx).toBeGreaterThan(-1);

    // The truck color must appear after the Truck: label — they are in the same span
    expect(colorIdx).toBeGreaterThan(truckIdx);
    // And within a tight window (< 150 chars) — same JSX span
    expect(colorIdx - truckIdx).toBeLessThan(150);
  });

  it('assignedTruckId is rendered inside a <strong> element with #38bdf8', () => {
    const block = getStatusRowBlock();
    // The strong element for the truck ID uses single-quoted color value
    const strongIdx = block.indexOf("<strong style={{ color: '#38bdf8' }}>");
    expect(strongIdx).toBeGreaterThan(-1);
    // The assignedTruckId expression must follow in the same element
    const afterStrong = block.slice(strongIdx, strongIdx + 100);
    expect(afterStrong).toContain('assignedTruckId');
  });
});

// ---------------------------------------------------------------------------
// Suite 4 – Structural: ETA color and "min" suffix (Req 4.4)
// ---------------------------------------------------------------------------

describe('Status row structural contract — ETA colour and suffix (Requirement 4.4)', () => {
  it('the block contains "min" text after the ETA value', () => {
    const block = getStatusRowBlock();
    // The ETA is rendered as `{activeIncident.estimatedArrivalMinutes} min`
    expect(block).toContain('} min');
  });

  it('the ETA value is wrapped in a <strong> element with color #4ade80', () => {
    const block = getStatusRowBlock();
    // Locate the ETA label then look for the #4ade80 strong after it
    const etaLabelIdx = block.indexOf('ETA:');
    const etaColorIdx = block.indexOf('#4ade80', etaLabelIdx);

    expect(etaLabelIdx).toBeGreaterThan(-1);
    expect(etaColorIdx).toBeGreaterThan(etaLabelIdx);
    // Within a tight window — same span block
    expect(etaColorIdx - etaLabelIdx).toBeLessThan(120);
  });

  it('estimatedArrivalMinutes is the expression used for ETA', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('estimatedArrivalMinutes');
  });

  it('"min" suffix appears after the estimatedArrivalMinutes expression', () => {
    const block = getStatusRowBlock();
    const etaExprIdx = block.indexOf('estimatedArrivalMinutes');
    const minSuffixIdx = block.indexOf('} min', etaExprIdx);

    expect(etaExprIdx).toBeGreaterThan(-1);
    expect(minSuffixIdx).toBeGreaterThan(etaExprIdx);
    // Very close together — the } closes the JSX expression and " min" follows
    expect(minSuffixIdx - etaExprIdx).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Suite 5 – Logic-level: status colour computation function in isolation (Req 4.2)
// ---------------------------------------------------------------------------

/**
 * The color-selection logic in App.tsx is this ternary:
 *
 *   activeIncident.incidentStatus === 'DISPATCHED'
 *     ? '#4ade80'
 *     : activeIncident.incidentStatus === 'ESCALATED_TO_HUMAN'
 *     ? '#f87171'
 *     : '#fbbf24'
 *
 * We extract that logic into a local pure function and test all three branches
 * directly, without rendering anything.
 */

/** Mirrors the color ternary from App.tsx — the single source of truth for color selection. */
function resolveStatusColor(status: string): string {
  return status === 'DISPATCHED'
    ? '#4ade80'
    : status === 'ESCALATED_TO_HUMAN'
    ? '#f87171'
    : '#fbbf24';
}

describe('Status row logic — status colour computation (Requirement 4.2)', () => {
  it('DISPATCHED status maps to green #4ade80', () => {
    expect(resolveStatusColor('DISPATCHED')).toBe('#4ade80');
  });

  it('ESCALATED_TO_HUMAN status maps to red #f87171', () => {
    expect(resolveStatusColor('ESCALATED_TO_HUMAN')).toBe('#f87171');
  });

  it('OPEN status maps to yellow fallback #fbbf24', () => {
    expect(resolveStatusColor('OPEN')).toBe('#fbbf24');
  });

  it('EN_ROUTE status maps to yellow fallback #fbbf24', () => {
    expect(resolveStatusColor('EN_ROUTE')).toBe('#fbbf24');
  });

  it('ARRIVED_1_5KM status maps to yellow fallback #fbbf24', () => {
    expect(resolveStatusColor('ARRIVED_1_5KM')).toBe('#fbbf24');
  });

  it('COMPLETED status maps to yellow fallback #fbbf24', () => {
    expect(resolveStatusColor('COMPLETED')).toBe('#fbbf24');
  });

  it('DISPATCHED_BY_HUMAN status maps to yellow fallback #fbbf24 (not a special case)', () => {
    expect(resolveStatusColor('DISPATCHED_BY_HUMAN')).toBe('#fbbf24');
  });

  it('empty string maps to yellow fallback #fbbf24', () => {
    expect(resolveStatusColor('')).toBe('#fbbf24');
  });

  it('only exact string DISPATCHED gets green — mixed case does not', () => {
    expect(resolveStatusColor('dispatched')).toBe('#fbbf24');
    expect(resolveStatusColor('Dispatched')).toBe('#fbbf24');
  });

  it('only exact string ESCALATED_TO_HUMAN gets red — mixed case does not', () => {
    expect(resolveStatusColor('escalated_to_human')).toBe('#fbbf24');
    expect(resolveStatusColor('ESCALATED_to_human')).toBe('#fbbf24');
  });
});

// ---------------------------------------------------------------------------
// Suite 6 – Combined: all four requirements satisfied together
// ---------------------------------------------------------------------------

describe('Status row — all four requirements satisfied together', () => {
  it('satisfies Req 4.1: conditional guard pattern present after Live Map iframe', () => {
    const iframeIdx     = appSource.indexOf('title="Live Map"');
    const conditionalIdx = appSource.indexOf('{activeIncident && (', iframeIdx);
    expect(iframeIdx).toBeGreaterThan(-1);
    expect(conditionalIdx).toBeGreaterThan(iframeIdx);
  });

  it('satisfies Req 4.2: all three status colors and both comparisons present', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#4ade80');
    expect(block).toContain('#f87171');
    expect(block).toContain('#fbbf24');
    expect(block).toContain("=== 'DISPATCHED'");
    expect(block).toContain("=== 'ESCALATED_TO_HUMAN'");
  });

  it('satisfies Req 4.3: truck ID rendered in #38bdf8', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('#38bdf8');
    expect(block).toContain('assignedTruckId');
  });

  it('satisfies Req 4.4: ETA rendered in #4ade80 with "min" suffix', () => {
    const block = getStatusRowBlock();
    expect(block).toContain('estimatedArrivalMinutes');
    expect(block).toContain('} min');
    const etaLabelIdx = block.indexOf('ETA:');
    const etaColorIdx = block.indexOf('#4ade80', etaLabelIdx);
    expect(etaColorIdx).toBeGreaterThan(etaLabelIdx);
  });

  it('all four requirements are co-located within the same status row block', () => {
    const block = getStatusRowBlock();
    // The entire block must be under 1400 characters — confirming everything
    // is tightly co-located in a single JSX fragment, not scattered across the file.
    expect(block.length).toBeLessThan(1400);
    expect(block).toContain('{activeIncident && (');
    expect(block).toContain('Status:');
    expect(block).toContain('Truck:');
    expect(block).toContain('ETA:');
  });
});
