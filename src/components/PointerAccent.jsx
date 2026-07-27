import { useEffect, useState } from 'react';

// Decorative only: the operating-system cursor remains available at all times.
export default function PointerAccent() {
  const [pointer, setPointer] = useState(null);

  useEffect(() => {
    const finePointer = window.matchMedia('(pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateAvailability = () => {
      if (!finePointer.matches || reducedMotion.matches) setPointer(null);
    };
    const move = event => {
      if (finePointer.matches && !reducedMotion.matches) setPointer({ x: event.clientX, y: event.clientY });
    };
    window.addEventListener('pointermove', move, { passive: true });
    finePointer.addEventListener('change', updateAvailability);
    reducedMotion.addEventListener('change', updateAvailability);
    return () => {
      window.removeEventListener('pointermove', move);
      finePointer.removeEventListener('change', updateAvailability);
      reducedMotion.removeEventListener('change', updateAvailability);
    };
  }, []);

  if (!pointer) return null;
  return <span aria-hidden="true" className="pointer-accent" style={{ transform: `translate3d(${pointer.x}px, ${pointer.y}px, 0)` }}><span /></span>;
}
