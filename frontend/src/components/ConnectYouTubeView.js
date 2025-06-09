/**
 * @fileoverview Defines the ConnectYouTubeView React component, which provides
 * the UI for users to initiate the YouTube account connection process.
 */
import React from 'react';

/**
 * Renders the UI for connecting a YouTube account.
 * Displays a message and a button to initiate the YouTube OAuth flow.
 * @param {object} props - The component's props.
 * @param {function(): void} props.onConnectYouTube - Callback function to initiate the YouTube connection process.
 * @param {string|null} props.error - Specific error message related to YouTube connection to display.
 * @param {string|null} props.appAuthorizationError - General application-level authorization error message to display.
 * @returns {JSX.Element} The rendered component.
 */
function ConnectYouTubeView({onConnectYouTube, error, appAuthorizationError}) {
  return (
    <div className="connect-youtube-view">
      <p>{error || appAuthorizationError || 'Your YouTube account is not connected or the connection has expired.'}</p>
      <button onClick={onConnectYouTube} className="connect-youtube-button">
        🔗 Connect YouTube Account
      </button>
    </div>
  );
}

export {ConnectYouTubeView};
