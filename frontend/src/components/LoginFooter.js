import React from 'react';

/**
 * Renders the footer for the Login screen.
 * @returns {React.ReactElement} The rendered footer.
 */
function LoginFooter() {
  return (
    <div className="login-footer"> {/* Corresponds to the outer div in the mockup's footer section */}
      <p className="login-terms-text">
        {/* Replaces: text-[#60758a] text-sm font-normal ... */}
        By continuing, you agree to our Terms of Service and Privacy Policy.
      </p>
      <div className="login-footer-spacer"></div> {/* Replaces: h-5 bg-white */}
    </div>
  );
}

export default LoginFooter;
