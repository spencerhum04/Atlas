import type { ISourceOptions } from '@tsparticles/engine';

export const landingStarfieldOptions: ISourceOptions = {
  fullScreen: false,
  fpsLimit: 120,
  detectRetina: true,
  background: { color: { value: 'transparent' } },
  /* Disable all tsParticles interactivity so it can't steal focus/events */
  interactivity: {
    events: {
      onHover: { enable: false },
      onClick: { enable: false },
    },
  },
  particles: {
    /* Mix of pure white + faint blue-tinted stars for depth */
    color: { value: ['#ffffff', '#e8eaff', '#cdd4ff', '#ffffff', '#ffffff'] },
    number: { value: 380 },
    opacity: {
      value: { min: 0.1, max: 0.9 },
      animation: { enable: true, speed: 0.6, sync: false },
    },
    size: { value: { min: 0.3, max: 2.2 } },
    move: {
      enable: true,
      speed: { min: 0.2, max: 0.6 },
      direction: 'none',
      random: true,
      straight: false,
      outModes: { default: 'out' },
    },
    links: { enable: false },
    shape: { type: 'circle' },
  },
};
