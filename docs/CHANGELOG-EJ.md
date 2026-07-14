# Changelog — Frontend (EJ)

All frontend changes by EJ. See `CHANGELOG.md` for backend changes (Matt).

---

## [Session 8] - 2026-02-07 16:45

### Changed
- **Glassmorphic beacon marker replacing solid cylinder** — Removed the opaque polygon cylinder (`pointsData`) and built a custom Three.js beacon via `objectsData` + `objectThreeObject`. The beacon is a hollow open-ended tube with a custom GLSL shader: quadratic height-based alpha fade (solid at base, transparent at top), fresnel edge brightening for glass refraction illusion, additive blending for natural glow, double-sided rendering so the hollow center is visible. Includes a soft base glow disc (RingGeometry with additive blend) and a faint inner core glow line. Slight top-to-bottom taper for visual interest.
  - `frontend/src/components/Globe.tsx`
- **Enhanced ring ripples** — Replaced single ring with triple-layer concentric ripples at different speeds and radii (3.5/5.5/8 maxR, staggered repeat periods) for a richer pulsing effect around the beacon base
  - `frontend/src/components/Globe.tsx`

### Notes
- Used `objectsData` API (positions + orients automatically at lat/lng) instead of `customLayerData` (manual positioning) — much cleaner
- Three.js r182 confirmed available via react-globe.gl dependency
- Beacon mesh is cached and cloned per data-join for performance
- GLSL shaders defined as module-level constants to avoid re-creation

---

## [Session 7] - 2026-02-07 16:00

### Added
- **"Travel to..." pill with forward geocoding** — Dark glassmorphic pill sits above the location card. Click to enter a place name, press Enter to geocode via Nominatim, which moves the globe marker + camera and updates the location card. Escape or blur closes without action.
  - `frontend/src/components/TravelTo.tsx`
  - `frontend/src/utils/geocode.ts`
  - `frontend/src/App.tsx`

### Changed
- **LocationCard — dark glassmorphic styling, blue coordinates, pill shape** — Switched from light glass to dark glass (`rgba(0,0,0,0.45)` + blur), changed coordinate color from cyan to `#7db8ff`, bold Plus Jakarta Sans, rounded-full pill, increased padding
  - `frontend/src/components/LocationCard.tsx`
- **GlobeControls — dark glassmorphic buttons** — Matched Color/Labels buttons to the same dark glass style as the time-wheel pills
  - `frontend/src/components/GlobeControls.tsx`
- **Globe pin + ring color** — Changed from cyan `#00d4ff` to matching blue `#7db8ff`
  - `frontend/src/components/Globe.tsx`
- **Starfield particle tuning** — Reduced speed/size back to calm baseline, added rare shooting star streaks (3 particles, speed 3–8, long delay between spawns)
  - `frontend/src/components/Starfield.tsx`
  - `frontend/src/components/landing/LandingWarp.tsx`
- **Color mode brightness** — Reduced from 0.8 to 0.7 for a slightly dimmer, less washed-out globe
  - `frontend/src/index.css`

---

## [Session 6] - 2026-02-07 15:15

### Added
- **Animated starfield behind the globe** — Replaced the static dark radial gradient with a live tsParticles starfield matching the landing page aesthetic. The globe canvas is transparent so stars drift gently behind it, creating a cohesive "globe floating in space" look.
  - `frontend/src/components/Starfield.tsx` (new reusable component)
  - `frontend/src/index.css` (added `.starfield-bg` styles)
  - `frontend/src/App.tsx` (integrated Starfield inside `.globe-bg`)

### Notes
- Engine initialization is module-level guarded — safe even if both LandingWarp and Starfield mount (no double-init)
- Globe starfield uses slightly fewer particles (300 vs 380) and slower speed (0.5 vs 1.2) than the landing page for a calmer ambient feel that doesn't compete with the globe itself
- `pointer-events: none` on the starfield layer ensures it never interferes with globe interaction

---

## [Session 5] - 2026-02-07 15:00

### Changed
- **Globe auto-rotate speed increased** — Idle drift was too slow at 0.4; bumped to 0.8 for a more dynamic feel when not actively orbiting
  - `frontend/src/components/Globe.tsx`
- **Default tile mode changed to color** — Globe now opens in Voyager color mode instead of dark grayscale after the landing warp, making the first impression more vibrant
  - `frontend/src/store.ts`

---

## [Session 4] - 2026-02-07 14:30

### Fixed
- **Particles too slow/static** — Increased idle move speed from 0.3 to 1.2 and twinkle animation speed from 0.5 to 0.8 so the starfield feels alive instead of frozen
  - `frontend/src/components/landing/LandingWarp.tsx`
- **Keyboard input not registering** — Three root causes fixed: (1) tsParticles canvas was stealing pointer/keyboard focus, now has `pointer-events: none`; (2) overlay div now has `tabIndex={-1}` with auto-focus on mount and re-focus on click; (3) tsParticles interactivity events explicitly disabled in options
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`
- **Warp animation not working / not transitioning to globe** — CSS custom property inheritance was unreliable across browsers. Switched from setting `--warp-*` variables on the parent to direct inline `style.transform` / `style.filter` / `style.opacity` on individual DOM refs (`starsRef`, `vignetteRef`, `glowRef`, `flashRef`, `portalAreaRef`). Also added strict-mode guard on `initParticlesEngine` to prevent double initialization.
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`

### Notes
- Direct DOM manipulation (refs + inline styles) in the rAF loop is more reliable than CSS variable inheritance for cross-element animation
- `pointer-events: none` on the entire `.lw-stars` layer plus explicit `interactivity: { events: { onHover/onClick: false } }` ensures tsParticles never intercepts user input

---

## [Session 3] - 2026-02-07 14:00

### Added
- **Cinematic landing experience (LandingWarp)** — Implements the "hyperspace year entry" landing page: tsParticles starfield, glassmorphic portal, keyboard year input, and a Star Wars–style warp-to-globe transition. Phase machine (idle → collapse → warp → fade → done) runs in ~1.2s via rAF-driven CSS custom properties for GPU-accelerated blur/scale/brightness. Particles are nudged toward center each frame for genuine "star rush" effect. Supports prefers-reduced-motion (skip to fade). Micro-shake on empty Enter, caret blink, digit pop animation.
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`
- **tsParticles dependencies** — `@tsparticles/react` and `@tsparticles/slim` for canvas-based starfield rendering
  - `frontend/package.json`

### Changed
- **App.tsx — Landing overlay integration** — Globe now renders underneath the landing overlay (pre-loading tiles in background). On warp completion, the chosen year is set in the selection store and phase transitions to 'globe', revealing the globe with UI controls. Clean handoff via `onComplete(year)` callback.
  - `frontend/src/App.tsx`
- **store.ts — Default phase changed to 'landing'** — App now starts with the cinematic landing experience instead of jumping directly to the globe
  - `frontend/src/store.ts`

### Notes
- Used CSS custom properties driven by rAF (not React state) for all warp animations to avoid re-renders and maintain 60fps
- Particle position manipulation via `container.particles.filter(() => true)` since the internal array is private in tsParticles v3
- Globe loads in background during landing phase so tiles are pre-cached when the warp fade reveals it
- Year input clamped to [1, 2026] silently per spec; selection store handles era/meta derivation
