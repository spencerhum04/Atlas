import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import GlobeGL from 'react-globe.gl';
import type { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { useAppStore } from '../store';
import { reverseGeocode } from '../utils/reverseGeocode';

/* ------------------------------------------------------------------ */
/*  Tile engine                                                        */
/* ------------------------------------------------------------------ */
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];

function buildVoyagerUrl(x: number, y: number, l: number, labels: boolean): string {
  const subdomain = CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length];
  const style = labels ? 'rastertiles/voyager_labels_under' : 'rastertiles/voyager_nolabels';
  return `https://${subdomain}.basemaps.cartocdn.com/${style}/${l}/${x}/${y}.png`;
}

/* ------------------------------------------------------------------ */
/*  Ring color                                                         */
/* ------------------------------------------------------------------ */
const ringColorInterpolator = (t: number) =>
  `rgba(125, 184, 255, ${Math.sqrt(1 - t) * 0.7})`;

/* ------------------------------------------------------------------ */
/*  Beacon builder                                                     */
/* ------------------------------------------------------------------ */

/**
 * Creates a glassmorphic beacon: a hollow tube with a fresnel-edge
 * glass effect that's solid/bright at the base and fades to
 * transparent at the top — like a flashlight beam into space.
 *
 * Uses a custom GLSL ShaderMaterial:
 *   • Height-based alpha: quadratic falloff (solid base → transparent tip)
 *   • Fresnel term: edges catch light like real glass
 *   • Additive blending: glows naturally against dark backgrounds
 *   • Double-sided: inner wall visible (hollow center)
 *
 * Plus a soft glow disc at the base for "ground contact" light.
 */
const BEACON_HEIGHT = 12; // scene units (globe radius ≈ 100)
const BEACON_RADIUS = 0.45;
const HALF_H = BEACON_HEIGHT / 2;

const beaconVertexShader = /* glsl */ `
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Normalized height: 0 at base, 1 at tip
    vHeight = (position.y + ${HALF_H.toFixed(4)}) / ${BEACON_HEIGHT.toFixed(4)};
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const beaconFragmentShader = /* glsl */ `
  varying float vHeight;
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // #7db8ff = rgb(125, 184, 255) = vec3(0.49, 0.72, 1.0)
    vec3 baseColor = vec3(0.49, 0.72, 1.0);

    // Quadratic fade: solid at base, vanishing at top
    float heightAlpha = 1.0 - vHeight * vHeight;

    // Fresnel: edges glow brighter (glass refraction illusion)
    float fresnel = pow(1.0 - abs(dot(vNormal, vViewDir)), 2.0);

    // Combine: visible translucency with fresnel boost at edges
    float alpha = heightAlpha * (0.25 + 0.35 * fresnel);

    // Slightly whiter at edges for specular-like highlight
    vec3 finalColor = baseColor + vec3(0.3) * fresnel;

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

function createBeaconObject(): THREE.Object3D {
  const group = new THREE.Group();

  /* objectFacesSurfaces aligns local +Z with the outward surface normal.
     Our cylinder extends along Y, so rotate -90° around X to map Y → Z. */
  group.rotation.x = Math.PI / 2;

  /* --- Glass tube (hollow, open-ended) --- */
  const tubeGeo = new THREE.CylinderGeometry(
    BEACON_RADIUS * 0.7,  // top radius (slight taper)
    BEACON_RADIUS,         // bottom radius
    BEACON_HEIGHT,
    48,                    // radial segments (smooth circle)
    20,                    // height segments (smooth gradient)
    true                   // open-ended → hollow center
  );

  const tubeMat = new THREE.ShaderMaterial({
    vertexShader: beaconVertexShader,
    fragmentShader: beaconFragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending, // NormalBlending so it's visible on light maps
  });

  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.position.y = HALF_H; // base sits at group origin (surface)
  group.add(tube);

  /* --- Base glow disc (soft light pool on the ground) --- */
  const glowGeo = new THREE.RingGeometry(BEACON_RADIUS * 0.1, BEACON_RADIUS * 2, 48);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#7db8ff'),
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.x = -Math.PI / 2; // lay flat (relative to group, which is already rotated)
  glow.position.y = 0.1;
  group.add(glow);

  /* --- Inner core glow (faint bright line inside the tube) --- */
  const coreGeo = new THREE.CylinderGeometry(
    BEACON_RADIUS * 0.06, // very thin
    BEACON_RADIUS * 0.12,
    BEACON_HEIGHT * 0.5,  // shorter than outer tube
    16, 8, true
  );
  const coreMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#b8d8ff'),
    transparent: true,
    opacity: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = BEACON_HEIGHT * 0.25;
  group.add(core);

  return group;
}

// Singleton instance — reused across renders (objectsData recreates per data-join)
let cachedBeacon: THREE.Object3D | null = null;
function getBeaconObject(): THREE.Object3D {
  if (!cachedBeacon) cachedBeacon = createBeaconObject();
  return cachedBeacon.clone();
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function Globe() {
  const globeRef = useRef<GlobeMethods | undefined>(undefined);
  const location = useAppStore((s) => s.location);
  const setLocation = useAppStore((s) => s.setLocation);
  const tileMode = useAppStore((s) => s.tileMode);
  const showLabels = useAppStore((s) => s.showLabels);

  /* --- Tile engine --- */
  const showLabelsRef = useRef(showLabels);
  const tileUrlFn = useCallback((x: number, y: number, l: number) => {
    return buildVoyagerUrl(x, y, l, showLabelsRef.current);
  }, []);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    const globe = globeRef.current;
    if (globe) globe.globeTileEngineClearCache();
  }, [showLabels]);

  /* --- Dimensions --- */
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const autoRotateDisabled = useRef(false);

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* --- Auto-rotate on mount --- */
  const handleGlobeReady = useCallback(() => {
    const globe = globeRef.current;
    if (!globe) return;
    setTimeout(() => {
      try {
        const controls = globe.controls();
        if (!autoRotateDisabled.current) {
          controls.autoRotate = true;
          controls.autoRotateSpeed = 0.8;
          const stop = () => {
            if (!autoRotateDisabled.current) {
              autoRotateDisabled.current = true;
              controls.autoRotate = false;
              controls.removeEventListener('start', stop);
            }
          };
          controls.addEventListener('start', stop);
        }
      } catch { /* controls not ready */ }
    }, 300);
  }, []);

  /* --- Fly-to on location change --- */
  useEffect(() => {
    if (!location || !globeRef.current) return;
    if (!autoRotateDisabled.current) {
      try { globeRef.current.controls().autoRotate = false; autoRotateDisabled.current = true; } catch {}
    }
    globeRef.current.pointOfView({ lat: location.lat, lng: location.lng, altitude: 1.5 }, 1500);
  }, [location]);

  /* --- Globe click → set location --- */
  const handleGlobeClick = useCallback(
    async ({ lat, lng }: { lat: number; lng: number }) => {
      setLocation({ lat, lng, name: `${lat.toFixed(2)}, ${lng.toFixed(2)}` });
      const name = await reverseGeocode(lat, lng);
      setLocation({ lat, lng, name });
    },
    [setLocation],
  );

  /* --- Beacon data (objectsData) --- */
  const objectsData = useMemo(
    () => (location ? [{ lat: location.lat, lng: location.lng }] : []),
    [location]
  );

  const objectThreeObject = useCallback(() => getBeaconObject(), []);

  /* --- Enhanced rings: multiple concentric ripples --- */
  const ringsData = useMemo(
    () =>
      location
        ? [
            { lat: location.lat, lng: location.lng, maxR: 3.5, propagationSpeed: 2.5, repeatPeriod: 900 },
            { lat: location.lat, lng: location.lng, maxR: 5.5, propagationSpeed: 1.8, repeatPeriod: 1400 },
            { lat: location.lat, lng: location.lng, maxR: 8, propagationSpeed: 1.2, repeatPeriod: 2200 },
          ]
        : [],
    [location]
  );

  /* --- WebGL cleanup --- */
  useEffect(() => {
    return () => {
      try { const r = globeRef.current?.renderer(); if (r) { r.dispose(); r.forceContextLoss(); } } catch {}
    };
  }, []);

  const filterClass = tileMode === 'dark' ? 'globe-filter-dark' : 'globe-filter-color';

  return (
    <div className={`globe-wrapper ${filterClass}`}>
      <GlobeGL
        ref={globeRef as React.MutableRefObject<GlobeMethods | undefined>}
        width={dimensions.width}
        height={dimensions.height}
        globeTileEngineUrl={tileUrlFn}
        backgroundColor="rgba(0, 0, 0, 0)"
        showAtmosphere={true}
        atmosphereColor="#6db3f8"
        atmosphereAltitude={0.25}
        animateIn={true}
        onGlobeReady={handleGlobeReady}
        onGlobeClick={handleGlobeClick}

        // Glassmorphic beacon via objectsData
        objectsData={objectsData}
        objectLat="lat"
        objectLng="lng"
        objectAltitude={0.01}
        objectThreeObject={objectThreeObject}

        // Enhanced rings: triple-layer concentric ripples
        ringsData={ringsData}
        ringColor={() => ringColorInterpolator}
        ringMaxRadius="maxR"
        ringPropagationSpeed="propagationSpeed"
        ringRepeatPeriod="repeatPeriod"
      />
    </div>
  );
}
