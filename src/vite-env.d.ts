/// <reference types="vite/client" />

// Allows TypeScript to accept side-effect CSS imports such as:
//   import 'maplibre-gl/dist/maplibre-gl.css'
//   import '@aws-amplify/ui-react/styles.css'
// Vite handles these at build time; TS only needs to know they are valid modules.
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
