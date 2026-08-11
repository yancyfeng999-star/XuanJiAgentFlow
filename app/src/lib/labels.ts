import { hasMessage, translate, useI18n } from './i18n';

export interface LabelFormatters {
  statusLabel: (value: string | null | undefined) => string;
  agentTypeLabel: (value: string | null | undefined) => string;
  schedulingModeLabel: (value: string | null | undefined) => string;
  mediaTypeLabel: (value: string | null | undefined) => string;
  capabilityLabel: (value: string) => string;
}

export function useLabels(): LabelFormatters {
  const { locale } = useI18n();
  const t = (key: string) => translate(locale, key);
  const has = (key: string) => hasMessage(locale, key);
  return {
    statusLabel: (value) => {
      if (!value) return t('status.unknown');
      const key = `status.${value}`;
      return has(key) ? t(key) : t('status.unknown');
    },
    agentTypeLabel: (value) => {
      if (!value) return t('agentType.general');
      const key = `agentType.${value}`;
      return has(key) ? t(key) : t('agentType.other');
    },
    schedulingModeLabel: (value) => {
      if (!value) return t('schedulingMode.auto');
      const key = `schedulingMode.${value}`;
      return has(key) ? t(key) : t('schedulingMode.other');
    },
    mediaTypeLabel: (value) => {
      if (!value) return t('mediaType.auto');
      const key = `mediaType.${value}`;
      return has(key) ? t(key) : t('mediaType.other');
    },
    capabilityLabel: (value) => {
      const key = `capability.${value}`;
      return has(key) ? t(key) : value;
    },
  };
}
