/**
 * Globe type declarations.
 *
 * react-globe.gl exports its own `GlobeMethods` interface which covers
 * all imperative methods (pointOfView, controls, scene, camera, renderer, etc).
 * We re-export it here as `GlobeInstance` for readability across the codebase,
 * and to keep a single import path if we ever need to extend it.
 */
export type { GlobeMethods as GlobeInstance } from 'react-globe.gl';
