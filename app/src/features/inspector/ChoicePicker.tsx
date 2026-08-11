import { useState } from 'react';
import { Plus, X } from 'lucide-react';

import { useT } from '../../lib/i18n';

interface ChoicePickerProps {
  id: string;
  label: string;
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  emptyHint: string;
  formatChoice?: (value: string) => string;
}

export default function ChoicePicker({
  id,
  label,
  values,
  options,
  onChange,
  disabled = false,
  emptyHint,
  formatChoice = (value) => value,
}: ChoicePickerProps) {
  const [customValue, setCustomValue] = useState('');
  const t = useT();
  const choices = [...new Set([...values, ...options])].sort((left, right) => left.localeCompare(right));

  const toggle = (value: string) => {
    onChange(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  };
  const addCustomValue = () => {
    const value = customValue.trim();
    if (!value) return;
    if (!values.includes(value)) onChange([...values, value]);
    setCustomValue('');
  };

  return (
    <fieldset className="choice-field" disabled={disabled}>
      <legend>{label}</legend>
      {choices.length > 0 ? (
        <div className="choice-options">
          {choices.map((choice) => (
            <label key={choice} className={values.includes(choice) ? 'is-selected' : ''}>
              <input
                type="checkbox"
                checked={values.includes(choice)}
                onChange={() => toggle(choice)}
              />
              <span>{formatChoice(choice)}</span>
              {values.includes(choice) && <X size={12} aria-hidden="true" />}
            </label>
          ))}
        </div>
      ) : (
        <p className="choice-empty">{emptyHint}</p>
      )}
      {!disabled && (
        <div className="choice-add">
          <input
            id={id}
            value={customValue}
            onChange={(event) => setCustomValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addCustomValue();
              }
            }}
            placeholder={t('picker.add', { label })}
            aria-label={t('picker.add', { label })}
          />
          <button type="button" onClick={addCustomValue} disabled={!customValue.trim()}>
            <Plus size={13} />
            {t('picker.addButton')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
