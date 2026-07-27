import { NavLink, useLocation } from 'react-router-dom';
import { Home, Plus, LayoutGrid, Settings } from 'lucide-react';
import './Sidebar.css';

const navItems = [
  { to: '/', icon: Home, label: '首页' },
  { to: '/input', icon: Plus, label: '新建运行' },
  { to: '/canvas', icon: LayoutGrid, label: '画布' },
];

export default function Sidebar() {
  const location = useLocation();
  const isCanvas = location.pathname === '/canvas';

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <h1>璇玑</h1>
        <span>AgentFlow v0.1</span>
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `sidebar-item ${isActive || (isCanvas && item.to === '/canvas') ? 'active' : ''}`
            }
          >
            <item.icon size={16} />
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        璇玑 · 思考在先，执行在后
      </div>
    </nav>
  );
}
