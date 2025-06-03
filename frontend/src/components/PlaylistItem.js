import React from 'react';

/**
 * Renders a single playlist item.
 * @param {object} props - The component's props.
 * @param {object} props.playlist - The playlist object.
 * @param {string} props.playlist.id - The playlist ID.
 * @param {string} props.playlist.title - The playlist title.
 * @param {number} props.playlist.itemCount - The number of videos in the playlist.
 * @param {string} [props.playlist.thumbnailUrl] - Optional URL for the playlist thumbnail.
 * @param {Function} props.onSelectPlaylist - Callback function when the playlist is selected.
 * @returns {React.ReactElement} The rendered playlist item.
 */
function PlaylistItem({playlist, onSelectPlaylist}) { // Corrected object-curly-spacing for props
  const {id, title, itemCount, thumbnailUrl} = playlist; // This line seems to already comply

  return (
    <div className="playlist-item">
      <div className="playlist-item-thumbnail-container">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt={`${title} thumbnail`} className="playlist-item-thumbnail" />
        ) : (
          <div className="playlist-item-thumbnail-placeholder">
            {/* Placeholder icon or initials can go here */}
            <span>🎵</span>
          </div>
        )}
      </div>
      <div className="playlist-item-info">
        <h3 className="playlist-item-title">{title}</h3>
        <p className="playlist-item-count">{itemCount} videos</p>
      </div>
      <div className="playlist-item-action">
        <button onClick={() => onSelectPlaylist(id)} className="playlist-item-view-button">
          View
        </button>
      </div>
    </div>
  );
}

export default PlaylistItem;
