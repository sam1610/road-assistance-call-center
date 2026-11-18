// Vitest setup: polyfill browser globals required by amazon-connect-chatjs,
// amazon-connect-streams, and aws-amplify so they don't crash in Node.

if (typeof globalThis.self === 'undefined') {
  (globalThis as any).self = globalThis;
}
if (typeof globalThis.window === 'undefined') {
  (globalThis as any).window = globalThis;
}

// addEventListener stub — Amplify/RxJS calls globalObj.addEventListener at teardown
if (typeof globalThis.addEventListener === 'undefined') {
  (globalThis as any).addEventListener = () => {};
  (globalThis as any).removeEventListener = () => {};
}

// location.origin stub — amazon-connect-chatjs checks window.location.origin
if (typeof globalThis.location === 'undefined') {
  (globalThis as any).location = { origin: 'http://localhost', href: 'http://localhost/' };
}

// Minimal WebSocket stub — Amplify checks for its existence at module load time.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = class WebSocketStub {
    static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
    readyState = 3;
    constructor(_url: string, _protocols?: string | string[]) {}
    close() {}
    send(_data: any) {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  };
}
