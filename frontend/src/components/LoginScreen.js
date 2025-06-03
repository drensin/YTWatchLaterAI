/**
 * @fileoverview Defines the LoginScreen React component, which serves as the
 * main container for the login page, composing the LoginHeader, LoginContent,
 * and LoginFooter components.
 */
import React from 'react';
import LoginHeader from './LoginHeader';
import LoginContent from './LoginContent';
import LoginFooter from './LoginFooter';

/**
 * Renders the Login screen.
 * @param {object} props - The component's props.
 * @param {Function} props.onLogin - Callback to handle the login action.
 * @returns {React.ReactElement} The rendered Login screen.
 */
function LoginScreen({onLogin}) {
  return (
    // The main container class "login-screen-container" will be styled
    // to match the overall page layout from the mockup:
    // "relative flex size-full min-h-screen flex-col bg-white justify-between group/design-root overflow-x-hidden"
    // Font family is set globally, e.g., in index.css or App.css
    <div className="login-screen-container">
      {/* This div corresponds to the first main child div in the mockup that holds header and content */}
      <div>
        <LoginHeader />
        <LoginContent onLogin={onLogin} />
      </div>
      {/* This div corresponds to the second main child div in the mockup that holds the footer */}
      <div>
        <LoginFooter />
      </div>
    </div>
  );
}

export default LoginScreen;
