import AppShell from './app/AppShell';
import I18nProvider from './lib/I18nProvider';

export default function App() {
  return (
    <I18nProvider>
      <AppShell />
    </I18nProvider>
  );
}
