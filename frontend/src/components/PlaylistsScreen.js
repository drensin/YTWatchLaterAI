/**
 * @fileoverview Defines the PlaylistsScreen React component, which displays a list
 * of the user's YouTube playlists. Each playlist is rendered using the PlaylistItem component.
 */
import React from 'react';
// ScreenHeader is now rendered by App.js
import {PlaylistItem} from './PlaylistItem';

/**
 * Renders the content for the Playlists screen, displaying a list of user's YouTube playlists.
 * The header is now handled by App.js.
 * @param {object} props - The component's props.
 * @param {Array<{id: string, title: string, itemCount: number, thumbnailUrl?: string}>} props.userPlaylists - Array of user's playlist objects.
 * @param {function(string): void} props.onSelectPlaylist - Callback function invoked when a playlist is selected.
 * @returns {JSX.Element} The rendered Playlists screen content.
 */
function PlaylistsScreen({userPlaylists, onSelectPlaylist}) {
  // onNavigate prop is no longer needed here as header actions are in App.js
  // const handleSettingsClick = () => {
  //   if (onNavigate) {
  //     onNavigate('settings');
  //   }
  // };

  return (
    <div className="playlists-screen"> {/* This root div might need adjustment or removal if screen-content-wrapper handles all styling */}
      {/* <ScreenHeader title="Playlists" onRightIconClick={handleSettingsClick} /> REMOVED */}
      <div className="playlists-list-container">
        {userPlaylists && userPlaylists.length > 0 ? (
          userPlaylists.map((playlist) => (
            <PlaylistItem
              key={playlist.id}
              playlist={playlist}
              onSelectPlaylist={onSelectPlaylist}
            />
          ))
        ) : (
          <p className="playlists-empty-message">
            No playlists found. Try connecting your YouTube account or refreshing.
          </p>
        )}
      </div>
    </div>
  );
}

export {PlaylistsScreen};
