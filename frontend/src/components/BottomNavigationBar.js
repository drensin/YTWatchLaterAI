/**
 * @fileoverview Defines the BottomNavigationBar React component, which provides
 * navigation between the main screens of the application (Playlists, Chat, Settings).
 */
import React from 'react';

// Placeholder SVGs - replace with actual SVG components or paths later
// For now, using simple text characters that will inherit color.
// Actual SVGs should use fill="currentColor" or stroke="currentColor"

/**
 * Placeholder component for the Home/Playlists icon.
 * @returns {React.ReactElement} A span element representing the home icon.
 */
const HomeIcon = () => <span style={{fontSize: '24px'}}>🏠</span>;

/**
 * Placeholder component for the Chat icon.
 * @returns {React.ReactElement} A span element representing the chat icon.
 */
const ChatIcon = () => <span style={{fontSize: '24px'}}>💬</span>;

/**
 * Placeholder component for the Settings icon.
 * @returns {React.ReactElement} A span element representing the settings icon.
 */
const SettingsIcon = () => <span style={{fontSize: '24px'}}>⚙️</span>;

/**
 * Renders the bottom navigation bar.
 * @param {object} props - The component's props.
 * @param {string} props.currentScreen - The currently active screen.
 * @param {Function} props.onNavigate - Callback function to handle navigation.
 * @returns {React.ReactElement} The rendered bottom navigation bar.
 */
function BottomNavigationBar({currentScreen, onNavigate}) {
  const navItems = [
    {id: 'playlists', label: 'Playlists', icon: <HomeIcon />, screenName: 'playlists'},
    {id: 'chat', label: 'Chat', icon: <ChatIcon />, screenName: 'chat'},
    {id: 'settings', label: 'Settings', icon: <SettingsIcon />, screenName: 'settings'},
  ];

  return (
    <nav className="bottom-nav-bar">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`bottom-nav-item ${currentScreen === item.screenName ? 'active' : ''}`}
          onClick={() => onNavigate(item.screenName)}
          aria-label={item.label}
        >
          <div className="bottom-nav-icon">{item.icon}</div>
          <span className="bottom-nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNavigationBar;
