import React, {useState} from 'react';

/**
 * Renders a chat input form.
 * @param {object} props - The component's props.
 * @param {Function} props.onQuerySubmit - Callback when a query is submitted.
 * @param {boolean} props.disabled - Whether the input should be disabled.
 * @returns {React.ReactElement} The rendered chat form.
 */
function ChatInterface({onQuerySubmit, disabled}) {
  const [query, setQuery] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (query.trim() && !disabled) {
      onQuerySubmit(query);
      setQuery('');
    }
  };
  return (
    <form onSubmit={handleSubmit}>
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
