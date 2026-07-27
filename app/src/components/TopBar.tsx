import { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './TopBar.css';

interface TopBarProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  actions?: ReactNode;
  rightBadge?: ReactNode;
}

export default function TopBar({ title, subtitle, backTo, actions, rightBadge }: TopBarProps) {
  const navigate = useNavigate();

  return (
    <div className="topbar">
      {backTo && (
        <button className="btn btn-ghost" onClick={() => navigate(backTo)}>
          <ArrowLeft size={16} />
          返回
        </button>
      )}
      <span className="topbar-title">{title}</span>
      {subtitle && <span className="topbar-subtitle">{subtitle}</span>}
      {rightBadge}
      <div className="topbar-actions">{actions}</div>
    </div>
  );
}
