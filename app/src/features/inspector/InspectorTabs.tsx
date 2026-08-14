import { useT } from '../../lib/i18n';
import type { InspectorTab } from './taskDraft';

const TABS: InspectorTab[] = ['overview', 'prompt_inputs', 'execution', 'outputs', 'run_details'];

export default function InspectorTabs({
  current,
  onChange,
}: {
  current: InspectorTab;
  onChange: (tab: InspectorTab) => void;
}) {
  const t = useT();
  return (
    <div className="inspector-tabs" role="tablist" aria-label={t('inspector.tabs')}>
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={current === tab}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
            event.preventDefault();
            const index = TABS.indexOf(tab);
            const next = event.key === 'ArrowRight'
              ? TABS[(index + 1) % TABS.length]
              : TABS[(index - 1 + TABS.length) % TABS.length];
            onChange(next);
          }}
        >
          {t(`inspector.tab.${tab}`)}
        </button>
      ))}
    </div>
  );
}
