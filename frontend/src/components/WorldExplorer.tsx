import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SparkControls, SparkRenderer, SplatLoader, SplatMesh } from '@sparkjsdev/spark';
import { useAppStore } from '../store';
import './WorldExplorer.css';

/**
 * Frame the camera so the entire splat mesh is visible.
 */
function frameCameraToMesh(camera: THREE.PerspectiveCamera, mesh: SplatMesh): void {
  const bounds = mesh.getBoundingBox(true);
  if (bounds.isEmpty()) return;

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z, 0.01) * 0.5;
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = (radius / Math.tan(fov / 2)) * 1.25;

  camera.position.set(center.x, center.y + radius * 0.12, center.z - distance);
  camera.near = Math.max(0.01, distance / 1000);
  camera.far = Math.max(1000, distance + radius * 30);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export default function WorldExplorer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const worldAssets = useAppStore((s) => s.worldAssets);
  const setCaptureWorldFrame = useAppStore((s) => s.setCaptureWorldFrame);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Build ordered splat URL candidates: prefer 500k for balanced quality/perf.
  const splatCandidates = useMemo(() => {
    if (!worldAssets) return [];
    const urls: string[] = [];
    const tryPush = (url: string | null | undefined) => {
      if (url && !urls.includes(url)) urls.push(url);
    };
    tryPush(worldAssets.spzUrls['500k']);
    tryPush(worldAssets.spzUrls['100k']);
    tryPush(worldAssets.defaultSpzUrl);
    tryPush(worldAssets.spzUrls.full_res);
    for (const url of Object.values(worldAssets.spzUrls)) {
      tryPush(url);
    }
    return urls;
  }, [worldAssets]);

  const panoUrl = worldAssets?.panoUrl ?? null;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || splatCandidates.length === 0) {
      setError('No renderable splat URL returned by backend.');
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);
    setProgress(0);

    let disposed = false;
    let worldMesh: SplatMesh | null = null;
    let panoTexture: THREE.Texture | null = null;

    // --- Canvas & Three.js renderer ---
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'width:100%;height:100%;display:block';
    mount.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Expose frame capture for visual queries (Gemini vision)
    setCaptureWorldFrame(() => {
      try {
        return canvas.toDataURL('image/jpeg', 0.6).split(',')[1] ?? null;
      } catch {
        return null;
      }
    });

    // --- Scene & camera ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010409);

    const camera = new THREE.PerspectiveCamera(65, 1, 0.01, 1000);
    camera.position.set(0, 1.5, 4);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    // --- SparkRenderer: created explicitly with all settings up front ---
    const spark = new SparkRenderer({
      renderer,
      maxStdDev: Math.sqrt(5),
      maxPixelRadius: 128,
      minAlpha: 0.5 * (1 / 255),
      clipXY: 1.4,
      falloff: 1.0,
      originDistance: 1.0,
      view: {
        sort32: true,
        sort360: true,
        stochastic: false,
      },
    });
    spark.frustumCulled = false;
    spark.renderOrder = 999;
    camera.add(spark);
    scene.add(camera);

    // --- Controls: orbit-only (no translation) ---
    const controls = new SparkControls({ canvas });
    controls.fpsMovement.enable = false;
    controls.pointerControls.slideSpeed = 0;
    controls.pointerControls.scrollSpeed = 0;
    controls.pointerControls.moveInertia = 0.15;

    // --- Resize handler ---
    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, true);
    };
    window.addEventListener('resize', resize);
    resize();

    // --- Load world assets ---
    const loadWorld = async () => {
      try {
        // Load panorama background (optional, non-blocking)
        if (panoUrl) {
          try {
            const tex = await new THREE.TextureLoader().loadAsync(panoUrl);
            if (disposed) return;
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.mapping = THREE.EquirectangularReflectionMapping;
            scene.background = tex;
            panoTexture = tex;
          } catch {
            // Panorama is optional
          }
        }

        // Try splat candidates in priority order
        let packedSplats: Awaited<ReturnType<SplatLoader['loadAsync']>> | null = null;
        let lastErr: unknown = null;
        const splatLoader = new SplatLoader();

        for (const url of splatCandidates) {
          if (disposed) return;
          try {
            packedSplats = await splatLoader.loadAsync(
              url,
              (event: { loaded?: number; total?: number }) => {
                if (disposed) return;
                const total = event.total ?? 0;
                if (total > 0) {
                  setProgress(Math.min(0.95, (event.loaded ?? 0) / total));
                }
              },
            );
            break;
          } catch (err) {
            lastErr = err;
          }
        }

        if (!packedSplats) {
          throw lastErr instanceof Error ? lastErr : new Error('All splat URLs failed to load');
        }
        if (disposed) return;

        // Create SplatMesh
        const mesh = new SplatMesh({ packedSplats, editable: false });
        mesh.quaternion.set(1, 0, 0, 0); // 180° X rotation: OpenCV → OpenGL coord flip
        mesh.frustumCulled = false;
        scene.add(mesh);
        worldMesh = mesh;

        await mesh.initialized;
        if (disposed) return;

        // Frame camera to view entire world
        frameCameraToMesh(camera, mesh);

        setProgress(1);
        setIsLoading(false);
      } catch (err) {
        if (disposed) return;
        setError(err instanceof Error ? err.message : 'Failed to load world');
        setIsLoading(false);
      }
    };

    void loadWorld();

    // --- Render loop: minimal, zero overhead ---
    let fpsFrames = 0;
    let fpsTime = performance.now();

    renderer.setAnimationLoop(() => {
      controls.update(camera);
      renderer.render(scene, camera);

      if (import.meta.env.DEV) {
        fpsFrames++;
        const now = performance.now();
        if (now - fpsTime >= 2000) {
          console.debug(`[WorldExplorer] ${(fpsFrames / ((now - fpsTime) / 1000)).toFixed(1)} fps`);
          fpsFrames = 0;
          fpsTime = now;
        }
      }
    });

    // --- Cleanup ---
    return () => {
      disposed = true;
      setCaptureWorldFrame(null);
      window.removeEventListener('resize', resize);
      renderer.setAnimationLoop(null);

      if (worldMesh) {
        scene.remove(worldMesh);
        worldMesh.dispose();
      }
      if (panoTexture) {
        panoTexture.dispose();
      }
      camera.remove(spark);

      renderer.dispose();
      renderer.forceContextLoss();
      if (mount.contains(canvas)) {
        mount.removeChild(canvas);
      }
    };
  }, [panoUrl, splatCandidates, setCaptureWorldFrame]);

  return (
    <div className="world-explorer">
      <div ref={mountRef} className="world-explorer__canvas" />

      {isLoading && (
        <div className="world-explorer__overlay">
          <div className="world-explorer__status">Rendering World</div>
          <div className="world-explorer__bar">
            <div
              className="world-explorer__bar-fill"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </div>
      )}

      {error && <div className="world-explorer__error">{error}</div>}
    </div>
  );
}
