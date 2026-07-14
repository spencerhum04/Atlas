import { useCallback, useEffect, useRef, useState } from 'react';
import Globe from './components/Globe';
import LocationCard from './components/LocationCard';
import GlobeControls from './components/GlobeControls';
import TimeWheelSelector from './components/TimeWheelSelector';
import TravelTo from './components/TravelTo';
import GlobeStarfield from './components/GlobeStarfield';
import LoadingOverlay from './components/LoadingOverlay';
import WorldExplorer from './components/WorldExplorer';
import HyperspaceCanvas, { DEFAULT_IDLE_VELOCITY } from './components/HyperspaceCanvas';
import type { HyperspaceHandle } from './components/HyperspaceCanvas';
import GuideSubtitle from './components/GuideSubtitle';
import FactsPanel from './components/FactsPanel';
import UserSpeakingIndicator from './components/UserSpeakingIndicator';
import LandingWarp from './components/landing/LandingWarp';
import { useAppStore } from './store';
import { useSelectionStore } from './selectionStore';
import { useVoiceConnection } from './hooks/useVoiceConnection';
import { musicService } from './audio/MusicService';
import { generateWorld } from './utils/worldGeneration';

type WarpState = 'idle' | 'initiating' | 'jumping';
const HYPERSPACE_SFX_URL = encodeURI('/sfx/BIG LONG WHOOSH SOUND EFFECT __ SOUND FX.mp3');
const HYPERSPACE_SFX_PLAY_MS = 9000;

function App() {
  const phase = useAppStore((s) => s.phase);
  const setPhase = useAppStore((s) => s.setPhase);
  const location = useAppStore((s) => s.location);
  const userProfile = useAppStore((s) => s.userProfile);
  const transitionComplete = useAppStore((s) => s.transitionComplete);
  const confirmRequested = useAppStore((s) => s.confirmExplorationRequested);
  const clearConfirm = useAppStore((s) => s.clearConfirmExploration);
  const worldDescription = useAppStore((s) => s.worldDescription);
  const exploreTrack = useAppStore((s) => s.exploreTrack);
  const setWorldStatus = useAppStore((s) => s.setWorldStatus);
  const setRenderableWorldData = useAppStore((s) => s.setRenderableWorldData);
  const setSelectedYear = useSelectionStore((s) => s.setSelectedYear);
  const selectedYear = useSelectionStore((s) => s.selectedYear);
  const selectedEra = useSelectionStore((s) => s.selectedEra);

  // --- EJ: Hyperspace warp state ---
  const hyperspaceRef = useRef<HyperspaceHandle>(null);
  const [warpState, setWarpState] = useState<WarpState>('idle');
  const rootRef = useRef<HTMLDivElement>(null);
  const hyperspaceSfxRef = useRef<HTMLAudioElement | null>(null);
  const hyperspaceSfxStopTimerRef = useRef<number | null>(null);
  const slowIdleVelocity = 1 + (DEFAULT_IDLE_VELOCITY - 1) * 0.5;
  const idleVelocity =
    (phase === 'globe' || phase === 'landing') && warpState === 'idle'
      ? slowIdleVelocity
      : DEFAULT_IDLE_VELOCITY;

  // --- Matt: Voice pipeline state ---
  const voice = useVoiceConnection();
  const voiceStartedRef = useRef(false);
  const sessionStartSentRef = useRef(false);
  const loadingGenerationStartedRef = useRef(false);
  const exploringVoiceStartedRef = useRef(false);
  const exploreStartSentRef = useRef(false);

  /* When the landing warp finishes:
     1. Set the chosen year in the selection store (updates era + meta)
     2. Switch phase to 'globe' — reveals the globe + UI controls */
  const handleLandingComplete = useCallback(
    (year: number) => {
      setSelectedYear(year);
      setPhase('globe');
    },
    [setSelectedYear, setPhase]
  );

  /* When the hyperspace jump finishes → transition to loading phase */
  const handleJumpComplete = useCallback(() => {
    setWarpState('idle');
    setPhase('loading');
  }, [setPhase]);

  const playHyperspaceSfx = useCallback(() => {
    const audio = hyperspaceSfxRef.current ?? new Audio(HYPERSPACE_SFX_URL);
    audio.preload = 'auto';
    hyperspaceSfxRef.current = audio;

    if (hyperspaceSfxStopTimerRef.current !== null) {
      window.clearTimeout(hyperspaceSfxStopTimerRef.current);
      hyperspaceSfxStopTimerRef.current = null;
    }

    audio.currentTime = 0;
    void audio.play().catch((err) => {
      console.warn('[SFX] hyperspace woosh failed to play:', err);
    });

    hyperspaceSfxStopTimerRef.current = window.setTimeout(() => {
      audio.pause();
      hyperspaceSfxStopTimerRef.current = null;
    }, HYPERSPACE_SFX_PLAY_MS);
  }, []);

  const handleEnterButtonPress = useCallback(() => {
    if (phase !== 'globe' || warpState !== 'idle') return;

    setWarpState('initiating');
    hyperspaceRef.current?.initiate();

    let released = false;
    const endPress = () => {
      if (released) return;
      released = true;
      playHyperspaceSfx();
      setWarpState('jumping');
      hyperspaceRef.current?.release();
    };

    window.addEventListener('pointerup', endPress, { once: true });
    window.addEventListener('pointercancel', endPress, { once: true });
  }, [phase, playHyperspaceSfx, warpState]);

  useEffect(() => {
    const audio = new Audio(HYPERSPACE_SFX_URL);
    audio.preload = 'auto';
    hyperspaceSfxRef.current = audio;
    return () => {
      if (hyperspaceSfxStopTimerRef.current !== null) {
        window.clearTimeout(hyperspaceSfxStopTimerRef.current);
        hyperspaceSfxStopTimerRef.current = null;
      }
      audio.pause();
      audio.currentTime = 0;
      if (hyperspaceSfxRef.current === audio) {
        hyperspaceSfxRef.current = null;
      }
    };
  }, []);

  // --- Voice lifecycle ---

  // Auto-connect voice when entering globe phase
  useEffect(() => {
    if (phase === 'globe' && !voiceStartedRef.current) {
      voiceStartedRef.current = true;
      voice.connect();
    }
  }, [phase, voice.connect]);

  // After voice connects, send session_start to trigger AI welcome
  useEffect(() => {
    if (
      voice.status === 'connected' &&
      phase === 'globe' &&
      !sessionStartSentRef.current
    ) {
      sessionStartSentRef.current = true;
      // Small delay to ensure STT stream is ready on backend
      const timer = setTimeout(() => {
        voice.sendSessionStart({
          label: selectedEra,
          year: selectedYear,
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [voice.status, phase, selectedEra, selectedYear, voice.sendSessionStart]);

  // Send context updates when location changes
  useEffect(() => {
    if (location && voice.status === 'connected') {
      voice.sendContext(location, {
        label: selectedEra,
        year: selectedYear,
      });
    }
  }, [location, voice.status, selectedEra, selectedYear, voice.sendContext]);

  // Handle confirm exploration request from EnterLocation button
  useEffect(() => {
    if (confirmRequested && voice.status === 'connected') {
      voice.sendConfirmExploration();
      clearConfirm();
      // Fade out ambient music — Deezer track will fade in from silence later
      musicService.stop(2000);
    }
  }, [confirmRequested, voice.status, voice.sendConfirmExploration, clearConfirm]);

  // Start ambient music when globe phase begins
  useEffect(() => {
    if (phase === 'globe') {
      musicService.play('/music/ambient-globe.mp3', { loop: true, fadeInMs: 3000 });
    }
  }, [phase]);

  // Music transitions between phases
  useEffect(() => {
    if (phase === 'exploring' && exploreTrack) {
      // Crossfade from loading track to explore track
      musicService.stop(1500);
      const timer = setTimeout(() => {
        musicService.play(exploreTrack, { loop: true, fadeInMs: 2000 });
      }, 1500);
      return () => clearTimeout(timer);
    } else if (phase !== 'globe' && phase !== 'loading' && phase !== 'exploring') {
      musicService.stop(2000);
    }
  }, [phase, exploreTrack]);

  // When backend signals transition is complete (goodbye TTS + all tool calls
  // done), disconnect voice so STT stops immediately. Phase change to 'loading'
  // is handled separately by handleJumpComplete when the hyperspace animation
  // finishes. The 1.5s buffer lets any remaining TTS audio drain.
  useEffect(() => {
    if (transitionComplete) {
      const timer = setTimeout(() => {
        voice.disconnect();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [transitionComplete, voice.disconnect]);

  // Reconnect voice when entering exploring phase (fresh 300s Gradium session)
  useEffect(() => {
    if (phase === 'exploring' && !exploringVoiceStartedRef.current) {
      exploringVoiceStartedRef.current = true;
      exploreStartSentRef.current = false;
      voice.connect();
    }
  }, [phase, voice.connect]);

  // After voice connects in exploring phase, send explore_start with Phase 1 context
  useEffect(() => {
    if (
      voice.status === 'connected' &&
      phase === 'exploring' &&
      !exploreStartSentRef.current
    ) {
      exploreStartSentRef.current = true;
      const timer = setTimeout(() => {
        voice.sendExploreStart({
          userProfile,
          worldDescription,
          location,
          timePeriod: {
            label: selectedEra,
            year: selectedYear,
          },
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [voice.status, phase, userProfile, worldDescription, location, selectedEra, selectedYear, voice.sendExploreStart]);

  // Trigger World Labs generation once loading phase begins and we have a
  // world_description from Gemini's summarize_session tool call.
  useEffect(() => {
    if (phase !== 'loading') {
      loadingGenerationStartedRef.current = false;
      return;
    }
    if (loadingGenerationStartedRef.current) return;
    if (!worldDescription) return; // wait for summarize_session to provide the prompt
    loadingGenerationStartedRef.current = true;

    const abortController = new AbortController();
    setWorldStatus('generating');
    console.log('[WORLD] loading phase entered, generating world from AI description...');

    void (async () => {
      try {
        const result = await generateWorld(worldDescription, abortController.signal);
        if (abortController.signal.aborted) return;
        console.log('[WORLD] generation complete, switching to exploring:', {
          worldId: result.worldId,
          displayName: result.displayName,
          defaultSpzUrl: result.assets.defaultSpzUrl,
          marbleUrl: result.assets.worldMarbleUrl,
          spzVariants: Object.keys(result.assets.spzUrls),
        });

        setRenderableWorldData(result.worldId, {
          spzUrls: result.assets.spzUrls,
          defaultSpzUrl: result.assets.defaultSpzUrl,
          colliderMeshUrl: result.assets.colliderMeshUrl,
          panoUrl: result.assets.panoUrl,
          thumbnailUrl: result.assets.thumbnailUrl,
          caption: result.assets.caption,
          worldMarbleUrl: result.assets.worldMarbleUrl,
        });
        setPhase('exploring');
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error('[WORLD] generation failed:', err);
        setWorldStatus('error');
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [phase, worldDescription, setPhase, setRenderableWorldData, setWorldStatus]);

  /* Determine if globe + UI should be visible */
  const showGlobe = phase === 'globe' || phase === 'landing';
  const showGlobeUI = phase === 'globe' && warpState === 'idle';
  const globeFading = warpState === 'jumping';
  const showIdleStarfield = phase === 'globe' && warpState === 'idle';
  const showGlobeStarfield = phase === 'globe';

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="relative w-full h-full bg-[#000008] overflow-hidden"
      style={{ outline: 'none' }}
    >
      {/* Hyperspace canvas — always behind everything, runs during globe + loading */}
      {(showGlobe || phase === 'loading') && (
        <div
          className="globe-bg absolute inset-0 z-0"
          style={{ opacity: showIdleStarfield ? 0 : 1, transition: 'opacity 200ms ease' }}
        >
          <HyperspaceCanvas
            ref={hyperspaceRef}
            onJumpComplete={handleJumpComplete}
            idleVelocity={idleVelocity}
          />
        </div>
      )}

      {showGlobeStarfield && <GlobeStarfield visible={showIdleStarfield} />}

      {/* Globe — visible during landing (preloading) and globe phase */}
      {showGlobe && (
        <div
          className={`relative z-[1] ${globeFading ? 'globe-fade-out' : ''}`}
        >
          <Globe />
        </div>
      )}

      {/* UI controls — only when globe is idle (not warping) */}
      {showGlobeUI && (
        <>
          <GlobeControls />
          <TimeWheelSelector onEnterPress={handleEnterButtonPress} />
          <TravelTo />
          <LocationCard />
          <GuideSubtitle />
          <UserSpeakingIndicator />
        </>
      )}

      {/* Landing overlay — sits on top (z-100), fades out to reveal globe */}
      {phase === 'landing' && (
        <LandingWarp onComplete={handleLandingComplete} />
      )}

      {/* Loading phase */}
      {phase === 'loading' && (
        <LoadingOverlay />
      )}

      {phase === 'exploring' && (
        <>
          <WorldExplorer />
          <GuideSubtitle />
          <FactsPanel />
          <UserSpeakingIndicator />
        </>
      )}
    </div>
  );
}

export default App;
