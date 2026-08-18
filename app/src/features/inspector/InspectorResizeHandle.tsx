import { useCallback, useEffect, useState } from 'react';

import { useT } from '../../lib/i18n';
import { useWorkspaceStore } from '../../store/workspaceStore';

const MIN = 320;
const MAX = 480;

export default function InspectorResizeHandle() {
  const width = useWorkspaceStore((state) => state.inspectorWidth);
  const setInspectorWidth = useWorkspaceStore((state) => state.setInspectorWidth);
  const t = useT();
  const [narrow, setNarrow] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1099px)').matches
  ));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const sync = () => setNarrow(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const nudge = useCallback((delta: number) => {
    setInspectorWidth(width + delta);
  }, [setInspectorWidth, width]);

  if (narrow) return null;

  return (
    <div
      className="inspector-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t('inspector.resize')}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = width;
        const move = (next: PointerEvent) => {
          setInspectorWidth(startWidth - (next.clientX - startX));
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 32 : 16;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          nudge(step);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nudge(-step);
        }
      }}
    />
  );
}
