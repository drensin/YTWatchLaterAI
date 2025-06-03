/**
 * @fileoverview Defines the UserStatusMessages React component, which displays
 * messages to the user based on their authentication and authorization status
 * (e.g., not logged in, not authorized).
 */
import React from 'react';

/**
 * Renders status messages based on user authentication and authorization state.
 * @param {object} props - The component's props.
 * @param {object|null} props.currentUser - The current Firebase user object.
 * @param {boolean} props.isLoggedIn - Whether the user is logged in.
 * @param {boolean} props.isAuthorizedUser - Whether the user is authorized.
 * @param {boolean} props.authChecked - Whether the initial auth check has completed.
 * @returns {React.ReactElement|null} The rendered messages or null.
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

export default UserStatusMessages;
