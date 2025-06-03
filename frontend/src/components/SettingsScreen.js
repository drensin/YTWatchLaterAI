/**
 * @fileoverview Defines the SettingsScreen React component, which allows users
 * to configure application settings, such as AI model selection and logging out.
 * It will also handle default playlist preferences in a future update.
 */
import React from 'react';

/**
 * Renders the Settings screen.
 * @param {object} props - The component's props.
 * @param {string} props.selectedModelId - The ID of the currently selected AI model.
 * @param {Array<string>} props.availableModels - Array of available AI model IDs.
 * @param {(newModelId: string) => void} props.onModelSelection - Callback function when a new model is selected.
 * @param {() => void} props.onLogout - Callback function to handle user logout.
 * @param {Array<{id: string, title: string}>} props.userPlaylists - Array of user's playlist objects (for future use).
 * @returns {JSX.Element} The rendered Settings screen.
 */
function SettingsScreen({
  selectedModelId,
  availableModels,
  onModelSelection,
  onLogout,
  userPlaylists, // Prop for Phase 2: Default playlist selection
}) {
  // Phase 2 state will be added here:
  // const [useDefaultPlaylist, setUseDefaultPlaylist] = useState(false);
  // const [currentSelectedDefaultPlaylistId, setCurrentSelectedDefaultPlaylistId] = useState('');

  // Phase 2 useEffect for loading from localStorage will be added here.

  // Phase 2 handlers for checkbox and dropdown will be added here.

  return (
    <div style={{padding: '20px', textAlign: 'center'}}>
      <h1>Settings</h1>

      {/* AI Model Selection */}
      <div style={{marginBottom: '20px'}}>
        <label htmlFor="model-select" style={{marginRight: '10px'}}>Select AI Model:</label>
        <select
          id="model-select"
          value={selectedModelId}
          onChange={(e) => onModelSelection(e.target.value)}
          disabled={!availableModels || availableModels.length === 0}
          style={{padding: '5px', minWidth: '200px'}}
        >
          {(!availableModels || availableModels.length === 0) && <option value="">Loading models...</option>}
          {availableModels && availableModels.map((model) => (
            <option key={model} value={model}>
              {model.split('/').pop()} {/* Display a cleaner name */}
            </option>
          ))}
        </select>
      </div>

      {/* Default Playlist Settings (Placeholder for Phase 2) */}
      {/*
      <div style={{marginTop: '30px', marginBottom: '20px', borderTop: '1px solid #ccc', paddingTop: '20px'}}>
        <h2>Default Playlist</h2>
        <div>
          <label>
            <input
              type="checkbox"
              // checked={useDefaultPlaylist}
              // onChange={handleUseDefaultChange}
              style={{marginRight: '10px'}}
            />
            Use Default Playlist
          </label>
        </div>
        <div style={{marginTop: '10px'}}>
          <label htmlFor="default-playlist-select" style={{marginRight: '10px'}}>Select Playlist:</label>
          <select
            id="default-playlist-select"
            // value={currentSelectedDefaultPlaylistId}
            // onChange={handleDefaultPlaylistChange}
            // disabled={!useDefaultPlaylist || !userPlaylists || userPlaylists.length === 0}
            style={{padding: '5px', minWidth: '200px'}}
          >
            <option value="">-- Select a Playlist --</option>
            {userPlaylists && userPlaylists.map(playlist => (
              <option key={playlist.id} value={playlist.id}>{playlist.title}</option>
            ))}
            {(!userPlaylists || userPlaylists.length === 0) && useDefaultPlaylist && (
              <option value="" disabled>No playlists available</option>
            )}
          </select>
        </div>
      </div>
      */}

      {/* Logout Button */}
      <div style={{marginTop: '30px', borderTop: '1px solid #ccc', paddingTop: '20px'}}>
        <button
          onClick={onLogout}
          style={{padding: '10px 20px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export {SettingsScreen};
