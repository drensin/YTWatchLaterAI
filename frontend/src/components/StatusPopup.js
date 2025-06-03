/**
 * @fileoverview Defines the StatusPopup React component, which displays
 * temporary messages (e.g., success, error, info) to the user.
 */
import React from 'react';

/**
 * Renders a status popup message.
 * @param {object} props - The component's props.
 * @param {string} props.message - The message to display.
 * @param {string} props.type - The type of popup (e.g., 'success', 'error').
 * @returns {React.ReactElement|null} The rendered popup or null if no message.
 */
function StatusPopup({message, type}) {
  if (!message) return null;
  return <div className={`status-popup ${type}`}>{message}</div>;
}

export default StatusPopup;
