/**
 * @fileoverview Defines the UserStatusMessages React component, which displays
 * messages to the user based on their authentication and authorization status
 * (e.g., not logged in, not authorized).
 */
import React from 'react';

/**
 * Renders status messages based on user authentication and authorization state.
 * @param {object} props - The component's props.
 * @param {import('firebase/auth').User|null} props.currentUser - The current Firebase user object, or null if not logged in.
 * @param {boolean} props.isLoggedIn - Whether the user is currently logged in.
 * @param {boolean} props.isAuthorizedUser - Whether the logged-in user is authorized to use the application.
 * @param {boolean} props.authChecked - Whether the initial authentication check has completed.
 * @returns {JSX.Element|null} The rendered status message component or null if no message needs to be displayed.
 */
function UserStatusMessages({currentUser, isLoggedIn, isAuthorizedUser, authChecked}) {
  if (!authChecked) {
    return null; // Or a global loading indicator, but App.js handles main loading overlay
  }

  if (isLoggedIn && !isAuthorizedUser) {
    return (
      <p>
        Your account ({currentUser?.email}) is not authorized to use this
        application. Please contact the administrator.
      </p>
    );
  }

  if (!isLoggedIn) {
    return <p>Please log in to manage your YouTube playlists.</p>;
  }

  return null; // All good or other views are handling display
}

export {UserStatusMessages};
