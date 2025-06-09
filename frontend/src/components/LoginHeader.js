/**
 * @fileoverview Defines the LoginHeader React component, which displays
 * the application title "ReelWorthy" and a help icon on the login screen.
 */
import React from 'react';

/**
 * Renders the header for the Login screen, displaying the application title.
 * @returns {JSX.Element} The rendered header.
 */
function LoginHeader() {
  return (
    <div className="login-header">
      <img src="/ReelWorthyLogo.png" alt="ReelWorthy Logo" className="login-header-logo" />
    </div>
  );
}

export {LoginHeader};
