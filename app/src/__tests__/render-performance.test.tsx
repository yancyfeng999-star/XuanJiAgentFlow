import { memo, useRef } from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const Probe = memo(function Probe({ label }: { label: string }) {
  const renders = useRef(0);
  renders.current += 1;
  return <span data-renders={renders.current}>{label}</span>;
});

describe('render isolation', () => {
  it('keeps an unchanged memoized node from re-rendering on sibling selection', () => {
    const first = render(<Probe label="a" />);
    const count = Number(first.container.querySelector('span')?.getAttribute('data-renders'));
    first.rerender(<Probe label="a" />);
    expect(Number(first.container.querySelector('span')?.getAttribute('data-renders'))).toBe(count);
  });
});
