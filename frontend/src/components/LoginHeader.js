import React from 'react';

/**
 * Renders the header for the Login screen.
 * @returns {React.ReactElement} The rendered header.
 */
function LoginHeader() {
  // SVG path for the Question icon
  const questionIconPath = 'M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z';

  return (
    <div className="login-header"> {/* Replaces: flex items-center bg-white p-4 pb-2 justify-between */}
      <h2 className="login-header-title">ReelWorthy</h2> {/* Replaces: text-[#111418] text-lg font-bold ... flex-1 text-center pl-12 */}
      <div className="login-header-help"> {/* Replaces: flex w-12 items-center justify-end */}
        <button className="login-header-help-button"> {/* Replaces: flex max-w-[480px] cursor-pointer ... */}
          <div className="icon-container"> {/* Replaces: text-[#111418]" data-icon="Question" ... */}
            <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
              <path d={questionIconPath}></path>
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
}

export default LoginHeader;
