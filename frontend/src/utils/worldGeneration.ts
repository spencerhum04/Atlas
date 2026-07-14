interface GenerateStartResponse {
  operation_id: string;
}

interface RenderableAssetsResponse {
  spz_urls: Record<string, string>;
  default_spz_url: string | null;
  collider_mesh_url: string | null;
  pano_url: string | null;
  thumbnail_url: string | null;
  caption: string | null;
  world_marble_url: string | null;
}

interface StatusResponse {
  done: boolean;
  status: 'generating' | 'ready' | 'error';
  operation_id: string;
  world_id?: string;
  display_name?: string;
  splat_url?: string | null;
  assets?: RenderableAssetsResponse;
  error?: string | null;
  debug?: {
    operation?: Record<string, unknown> | null;
    world?: Record<string, unknown> | null;
  } | null;
}

export interface RenderableWorldResult {
  operationId: string;
  worldId: string;
  displayName: string | null;
  assets: {
    spzUrls: Record<string, string>;
    defaultSpzUrl: string | null;
    colliderMeshUrl: string | null;
    panoUrl: string | null;
    thumbnailUrl: string | null;
    caption: string | null;
    worldMarbleUrl: string | null;
  };
}

function getBackendBaseUrl(): string {
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && String(envUrl).trim().length > 0) return String(envUrl).trim();

  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return 'http://localhost:8000';
  }

  return '';
}

async function postGenerate(
  sceneDescription: string,
  signal?: AbortSignal,
): Promise<GenerateStartResponse> {
  const baseUrl = getBackendBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/worlds/generate`
    : '/api/worlds/generate';

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scene_description: sceneDescription }),
    signal,
  });
  if (!res.ok) {
    throw new Error(`world generation start failed: ${res.status}`);
  }
  return (await res.json()) as GenerateStartResponse;
}

async function getStatus(operationId: string, signal?: AbortSignal): Promise<StatusResponse> {
  const baseUrl = getBackendBaseUrl();
  const qs = import.meta.env.DEV ? '?debug=1' : '';
  const url = baseUrl
    ? `${baseUrl}/api/worlds/status/${operationId}${qs}`
    : `/api/worlds/status/${operationId}${qs}`;

  const res = await fetch(url, { method: 'GET', signal });
  if (!res.ok) {
    throw new Error(`world status poll failed: ${res.status}`);
  }
  return (await res.json()) as StatusResponse;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onDone = () => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = window.setTimeout(onDone, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Start World Labs generation using Gemini's world_description from
 * summarize_session, then poll until the 3D assets are ready.
 */
export async function generateWorld(
  sceneDescription: string,
  signal?: AbortSignal,
): Promise<RenderableWorldResult> {
  const start = await postGenerate(sceneDescription, signal);
  console.log('[WORLD] generation started:', start.operation_id);
  let attempts = 0;

  while (true) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    attempts += 1;
    const status = await getStatus(start.operation_id, signal);
    console.log(`[WORLD] poll #${attempts}:`, {
      operationId: status.operation_id,
      done: status.done,
      status: status.status,
      worldId: status.world_id ?? null,
      splatUrl: status.splat_url ?? null,
    });

    if (status.done && status.status === 'ready' && status.world_id && status.assets) {
      console.log('[WORLD] ready payload:', status);
      if (status.assets.world_marble_url) {
        console.log('[WORLD] world_marble_url:', status.assets.world_marble_url);
      }
      if (status.debug?.world) {
        console.log('[WORLD] raw world data from backend:', status.debug.world);
      }
      return {
        operationId: status.operation_id,
        worldId: status.world_id,
        displayName: status.display_name ?? null,
        assets: {
          spzUrls: status.assets.spz_urls ?? {},
          defaultSpzUrl: status.assets.default_spz_url ?? status.splat_url ?? null,
          colliderMeshUrl: status.assets.collider_mesh_url ?? null,
          panoUrl: status.assets.pano_url ?? null,
          thumbnailUrl: status.assets.thumbnail_url ?? null,
          caption: status.assets.caption ?? null,
          worldMarbleUrl: status.assets.world_marble_url ?? null,
        },
      };
    }

    if (status.done && status.status === 'error') {
      console.error('[WORLD] generation failed payload:', status);
      throw new Error(status.error || 'World generation failed');
    }

    await sleep(5000, signal);
  }
}
