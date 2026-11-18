import { Outlet } from 'react-router';
import './layout.css';
import { NewOrderWatcher } from './NewOrderWatcher';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

export function AppLayout() {
  return (
    <div className="layout">
      <NewOrderWatcher />
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
