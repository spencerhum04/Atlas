import { memo, useEffect, useRef, useState } from 'react';
import Particles, { initParticlesEngine } from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import { landingStarfieldOptions } from './starfieldOptions';
import './GlobeStarfield.css';

interface GlobeStarfieldProps {
  visible?: boolean;
}

export default memo(function GlobeStarfield({ visible = true }: GlobeStarfieldProps) {
  const [engineReady, setEngineReady] = useState(false);
  const initDone = useRef(false);

  useEffect(() => {
    if (initDone.current) return;
    initDone.current = true;
    initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    }).then(() => setEngineReady(true));
  }, []);

  if (!engineReady) return null;

  return (
    <div className={`globe-starfield ${visible ? 'is-visible' : 'is-hidden'}`}>
      <Particles id="globe-starfield" options={landingStarfieldOptions} />
    </div>
  );
});
