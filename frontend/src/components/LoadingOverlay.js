import React from 'react';

/**
 * Renders a loading overlay with a spinner.
 * @returns {React.ReactElement} The rendered loading overlay.
 */
function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

export default LoadingOverlay;
