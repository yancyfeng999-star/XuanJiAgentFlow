import { ReactNode } from 'react';
import './Badge.css';

type BadgeVariant = 'success' | 'running' | 'pending' | 'failed' | 'paused';

interface BadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  size?: 'sm' | 'md';
}

const icons: Record<BadgeVariant, string> = {
  success: '✓',
  running: '⟳',
  pending: '⏳',
  failed: '✕',
  paused: '⏸',
};

export default function Badge({ variant, children, size = 'md' }: BadgeProps) {
  return (
    <span className={`badge badge-${variant} badge-${size}`}>
      <span className="badge-icon">{icons[variant]}</span>
      {children}
    </span>
  );
}
