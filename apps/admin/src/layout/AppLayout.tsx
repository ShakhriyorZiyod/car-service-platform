import { Outlet } from 'react-router';
import './layout.css';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  return (
    <div className="layout">
      <Sidebar />
      <div className="layout__main">
        <Topbar />
        <div className="layout__page">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
