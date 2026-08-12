import { useRef, useState } from 'react';
import GlassConfirmDialog from '@/components/GlassConfirmDialog';

export default function useGlassConfirm() {
  const resolver = useRef(null);
  const [options, setOptions] = useState(null);
  const confirm = nextOptions => new Promise(resolve => {
    resolver.current = resolve;
    setOptions(typeof nextOptions === 'string' ? { description: nextOptions } : nextOptions);
  });
  const finish = value => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };
  const confirmDialog = (
    <GlassConfirmDialog
      open={Boolean(options)}
      onOpenChange={open => !open && finish(false)}
      onConfirm={() => finish(true)}
      title={options?.title}
      description={options?.description}
      confirmLabel={options?.confirmLabel}
    />
  );
  return { confirm, confirmDialog };
}
