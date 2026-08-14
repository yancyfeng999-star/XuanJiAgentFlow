import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../../lib/i18n';
import { createUpdateService, setUpdateServiceForTests } from '../../../lib/updater';
import UpdateSettings from '../UpdateSettings';

afterEach(cleanup);

describe('UpdateSettings', () => {
  it('keeps check and download as separate actions', async () => {
    setUpdateServiceForTests(createUpdateService({
      available: true,
      async check() {
        return { version: '0.3.5' };
      },
      async download() {},
      async install() {},
    }));
    render(<I18nProvider><UpdateSettings /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: '检查更新' }));
    expect(await screen.findByText('available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '下载更新' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: '安装并重启' })).toBeDisabled();
  });
});
