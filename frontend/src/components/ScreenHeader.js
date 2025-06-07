/**
 * @fileoverview Defines the ScreenHeader React component, a generic header
 * used across various screens in the application. It displays a title and
 * can optionally include left and right action icons/buttons.
 */
import React from 'react';

/**
 * Placeholder component for a settings icon.
 * @returns {JSX.Element} An SVG element representing a settings icon.
 */
const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" fill="currentColor" viewBox="0 0 256 256">
    <path d="M222.62,100.88A3.29,3.29,0,0,0,224,103.2V152.8a3.29,3.29,0,0,0,1.38,2.32,8,8,0,0,1-4.2,14.07l-20.52-5.47a72.12,72.12,0,0,1-21.34,21.34l5.47,20.52a8,8,0,0,1-14.07,4.2,3.29,3.29,0,0,0-2.32-1.38H103.2a3.29,3.29,0,0,0-2.32,1.38,8,8,0,0,1-14.07-4.2l-5.47-20.52a72.12,72.12,0,0,1-21.34-21.34l-20.52,5.47a8,8,0,0,1-4.2-14.07,3.29,3.29,0,0,0-1.38-2.32V103.2a3.29,3.29,0,0,0-1.38-2.32,8,8,0,0,1,4.2-14.07l20.52,5.47A72.12,72.12,0,0,1,80,71.34L74.53,50.82a8,8,0,0,1,14.07-4.2,3.29,3.29,0,0,0,2.32,1.38H152.8a3.29,3.29,0,0,0,2.32-1.38,8,8,0,0,1,14.07,4.2l5.47,20.52a72.12,72.12,0,0,1,21.34,21.34l20.52-5.47a8,8,0,0,1,4.2,14.07ZM128,96a32,32,0,1,0,32,32A32,32,0,0,0,128,96Z"></path>
  </svg>
);

// Removed BackArrowIcon as it's not currently used.

/**
 * Renders a generic screen header.
 * @param {object} props - The component's props.
 * @param {string} props.title - The title of the screen.
 * @param {React.ReactNode} [props.leftIcon] - Optional icon/button for the left side (currently not implemented in favor of logo).
 * @param {function(): void} [props.onLeftIconClick] - Optional click handler for the left icon (currently not implemented).
 * @param {React.ReactNode} [props.rightIcon] - Optional icon/button for the right side.
 * @param {function(): void} [props.onRightIconClick] - Optional click handler for the right icon.
 * @returns {JSX.Element} The rendered screen header.
 */
function ScreenHeader({title, rightIcon, onRightIconClick}) { // Removed leftIcon, onLeftIconClick from destructuring
  // Determines the icon to display on the right. Uses provided `rightIcon` if available,
  // otherwise defaults to SettingsIcon if `onRightIconClick` is provided.
  const finalRightIcon = rightIcon || (onRightIconClick ? <SettingsIcon /> : null);
  // Determines the icon to display on the left. Uses provided `leftIcon` if available,
  // otherwise defaults to BackArrowIcon if `onLeftIconClick` is provided.
  // The logo will now be the primary content for screen-header-action-left,
  // so finalLeftIcon (like back arrow) might need to be re-evaluated or placed differently if still needed.
  // For now, let's assume the logo replaces other left icons unless specified.
  // If a back button is needed WITH the logo, the design might need more thought (e.g. logo then back button).
  // const finalLeftIcon = leftIcon || (onLeftIconClick ? <BackArrowIcon /> : null);

  return (
    <header className="screen-header">
      <div className="screen-header-action-left">
        <img src="/ReelWorthyLogo.png" alt="ReelWorthy Logo" className="screen-header-app-logo" />
        {/* {finalLeftIcon && (
          <button onClick={onLeftIconClick} className="screen-header-icon-button" aria-label="Header left action">
            {finalLeftIcon}
          </button>
        )} */}
      </div>
      <h1 className="screen-header-title">{title}</h1>
      <div className="screen-header-action-right">
        {finalRightIcon && (
          <button onClick={onRightIconClick} className="screen-header-icon-button" aria-label="Header right action">
            {finalRightIcon}
          </button>
        )}
      </div>
    </header>
  );
}

export {ScreenHeader};
