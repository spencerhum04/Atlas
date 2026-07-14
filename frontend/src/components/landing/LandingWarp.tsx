/* ================================================================
   LandingWarp.tsx — Cinematic year-entry landing experience

   Phase Machine (total ~1200ms):
     idle → collapse (350ms) → warp (650ms) → fade (200ms) → done

   Architecture:
     • tsParticles renders the starfield canvas (idle drift + twinkle)
     • rAF loop sets inline styles DIRECTLY on each animated DOM element
       (avoids CSS variable inheritance issues across browsers)
     • Particle positions are nudged toward center each frame during
       collapse/warp for genuine "star pull" effect
     • prefers-reduced-motion: skips collapse/warp, quick fade only
   ================================================================ */

import { memo, useRef, useState, useEffect, useCallback } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Container } from '@tsparticles/engine';
import { landingStarfieldOptions } from '../starfieldOptions';
import './LandingWarp.css';

/* Memoized starfield — prevents tsParticles from refreshing when
   LandingWarp re-renders (e.g. on every keypress). Defined outside
   the parent component so React never recreates it. */
const StableStarfield = memo(function StableStarfield({
  onLoaded,
}: {
  onLoaded: (container?: Container) => Promise<void>;
}) {
  return (
    <Particles
      id="lw-starfield"
      particlesLoaded={onLoaded}
      options={landingStarfieldOptions}
    />
  );
});

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const COLLAPSE_MS = 350;
const WARP_MS = 650;
const FADE_MS = 200;
const MAX_YEAR = 2026;
const MIN_YEAR = 1;

/* ------------------------------------------------------------------ */
/*  Easing helpers                                                     */
/* ------------------------------------------------------------------ */
const easeInQuad = (t: number) => t * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type WarpPhase = 'idle' | 'collapse' | 'warp' | 'fade' | 'done';

interface LandingWarpProps {
  onComplete: (year: number) => void;
  initialYear?: number;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
export default function LandingWarp({ onComplete, initialYear }: LandingWarpProps) {
  /* ----- React state ----- */
  const [engineReady, setEngineReady] = useState(false);
  const [yearInput, setYearInput] = useState(initialYear?.toString() ?? '');
  const [phase, setPhase] = useState<WarpPhase>('idle');
  const [shaking, setShaking] = useState(false);

  /* ----- DOM Refs for direct style manipulation (bypasses CSS var inheritance) ----- */
  const overlayRef = useRef<HTMLDivElement>(null);
  const starsRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const portalAreaRef = useRef<HTMLDivElement>(null);
  const portalGlowRef = useRef<HTMLDivElement>(null);

  /* ----- Other refs (no re-render) ----- */
  const containerRef = useRef<Container | null>(null);
  const phaseRef = useRef<WarpPhase>('idle');
  const phaseStartRef = useRef(0);
  const rafRef = useRef(0);
  const yearRef = useRef(0);
  const yearInputRef = useRef(yearInput);
  const initDone = useRef(false); // guard against React strict-mode double init

  // Keep ref in sync with state for keyboard handler
  useEffect(() => {
    yearInputRef.current = yearInput;
  }, [yearInput]);

  // Accessibility: detect prefers-reduced-motion
  const reducedMotion = useRef(
    typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  /* ----- Auto-focus overlay on mount so keyboard events work ----- */
  useEffect(() => {
    // Small delay so the DOM is fully painted
    const t = setTimeout(() => overlayRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  /* ----- Initialize tsParticles engine (once on mount) ----- */
  useEffect(() => {
    if (initDone.current) return; // strict-mode guard
    initDone.current = true;
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setEngineReady(true));
  }, []);

  /* ----- Particle container loaded callback ----- */
  const particlesLoaded = useCallback(async (container?: Container) => {
    containerRef.current = container ?? null;
  }, []);

  /* ----- Pull particles toward viewport center (rAF helper) ----- */
  const pullParticles = useCallback((strength: number) => {
    try {
      const c = containerRef.current;
      if (!c?.particles) return;
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const all = c.particles.filter(() => true);
      for (const p of all) {
        const dx = cx - p.position.x;
        const dy = cy - p.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        p.position.x += (dx / dist) * strength;
        p.position.y += (dy / dist) * strength;
      }
    } catch {
      /* Graceful fallback: CSS-only visuals still look great */
    }
  }, []);

  /* ----- Start warp sequence ----- */
  const startWarp = useCallback(() => {
    /* Accessibility: skip cinematic, just fade */
    if (reducedMotion.current) {
      phaseRef.current = 'fade';
      setPhase('fade');
      phaseStartRef.current = performance.now();
      const fadeOnly = (now: number) => {
        const t = Math.min((now - phaseStartRef.current) / 250, 1);
        if (overlayRef.current) overlayRef.current.style.opacity = String(1 - t);
        if (t >= 1) {
          phaseRef.current = 'done';
          setPhase('done');
          onComplete(yearRef.current);
          return;
        }
        rafRef.current = requestAnimationFrame(fadeOnly);
      };
      rafRef.current = requestAnimationFrame(fadeOnly);
      return;
    }

    phaseRef.current = 'collapse';
    phaseStartRef.current = performance.now();
    setPhase('collapse');

    /* -------- rAF animation loop --------
       Sets inline styles DIRECTLY on each DOM element per frame.
       This avoids CSS custom property inheritance and is the most
       reliable approach across all browsers.
       ------------------------------------ */
    const tick = (now: number) => {
      const elapsed = now - phaseStartRef.current;
      const stars = starsRef.current;
      const vig = vignetteRef.current;
      const glow = glowRef.current;
      const flash = flashRef.current;
      const pArea = portalAreaRef.current;
      const pGlow = portalGlowRef.current;
      const overlay = overlayRef.current;

      if (!stars || !overlay) return; // stop if unmounted

      const cp = phaseRef.current;

      if (cp === 'collapse') {
        const t = Math.min(elapsed / COLLAPSE_MS, 1);
        const e = easeInQuad(t);

        /* Stars canvas: scale-down → appear to converge to center */
        const scale = 1 - 0.12 * e; // 1 → 0.88
        const blur = 2.5 * e; // 0 → 2.5px
        stars.style.transform = `scale(${scale})`;
        stars.style.filter = `blur(${blur}px) brightness(1)`;

        if (vig) vig.style.opacity = String(0.35 * e);
        if (glow) glow.style.opacity = String(0.4 * e);
        if (flash) flash.style.opacity = '0';

        /* Portal: subtle scale-up + glow intensifies */
        if (pArea) {
          pArea.style.transform = `translate(-50%, -50%) scale(${1 + 0.06 * e})`;
          pArea.style.opacity = '1';
        }
        if (pGlow) pGlow.style.opacity = String(0.5 * e);

        pullParticles(1 + 4.5 * e);

        if (t >= 1) {
          phaseRef.current = 'warp';
          phaseStartRef.current = now;
          setPhase('warp');
        }
      } else if (cp === 'warp') {
        const t = Math.min(elapsed / WARP_MS, 1);
        const e = easeInOutCubic(t);

        /* Stars canvas: scale expands outward → "flying through" tunnel */
        const scale = 0.88 + 0.42 * e; // 0.88 → 1.30
        const blur = 2.5 + 5.5 * e; // 2.5 → 8px
        const brightness = 1 + 0.6 * e; // 1 → 1.6
        stars.style.transform = `scale(${scale})`;
        stars.style.filter = `blur(${blur}px) brightness(${brightness})`;

        if (vig) vig.style.opacity = String(0.35 + 0.45 * e);
        if (glow) glow.style.opacity = String(0.4 + 0.55 * e);

        /* White flash builds quadratically toward warp climax */
        if (flash) flash.style.opacity = String(0.35 * e * e);

        /* Portal: shrink + fade out */
        if (pArea) {
          pArea.style.transform = `translate(-50%, -50%) scale(${1.06 - 0.7 * e})`;
          pArea.style.opacity = String(Math.max(0, 1 - 1.6 * e));
        }
        if (pGlow) pGlow.style.opacity = String(0.5 + 0.5 * e);

        pullParticles(5.5 + 18 * e);

        if (t >= 1) {
          phaseRef.current = 'fade';
          phaseStartRef.current = now;
          setPhase('fade');
        }
      } else if (cp === 'fade') {
        const t = Math.min(elapsed / FADE_MS, 1);
        overlay.style.opacity = String(1 - t);

        if (t >= 1) {
          phaseRef.current = 'done';
          setPhase('done');
          onComplete(yearRef.current);
          return; // end rAF loop
        }
      } else {
        return; // idle or done — stop
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [onComplete, pullParticles]);

  /* ----- Keyboard input (global, since there's no <input> element) ----- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'idle') return;

      if (e.key === 'Escape') {
        setYearInput('');
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        setYearInput((prev) => prev.slice(0, -1));
        return;
      }

      if (e.key === 'Enter') {
        const raw = yearInputRef.current;
        if (!raw) {
          /* Empty input → micro-shake */
          setShaking(true);
          setTimeout(() => setShaking(false), 160);
          return;
        }
        const n = parseInt(raw, 10);
        if (isNaN(n)) return;
        const clamped = Math.max(MIN_YEAR, Math.min(MAX_YEAR, n));
        yearRef.current = clamped;
        setYearInput(String(clamped)); // show clamped value before warp
        startWarp();
        return;
      }

      /* Only digits, max 4 chars */
      if (/^[0-9]$/.test(e.key) && yearInputRef.current.length < 4) {
        setYearInput((prev) => prev + e.key);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startWarp]);

  /* ----- Cleanup rAF on unmount ----- */
  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  /* ----- Don't render after done (parent unmounts via phase change) ----- */
  if (phase === 'done') return null;

  /* ================================================================ */
  return (
    <div
      ref={overlayRef}
      className="lw-overlay"
      tabIndex={-1}
      onMouseDown={() => overlayRef.current?.focus()}
    >
      {/* ---- Starfield (tsParticles canvas) ---- */}
      <div ref={starsRef} className="lw-stars">
        {engineReady && <StableStarfield onLoaded={particlesLoaded} />}
      </div>

      {/* ---- Edge vignette (rAF-driven opacity) ---- */}
      <div ref={vignetteRef} className="lw-vignette" />

      {/* ---- Center glow (builds during collapse, peaks during warp) ---- */}
      <div ref={glowRef} className="lw-center-glow" />

      {/* ---- White flash (peaks at warp climax) ---- */}
      <div ref={flashRef} className="lw-flash" />

      {/* ---- Glassmorphic portal ---- */}
      <div
        ref={portalAreaRef}
        className={`lw-portal-area ${phase === 'idle' ? 'lw-breathing' : ''} ${shaking ? 'lw-shake' : ''}`}
      >
        <div ref={portalGlowRef} className="lw-portal-glow" />
        <div className="lw-portal">
          <div className="lw-portal__filter" />
          <div className="lw-portal__overlay" />
          <div className="lw-portal__specular" />
          <div className="lw-portal__content">
            {yearInput ? (
              <span key={yearInput} className="lw-year lw-year-pop">
                {yearInput}
                <span className="lw-caret" />
              </span>
            ) : (
              <span className="lw-placeholder">Choose year</span>
            )}
          </div>
        </div>
      </div>

      {/* ---- Subtle helper text ---- */}
      {phase === 'idle' && (
        <p className="lw-helper">Type a year and press Enter</p>
      )}
    </div>
  );
}
