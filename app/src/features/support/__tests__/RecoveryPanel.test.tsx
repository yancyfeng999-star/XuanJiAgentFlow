import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../lib/i18n';
import RecoveryPanel from '../RecoveryPanel';

describe('RecoveryPanel', () => {
  it('only lists backend-provided actions', () => {
    render(
      <I18nProvider>
        <RecoveryPanel actions={['open_diagnostics', 'reset_ui_state']} />
      </I18nProvider>,
    );
    expect(screen.getByText('open_diagnostics')).toBeInTheDocument();
    expect(screen.queryByText('delete_database')).not.toBeInTheDocument();
  });
});
