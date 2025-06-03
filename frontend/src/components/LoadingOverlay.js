/**
 * @fileoverview Defines the LoadingOverlay React component, which displays
 * a semi-transparent overlay with a spinner and "Loading..." text to indicate
 * background activity.
 */
import React from 'react';

/**
 * Renders a loading overlay with a spinner.
 * @returns {JSX.Element} The rendered loading overlay.
 */
function LoadingOverlay() {
  return (
    <div className="loading-overlay">
      <div className="spinner"></div>
      <p>Loading...</p>
    </div>
  );
}

export {LoadingOverlay};
