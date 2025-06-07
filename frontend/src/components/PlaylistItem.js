/**
 * @fileoverview Defines the PlaylistItem React component, which displays
 * information about a single YouTube playlist (thumbnail, title, video count)
 * and provides a button to view/select it.
 */
import React from 'react';

/**
 * Renders a single playlist item.
 * @param {object} props - The component's props.
 * @param {object} props.playlist - The playlist object.
 * @param {string} props.playlist.id - The playlist ID.
 * @param {string} props.playlist.title - The playlist title.
 * @param {number} props.playlist.itemCount - The number of videos in the playlist.
 * @param {string} [props.playlist.thumbnailUrl] - Optional URL for the playlist thumbnail.
 * @param {function(string): void} props.onSelectPlaylist - Callback function invoked when the playlist is selected.
 * @param {boolean} props.isSelected - Whether this playlist item is currently selected.
 * @returns {JSX.Element} The rendered playlist item.
 */
function PlaylistItem({playlist, onSelectPlaylist, isSelected}) {
  const {id, title, itemCount, thumbnailUrl} = playlist;

  // console.log(`[PlaylistItem] Title: ${title}, isSelected: ${isSelected}`); // DEBUG LOG

  const handleKeyPress = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      onSelectPlaylist(id);
    }
  };

  return (
    <div
      className={`playlist-item ${isSelected ? 'playlist-item--selected' : ''}`}
      onClick={() => onSelectPlaylist(id)}
      onKeyPress={handleKeyPress}
      role="button"
      tabIndex={0}
      style={{cursor: 'pointer'}}
      aria-pressed={isSelected} // Indicates selection state for assistive technologies
    >
      <div className="playlist-item-thumbnail-container">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={`${title} thumbnail`} className="playlist-item-thumbnail" />
        ) : (
          <div className="playlist-item-thumbnail-placeholder">
            <span>🎵</span>
          </div>
        )}
      </div>
      <div className="playlist-item-info">
        <h3 className="playlist-item-title">{title}</h3>
        <p className="playlist-item-count">{itemCount} videos</p>
      </div>
      {/* Optional: Visual indicator for selection */}
      {/* {isSelected && <span className="selected-indicator-icon">✓</span>} */}
      {/* The "View" button is removed from playlist-item-action */}
      <div className="playlist-item-action">
        {/* Content of this div can be adjusted if other actions are needed, or removed if not. */}
        {/* For now, it's empty as the whole item is clickable. */}
      </div>
    </div>
  );
}

export {PlaylistItem};
