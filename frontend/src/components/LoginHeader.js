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
  // SVG path for the Question icon
  // const questionIconPath = 'M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z'; // Path for removed icon

  return (
    <div className="login-header"> {/* Replaces: flex items-center bg-white p-4 pb-2 justify-between */}
      {/* Centering the title by ensuring it's the only main element or by adjusting flex properties if a spacer div was on the left */}
      {/* If there was an implicit spacer on the left for centering, we might need to adjust login-header-title styles or add an empty div for balance */}
      <h2 className="login-header-title" style={{textAlign: 'center', width: '100%'}}>ReelWorthy</h2> {/* Adjusted for centering and fixed spacing */}
      {/* The help icon section below is removed */}
      {/* <div className="login-header-help"> */}
      {/* Replaces: flex w-12 items-center justify-end */}
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
