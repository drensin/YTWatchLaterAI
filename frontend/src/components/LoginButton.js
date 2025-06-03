/**
 * @fileoverview Defines the LoginButton React component, which provides a
 * simple button to initiate the login process.
 */
import React from 'react';

/**
 * Renders a login button.
 * @param {object} props - The component's props.
 * @param {() => void} props.onLogin - Callback function to initiate the login process.
 * @returns {JSX.Element} The rendered login button.
 */
function LoginButton({onLogin}) {
  return (
    <button onClick={onLogin} className='auth-button'>
      Login
    </button>
  );
}

export {LoginButton};
