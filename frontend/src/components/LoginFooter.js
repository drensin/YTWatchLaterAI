/**
 * @fileoverview Defines the LoginFooter React component, which displays
 * the terms of service and privacy policy notice on the login screen.
 */
import React from 'react';

/**
 * Renders the footer for the Login screen, displaying terms of service and privacy policy notice.
 * @returns {JSX.Element} The rendered footer.
 */
function LoginFooter() {
  return (
    <div className="login-footer"> {/* Corresponds to the outer div in the mockup's footer section */}
      <p className="login-terms-text">
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}

export {LoginFooter};
