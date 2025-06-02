import React from 'react';

/**
 * Renders the UI for connecting a YouTube account.
 * @param {object} props - The component's props.
 * @param {Function} props.onConnectYouTube - Callback to initiate YouTube connection.
 * @param {string|null} props.error - Error message to display.
 * @param {string|null} props.appAuthorizationError - App-level authorization error.
 * @returns {React.ReactElement} The rendered component.
 */
function ConnectYouTubeView({onConnectYouTube, error, appAuthorizationError}) {
  return (
    <div style={{padding: '20px', textAlign: 'center'}}>
      <p>{error || appAuthorizationError || 'Your YouTube account is not connected or the connection has expired.'}</p>
      <button onClick={onConnectYouTube} style={{padding: '10px 20px', fontSize: '1em'}}>
        🔗 Connect YouTube Account
      </button>
    </div>
  );
}

export default ConnectYouTubeView;
