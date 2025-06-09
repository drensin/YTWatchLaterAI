/**
 * @fileoverview Defines the LoginContent React component, which displays
 * the main welcome message, introductory text, and the "Sign in with Google" button
 * on the login screen.
 */
import React from 'react';

/**
 * Renders the main content for the Login screen, including a welcome message,
 * introductory text, and a "Sign in with Google" button.
 * @param {object} props - The component's props.
 * @param {function(): void} props.onLogin - Callback function to initiate the login process.
 * @returns {JSX.Element} The rendered content.
 */
function LoginContent({onLogin}) {
  return (
    <div className="login-content">
      <h2 className="login-welcome-title">Welcome to ReelWorthy</h2>
      <p className="login-intro-text">
        Manage, explore, and get intelligent recommendations from your YouTube playlists, with a particular emphasis on the Watch Later list.
      </p>
      <div className="login-button-container">
        <button onClick={onLogin} className="login-google-button">
          <span>Sign in with Google</span>
        </button>
      </div>
    </div>
  );
}

export {LoginContent};
