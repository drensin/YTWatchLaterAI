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
 * @param {function(string): void} props.onModelSelection - Callback function when a new model is selected.
 * @param {function(): void} props.onLogout - Callback function to handle user logout.
 * @param {Array<{id: string, title: string}>} props.userPlaylists - Array of user's playlist objects, used for the default playlist selection.
 * @param {boolean} props.includeSubscriptionFeed - Current state of the 'include subscription feed' preference.
 * @param {function(boolean): void} props.onIncludeSubscriptionFeedChange - Callback when 'include subscription feed' preference changes.
 * @returns {JSX.Element} The rendered Settings screen.
 */
function SettingsScreen({
  selectedModelId,
  availableModels,
  onModelSelection,
  onLogout,
  userPlaylists,
  includeSubscriptionFeed,
  onIncludeSubscriptionFeedChange,
}) {
  const [useDefaultPlaylistEnabled, setUseDefaultPlaylistEnabled] = useState(false);
  const [defaultPlaylistId, setDefaultPlaylistId] = useState('');
  // includeSubscriptionFeed is now a prop, no longer local state

  // Load preferences from localStorage on component mount
  useEffect(() => {
    const storedUseDefault = localStorage.getItem('reelworthy_useDefaultPlaylistEnabled') === 'true';
    const storedDefaultId = localStorage.getItem('reelworthy_defaultPlaylistId');
    // includeSubscriptionFeed is now managed by parent, so no need to load from localStorage here

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

  const handleIncludeSubscriptionFeedChange = useCallback((event) => {
    const isChecked = event.target.checked;
    // Update localStorage and call the prop callback
    localStorage.setItem('reelworthy_settings_includeSubscriptionFeed', isChecked);
    if (onIncludeSubscriptionFeedChange) {
      onIncludeSubscriptionFeedChange(isChecked);
    }
  }, [onIncludeSubscriptionFeedChange]);

  return (
    <div className="settings-screen-container">

      {/* AI Model Selection */}
      <div className="settings-section model-selection-section">
        <label htmlFor="model-select" className="settings-label">Select AI Chat Model:</label>
        <select
          id="model-select"
          value={selectedModelId}
          onChange={(e) => onModelSelection(e.target.value)}
          disabled={!availableModels || availableModels.length === 0}
          className="settings-select model-select"
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
      <div className="settings-section default-playlist-section">
        <div className="settings-checkbox-container">
          <label>
            <input
              type="checkbox"
              checked={useDefaultPlaylistEnabled}
              onChange={handleUseDefaultChange}
              className="settings-checkbox"
            />
            Automatically load a default playlist on startup
          </label>
        </div>
        <div>
          <select
            id="default-playlist-select"
            value={defaultPlaylistId}
            onChange={handleDefaultPlaylistChange}
            disabled={!useDefaultPlaylistEnabled || !userPlaylists || userPlaylists.length === 0}
            className="settings-select default-playlist-select"
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

      {/* Subscription Feed Setting */}
      <div className="settings-section subscription-feed-section">
        <div className="settings-checkbox-container">
          <label>
            <input
              type="checkbox"
              checked={includeSubscriptionFeed}
              onChange={handleIncludeSubscriptionFeedChange}
              className="settings-checkbox"
            />
            Include recent videos from my subscriptions in AI suggestions
          </label>
        </div>
      </div>

      {/* Logout Button */}
      <div className="settings-section logout-section">
        <button
          onClick={onLogout}
          className="logout-button"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export {SettingsScreen};
