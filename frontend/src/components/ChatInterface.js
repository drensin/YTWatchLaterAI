/**
 * @fileoverview Defines the ChatInterface React component, which provides
 * a text input field and a submit button for users to interact with the AI chat.
 */
import React, {useState} from 'react';

/**
 * Renders a chat input form.
 * @param {object} props - The component's props.
 * @param {Function} props.onQuerySubmit - Callback when a query is submitted.
 * @param {boolean} props.disabled - Whether the input should be disabled.
 * @returns {React.ReactElement} The rendered chat form.
 */
function ChatInterface({onQuerySubmit, disabled}) {
  /** @state Stores the current text entered by the user in the chat input field. */
  const [query, setQuery] = useState('');

  /**
   * Handles the submission of the chat input form.
   * Prevents default form submission, trims the query, and calls the
   * `onQuerySubmit` callback if the query is not empty and the input is not disabled.
   * Clears the input field after submission.
   * @param {React.SyntheticEvent} e - The form submission event.
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onQuerySubmit(query);
      setQuery('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chat-interface-form">
      <input
        type='text'
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Ask about your playlist...'
        disabled={disabled}
      />
      <button type='submit' className='send-button' title='Send query' disabled={disabled}>➤</button>
    </form>
  );
}

export default ChatInterface;
