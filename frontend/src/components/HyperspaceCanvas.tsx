/* ================================================================
   HyperspaceCanvas.tsx — Radial starfield + hyperspace warp

   Ported from the JumpToHyperspace CodePen animation into React.
   Stars radiate outward from screen center, growing as they travel.

   Three visual states:
     idle       — calm radial star drift (behind the globe)
     initiating — hold Enter: star tails freeze, lines stretch
     jumping    — release Enter: velocity spikes, blue warp tunnel

   Imperative API (via forwardRef):
     initiate() — begin the hold (star stretch)
     release()  — trigger the jump (blue warp), calls onJumpComplete when done
     reset()    — reinitialize all stars

   TweenMax replaced with a lightweight rAF-based tween system.
   ================================================================ */

import {
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Constants (from original animation)                                */
/* ------------------------------------------------------------------ */
const BASE_SIZE = 1;
export const DEFAULT_IDLE_VELOCITY = 1.01; // idle velocity multiplier
const VELOCITY_INIT_INC = 1.025;  // initiating velocity
const JUMP_VELOCITY_INC = 1.25;   // jump velocity
const JUMP_SIZE_INC = 1.15;       // jump size multiplier
const SIZE_INC = 1.01;            // idle size multiplier
const STAR_COUNT = 300;
const JUMP_DURATION_MS = 4000;    // hyperspace duration in ms

const WARP_COLORS: [number, number, number][] = [
  [197, 239, 247],
  [25, 181, 254],
  [77, 5, 232],
  [165, 55, 253],
  [255, 255, 255],
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
const randomInRange = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/* ------------------------------------------------------------------ */
/*  Star class                                                         */
/* ------------------------------------------------------------------ */
interface StarState {
  alpha: number;
  angle: number;
  active: boolean;
  x: number;
  y: number;
  vX: number;
  vY: number;
  size: number;
  iX: number | undefined;
  iY: number | undefined;
  iVX: number | undefined;
  iVY: number | undefined;
}

class Star {
  STATE: StarState;

  constructor() {
    this.STATE = {
      alpha: Math.random(),
      angle: randomInRange(0, 360) * (Math.PI / 180),
      active: false,
      x: 0, y: 0, vX: 0, vY: 0,
      size: BASE_SIZE,
      iX: undefined, iY: undefined, iVX: undefined, iVY: undefined,
    };
    this.reset();
  }

  reset() {
    const angle = randomInRange(0, 360) * (Math.PI / 180);
    const vX = Math.cos(angle);
    const vY = Math.sin(angle);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const travelled =
      Math.random() > 0.5
        ? Math.random() * Math.max(w, h) + Math.random() * (w * 0.24)
        : Math.random() * (w * 0.25);
    this.STATE = {
      ...this.STATE,
      iX: undefined, iY: undefined, iVX: undefined, iVY: undefined,
      active: travelled > 0,
      x: Math.floor(vX * travelled) + w / 2,
      vX,
      y: Math.floor(vY * travelled) + h / 2,
      vY,
      size: BASE_SIZE,
    };
  }
}

function generateStarPool(count: number): Star[] {
  return Array.from({ length: count }, () => new Star());
}

/* ------------------------------------------------------------------ */
/*  Tween system (replaces GreenSock TweenMax)                         */
/* ------------------------------------------------------------------ */
interface TweenTarget {
  velocity?: number;
  bgAlpha?: number;
  sizeInc?: number;
}

interface ActiveTween {
  startValues: Record<string, number>;
  endValues: Record<string, number>;
  duration: number;
  startTime: number;
}

/* ------------------------------------------------------------------ */
/*  Hyperspace state (mutable, not React state — driven by rAF)        */
/* ------------------------------------------------------------------ */
interface HyperspaceState {
  stars: Star[];
  bgAlpha: number;
  sizeInc: number;
  velocity: number;
  initiating: boolean;
  jumping: boolean;
  initiateTimestamp: number | undefined;
}

/* ------------------------------------------------------------------ */
/*  Public handle                                                      */
/* ------------------------------------------------------------------ */
export interface HyperspaceHandle {
  initiate: () => void;
  release: () => void;
  reset: () => void;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
interface HyperspaceCanvasProps {
  onJumpComplete?: () => void;
  idleVelocity?: number;
}

/* ================================================================== */
/*  Component                                                          */
/* ================================================================== */
const HyperspaceCanvas = forwardRef<HyperspaceHandle, HyperspaceCanvasProps>(
  function HyperspaceCanvas({ onJumpComplete, idleVelocity = DEFAULT_IDLE_VELOCITY }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);
    const stateRef = useRef<HyperspaceState>({
      stars: generateStarPool(STAR_COUNT),
      bgAlpha: 0,
      sizeInc: SIZE_INC,
      velocity: idleVelocity,
      initiating: false,
      jumping: false,
      initiateTimestamp: undefined,
    });
    const tweensRef = useRef<ActiveTween[]>([]);
    const idleVelocityRef = useRef(idleVelocity);
    const onJumpCompleteRef = useRef(onJumpComplete);
    onJumpCompleteRef.current = onJumpComplete;
    idleVelocityRef.current = idleVelocity;

    /* ----- Tween helper (replaces TweenMax.to) ----- */
    const tweenTo = useCallback((targets: TweenTarget, duration: number) => {
      const s = stateRef.current;
      const startValues: Record<string, number> = {};
      const endValues: Record<string, number> = {};
      for (const [key, val] of Object.entries(targets)) {
        if (val !== undefined) {
          startValues[key] = (s as unknown as Record<string, number>)[key];
          endValues[key] = val;
        }
      }
      tweensRef.current.push({
        startValues,
        endValues,
        duration: duration * 1000, // seconds → ms
        startTime: performance.now(),
      });
    }, []);

    /* ----- Process active tweens each frame ----- */
    const processTweens = useCallback((now: number) => {
      const s = stateRef.current;
      const alive: ActiveTween[] = [];
      for (const tw of tweensRef.current) {
        const elapsed = now - tw.startTime;
        const t = Math.min(elapsed / tw.duration, 1);
        for (const key of Object.keys(tw.endValues)) {
          const from = tw.startValues[key];
          const to = tw.endValues[key];
          (s as unknown as Record<string, number>)[key] = from + (to - from) * t;
        }
        if (t < 1) alive.push(tw);
      }
      tweensRef.current = alive;
    }, []);

    /* ----- Initiate (hold Enter) ----- */
    const initiate = useCallback(() => {
      const s = stateRef.current;
      console.log('[CANVAS] initiate() called, jumping =', s.jumping, 'initiating =', s.initiating);
      if (s.jumping || s.initiating) {
        console.log('[CANVAS] initiate() EARLY RETURN — already jumping or initiating');
        return;
      }
      s.initiating = true;
      s.initiateTimestamp = performance.now();
      tweenTo({ velocity: VELOCITY_INIT_INC, bgAlpha: 0.3 }, 0.25);
      // Freeze star tail origins so lines stretch
      const activeStars = s.stars.filter((st) => st.STATE.active);
      console.log('[CANVAS] initiate() — freezing', activeStars.length, 'active stars');
      for (const star of activeStars) {
        star.STATE.iX = star.STATE.x;
        star.STATE.iY = star.STATE.y;
        star.STATE.iVX = star.STATE.vX;
        star.STATE.iVY = star.STATE.vY;
      }
      console.log('[CANVAS] initiate() DONE — state.initiating =', s.initiating);
    }, [tweenTo]);

    /* ----- Jump (the blue hyperspace warp) ----- */
    const jump = useCallback(() => {
      const s = stateRef.current;
      console.log('[CANVAS] jump() called');
      s.bgAlpha = 0;
      s.jumping = true;
      tweenTo({ velocity: JUMP_VELOCITY_INC, bgAlpha: 0.75, sizeInc: JUMP_SIZE_INC }, 0.25);
      console.log('[CANVAS] jump() — tweening to warp, will end in', JUMP_DURATION_MS, 'ms');
      setTimeout(() => {
        console.log('[CANVAS] jump() — timeout fired, ending jump');
        s.jumping = false;
        tweenTo({ bgAlpha: 0, velocity: idleVelocityRef.current, sizeInc: SIZE_INC }, 0.25);
        // After the settle tween completes, signal jump is done
        setTimeout(() => {
          console.log('[CANVAS] jump() — calling onJumpComplete');
          onJumpCompleteRef.current?.();
        }, 300);
      }, JUMP_DURATION_MS);
    }, [tweenTo]);

    /* ----- Release (let go of Enter) ----- */
    const release = useCallback(() => {
      const s = stateRef.current;
      console.log('[CANVAS] release() called, jumping =', s.jumping, 'initiating =', s.initiating);
      if (s.jumping) {
        console.log('[CANVAS] release() EARLY RETURN — already jumping');
        return;
      }
      const wasInitiating = s.initiating;
      s.initiating = false;
      s.initiateTimestamp = undefined;
      console.log('[CANVAS] release() — wasInitiating =', wasInitiating);
      // Always trigger jump if we were in the initiating state
      if (wasInitiating) {
        console.log('[CANVAS] release() — triggering jump()');
        jump();
      } else {
        console.log('[CANVAS] release() — was NOT initiating, just tweening back to idle');
        tweenTo({ velocity: idleVelocityRef.current, bgAlpha: 0 }, 0.25);
      }
    }, [jump, tweenTo]);

    /* ----- Reset ----- */
    const resetStars = useCallback(() => {
      stateRef.current.stars = generateStarPool(STAR_COUNT);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    }, []);

    /* ----- Expose imperative API ----- */
    useImperativeHandle(ref, () => ({
      initiate,
      release,
      reset: resetStars,
    }), [initiate, release, resetStars]);

    /* ----- Canvas setup + render loop ----- */
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.lineCap = 'round';

      const render = () => {
        const s = stateRef.current;
        const w = canvas.width;
        const h = canvas.height;

        processTweens(performance.now());

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Blue warp background overlay
        if (s.bgAlpha > 0) {
          ctx.fillStyle = `rgba(31, 58, 157, ${s.bgAlpha})`;
          ctx.fillRect(0, 0, w, h);
        }

        // Activate a non-active star each frame (when not initiating)
        const nonActive = s.stars.filter((st) => !st.STATE.active);
        if (!s.initiating && nonActive.length > 0) {
          nonActive[0].STATE.active = true;
        }

        // Update + draw each active star
        for (const star of s.stars) {
          const st = star.STATE;
          if (!st.active) continue;

          const { x, y, iX, iY, iVX, iVY, size, vX, vY } = st;

          // Deactivate if off-screen (and not initiating)
          if (
            ((iX ?? x) < 0 || (iX ?? x) > w || (iY ?? y) < 0 || (iY ?? y) > h) &&
            !s.initiating
          ) {
            star.reset();
            continue;
          }

          const newIX = s.initiating ? iX : (iX !== undefined && iVX !== undefined ? iX + iVX : undefined);
          const newIY = s.initiating ? iY : (iY !== undefined && iVY !== undefined ? iY + iVY : undefined);
          const newX = x + vX;
          const newY = y + vY;

          // Check if tail has caught up to head
          const caught =
            (iX !== undefined || iY !== undefined) &&
            ((vX < 0 && (newIX ?? 0) < x) ||
             (vX > 0 && (newIX ?? 0) > x) ||
             (vY < 0 && (newIY ?? 0) < y) ||
             (vY > 0 && (newIY ?? 0) > y));

          st.iX = caught ? undefined : newIX;
          st.iY = caught ? undefined : newIY;
          st.iVX = caught ? undefined : (iVX !== undefined ? iVX * VELOCITY_INIT_INC : undefined);
          st.iVY = caught ? undefined : (iVY !== undefined ? iVY * VELOCITY_INIT_INC : undefined);
          st.x = newX;
          st.vX = st.vX * s.velocity;
          st.y = newY;
          st.vY = st.vY * s.velocity;
          st.size = s.initiating
            ? size
            : size * (iX !== undefined || iY !== undefined ? SIZE_INC : s.sizeInc);

          // Color: white normally, warp colors during jump
          let color: string;
          if (s.jumping) {
            const [r, g, b] = WARP_COLORS[randomInRange(0, WARP_COLORS.length - 1)];
            color = `rgba(${r}, ${g}, ${b}, ${st.alpha})`;
          } else {
            color = `rgba(255, 255, 255, ${st.alpha})`;
          }

          ctx.strokeStyle = color;
          ctx.lineWidth = st.size;
          ctx.beginPath();
          ctx.moveTo(st.iX ?? st.x, st.iY ?? st.y);
          ctx.lineTo(st.x, st.y);
          ctx.stroke();
        }

        rafRef.current = requestAnimationFrame(render);
      };

      rafRef.current = requestAnimationFrame(render);

      // Resize handler
      let resizeTimer = 0;
      const onResize = () => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(() => {
          canvas.width = window.innerWidth;
          canvas.height = window.innerHeight;
          ctx.lineCap = 'round';
          stateRef.current.stars = generateStarPool(STAR_COUNT);
        }, 250);
      };
      window.addEventListener('resize', onResize);

      return () => {
        cancelAnimationFrame(rafRef.current);
        window.removeEventListener('resize', onResize);
        clearTimeout(resizeTimer);
      };
    }, [processTweens]);

    useEffect(() => {
      const s = stateRef.current;
      if (!s.initiating && !s.jumping) {
        tweenTo({ velocity: idleVelocity }, 0.25);
      }
    }, [idleVelocity, tweenTo]);

    return (
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          display: 'block',
        }}
      />
    );
  }
);

export default HyperspaceCanvas;
