import { useT } from '../../lib/i18n';

export default function RecoveryPanel({
  actions,
}: {
  actions: string[];
}) {
  const t = useT();
  return (
    <section>
      <h2>{t('settings.section.support')}</h2>
      {actions.map((action) => (
        <p key={action}>{action}</p>
      ))}
    </section>
  );
}
