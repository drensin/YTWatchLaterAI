import React from 'react';

/**
 * Renders the main content for the Login screen.
 * @param {object} props - The component's props.
 * @param {Function} props.onLogin - Callback to handle the login action.
 * @returns {React.ReactElement} The rendered content.
 */
function LoginContent({onLogin}) {
  return (
    <div className="login-content">
      <h2 className="login-welcome-title">Welcome to ReelWorthy</h2>
      {/* Replaces: text-[#111418] tracking-light text-[28px] font-bold ... */}
      <p className="login-intro-text">
        Manage, explore, and get intelligent recommendations from your YouTube playlists, with a particular emphasis on the Watch Later list.
      </p>
      {/* Replaces: text-[#111418] text-base font-normal ... */}
      <div className="login-button-container"> {/* Replaces: flex px-4 py-3 justify-center */}
        <button onClick={onLogin} className="login-google-button">
          {/* Replaces: flex min-w-[84px] max-w-[480px] cursor-pointer ... */}
          <span>Sign in with Google</span> {/* Replaces: truncate */}
        </button>
      </div>
    </div>
  );
}

export default LoginContent;
