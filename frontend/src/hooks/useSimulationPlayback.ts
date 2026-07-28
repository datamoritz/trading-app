import { useEffect } from 'react';
import { useSimulationStore } from '@/stores/simulationStore';

export function useSimulationPlayback(active: boolean): void {
  const phase = useSimulationStore((state) => state.phase);

  useEffect(() => {
    if (!active || phase !== 'playing') return;

    let animationFrame = 0;
    let lastTime = performance.now();

    const advance = (now: number) => {
      const elapsed = Math.min(250, Math.max(0, now - lastTime));
      lastTime = now;
      useSimulationStore.getState().advance(elapsed);
      if (useSimulationStore.getState().phase === 'playing') {
        animationFrame = requestAnimationFrame(advance);
      }
    };

    animationFrame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(animationFrame);
  }, [active, phase]);

  useEffect(() => {
    if (!active) return;
    const pauseWhenHidden = () => {
      if (document.hidden) useSimulationStore.getState().pause();
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, [active]);
}
