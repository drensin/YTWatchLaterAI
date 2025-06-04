/**
 * @fileoverview Defines the SettingsScreen React component, which allows users
 * to configure application settings, such as AI model selection and logging out.
 * It will also handle default playlist preferences in a future update.
 */
import React, {useState, useEffect, useCallback} from 'react';

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
  userPlaylists,
}) {
  const [useDefaultPlaylistEnabled, setUseDefaultPlaylistEnabled] = useState(false);
  const [defaultPlaylistId, setDefaultPlaylistId] = useState('');

  // Load preferences from localStorage on component mount
  useEffect(() => {
    const storedUseDefault = localStorage.getItem('reelworthy_useDefaultPlaylistEnabled') === 'true';
    const storedDefaultId = localStorage.getItem('reelworthy_defaultPlaylistId');

    setUseDefaultPlaylistEnabled(storedUseDefault);
    if (storedUseDefault && storedDefaultId) {
      setDefaultPlaylistId(storedDefaultId);
    } else {
      setDefaultPlaylistId(''); // Ensure it's cleared if not enabled or no ID
    }
  }, []);

  const handleUseDefaultChange = useCallback((event) => {
    const isChecked = event.target.checked;
    setUseDefaultPlaylistEnabled(isChecked);
    localStorage.setItem('reelworthy_useDefaultPlaylistEnabled', isChecked);
    if (!isChecked) {
      // If disabling, clear the stored default playlist ID
      setDefaultPlaylistId('');
      localStorage.removeItem('reelworthy_defaultPlaylistId');
    }
  }, []);

  const handleDefaultPlaylistChange = useCallback((event) => {
    const newPlaylistId = event.target.value;
    setDefaultPlaylistId(newPlaylistId);
    if (useDefaultPlaylistEnabled && newPlaylistId) {
      localStorage.setItem('reelworthy_defaultPlaylistId', newPlaylistId);
    } else if (useDefaultPlaylistEnabled && !newPlaylistId) {
      // If "Select a Playlist" is chosen while enabled, clear it
      localStorage.removeItem('reelworthy_defaultPlaylistId');
    }
  }, [useDefaultPlaylistEnabled]);

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
          style={{padding: '5px', width: '280px'}}
        >
          {(!availableModels || availableModels.length === 0) && <option value="">Loading models...</option>}
          {availableModels && availableModels.map((model) => (
            <option key={model} value={model}>
              {model.split('/').pop()} {/* Display a cleaner name */}
            </option>
          ))}
        </select>
      </div>

      {/* Default Playlist Settings */}
      <div style={{marginTop: '30px', marginBottom: '20px', borderTop: '1px solid #ccc', paddingTop: '20px'}}>
        <h2>Default Playlist</h2>
        <div style={{marginBottom: '10px'}}>
          <label>
            <input
              type="checkbox"
              checked={useDefaultPlaylistEnabled}
              onChange={handleUseDefaultChange}
              style={{marginRight: '10px', verticalAlign: 'middle'}}
            />
            Automatically load a default playlist on startup
          </label>
        </div>
        <div>
          <label htmlFor="default-playlist-select" style={{marginRight: '10px'}}>
            Default playlist to load:
          </label>
          <select
            id="default-playlist-select"
            value={defaultPlaylistId}
            onChange={handleDefaultPlaylistChange}
            disabled={!useDefaultPlaylistEnabled || !userPlaylists || userPlaylists.length === 0}
            style={{padding: '5px', width: '280px'}}
          >
            <option value="">-- Select a Playlist --</option>
            {userPlaylists && userPlaylists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>{playlist.title}</option>
            ))}
            {(!userPlaylists || userPlaylists.length === 0) && useDefaultPlaylistEnabled && (
              <option value="" disabled>No playlists available</option>
            )}
          </select>
        </div>
      </div>

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
