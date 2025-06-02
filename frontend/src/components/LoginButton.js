import React from 'react';

/**
 * Renders a login button.
 * @param {object} props - The component's props.
 * @param {Function} props.onLogin - Callback to handle login.
 * @returns {React.ReactElement} The rendered login button.
 */
function LoginButton({onLogin}) {
  return (
    <button onClick={onLogin} className='auth-button'>
      Login
    </button>
  );
}

export default LoginButton;
