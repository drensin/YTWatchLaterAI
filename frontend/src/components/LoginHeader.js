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
      {/* The help icon section below is removed, and the text title is replaced by the logo */}
      {/* <div className="login-header-help"> */}
      {/* <button className="login-header-help-button"> */}
      {/* Replaces: flex max-w-[480px] cursor-pointer ... */}
      {/* <div className="icon-container"> */}
      {/* Replaces: text-[#111418]" data-icon="Question" ... */}
      {/* <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256"> */}
      {/* <path d={questionIconPath}></path> */}
      {/* </svg> */}
      {/* </div> */}
      {/* </button> */}
      {/* </div> */}
    </div>
  );
}

export {LoginHeader};
