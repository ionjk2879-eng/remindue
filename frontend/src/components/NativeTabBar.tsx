import { useNavigate, useLocation } from 'react-router-dom';

interface Tab {
  path: string;
  label: string;
  icon: (active: boolean) => React.ReactNode;
}

const HomeIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M3 9.5L12 3L21 9.5V20C21 20.55 20.55 21 20 21H15V15H9V21H4C3.45 21 3 20.55 3 20V9.5Z"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const SettingsIcon = ({ active }: { active: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="3" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
    />
  </svg>
);

const TABS: Tab[] = [
  {
    path: '/dashboard',
    label: '홈',
    icon: (active) => <HomeIcon active={active} />,
  },
  {
    path: '/settings',
    label: '설정',
    icon: (active) => <SettingsIcon active={active} />,
  },
];

export default function NativeTabBar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="native-tab-bar">
      {TABS.map((tab) => {
        const active = location.pathname.startsWith(tab.path);
        return (
          <button
            key={tab.path}
            type="button"
            className={`native-tab-bar__item${active ? ' native-tab-bar__item--active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <span className="native-tab-bar__icon">{tab.icon(active)}</span>
            <span className="native-tab-bar__label">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
