import AppShell from './app/AppShell';
import { I18nProvider } from './lib/i18n';

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
