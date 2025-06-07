/**
 * @fileoverview Defines the ChatViewContent React component, which manages
 * the user interface for chat interactions, including query input,
 * displaying AI thinking process, and showing suggested video results.
 */
import React, {useState, useEffect, useRef} from 'react';
import {VideoList} from './VideoList';

/**
 * Renders the main content area for the chat view.
 * This includes the query input form, tabs for switching between
 * suggested videos and the AI's thinking process, and the content
 * for the active tab.
 * @param {object} props - The component's props.
 * @param {function(string): void} props.onQuerySubmit - Callback function to submit a new query.
 * @param {boolean} props.isStreaming - Indicates if the AI is currently streaming a response.
 * @param {string} props.activeOutputTab - The currently active tab ('suggestions' or 'Thinking').
 * @param {function(string): void} props.onSetOutputTab - Callback function to set the active output tab.
 * @param {Array<{id: string, title: string, channelTitle: string, publishedAt: string, description: string, thumbnailUrl: string}>} props.suggestedVideos - An array of video objects suggested by the AI.
 * @param {string} props.lastQuery - The most recent query submitted by the user.
 * @param {string} props.thinkingOutput - The text representing the AI's internal thoughts.
 * @param {string} props.dataReceptionIndicator - String of '#' indicating data chunks received.
 * @param {React.RefObject<HTMLDivElement>} props.thinkingOutputContainerRef - Ref for the scrollable container of the thinking output.
 * @returns {JSX.Element} The rendered chat view content.
 */
function ChatViewContent(props) {
  // console.log('[ChatViewContent] Entire props object at entry:', props);
  // console.log('[ChatViewContent] Direct access props.responsesReceivedCount:', props.responsesReceivedCount); // DEBUG LOG
  const {
    onQuerySubmit,
    isStreaming,
    activeOutputTab,
    onSetOutputTab,
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    dataReceptionIndicator, // Changed from responsesReceivedCount
    thinkingOutputContainerRef,
  } = props;

  // console.log('[ChatViewContent] props.responsesReceivedCount:', responsesReceivedCount); // DEBUG LOG - Replaced by direct access log above

  const [waitingDots, setWaitingDots] = useState('');
  const waitingIntervalRef = useRef(null);
  const waitingMessage = 'Query sent. Waiting for AI response';

  useEffect(() => {
    // Show waiting dots if streaming, no thoughts yet, and no data reception has started
    if (isStreaming && !thinkingOutput && dataReceptionIndicator === '') {
      if (!waitingIntervalRef.current) {
        setWaitingDots('');
        waitingIntervalRef.current = setInterval(() => {
          setWaitingDots((prevDots) => (prevDots.length >= 3 ? '.' : prevDots + '.'));
        }, 700); // Adjusted interval for faster dot animation
      }
    } else {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
        waitingIntervalRef.current = null;
      }
      setWaitingDots('');
    }
    return () => {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
      }
    };
  }, [isStreaming, thinkingOutput, dataReceptionIndicator]); // Updated dependencies

  /**
   * Handles the submission of the chat query form.
   * It calls the `onQuerySubmit` prop with the query value and clears the input field.
   * @param {React.FormEvent<HTMLFormElement>} event - The form submission event.
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const query = event.target.elements.query.value;
    if (query.trim()) {
      onQuerySubmit(query);
      event.target.elements.query.value = '';
    }
  };

  // Removed intermediate display variables internalThoughtsDisplay and responseBuildUpDisplay
  // Logic will be handled directly in JSX or with simpler conditions if needed.

  return (
    <div className="chat-view-content">
      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          name="query"
          placeholder="Ask about your playlist..."
          disabled={isStreaming}
        />
        <button type="submit" className="send-button" disabled={isStreaming} title="Send query">
          ➤
        </button>
      </form>

      {lastQuery && (
        <p className="last-query-display">
          Showing {suggestedVideos ? suggestedVideos.length : 0} results for: <em>{lastQuery}</em>
        </p>
      )}

      <div className="tabs">
        <button
          onClick={() => onSetOutputTab('suggestions')}
          className={activeOutputTab === 'suggestions' ? 'active' : ''}
          disabled={isStreaming}
        >
          Results
        </button>
        <button
          onClick={() => onSetOutputTab('Thinking')}
          className={activeOutputTab === 'Thinking' ? 'active' : ''}
          disabled={isStreaming}
        >
          Thinking
        </button>
      </div>

      <div className="chat-tab-content-area">
        {activeOutputTab === 'suggestions' && (
          <VideoList videos={suggestedVideos} listType="suggestions" />
        )}
        {activeOutputTab === 'Thinking' && (
          <div className="thinking-output-container" ref={thinkingOutputContainerRef}>
            <pre className="thinking-output">
              <strong>Internal Thoughts:</strong>
              <br />
              {thinkingOutput || (isStreaming && dataReceptionIndicator === '' && !suggestedVideos.length ? `${waitingMessage}${waitingDots}` : 'None')}
              <br />

              {/* Conditionally render the "Receiving Final Data" section */}
              {dataReceptionIndicator && dataReceptionIndicator.length > 0 && (
                <>
                  <br /> {/* Add a line break if there were thoughts and now data is coming */}
                  <strong>Receiving Final Data:</strong>
                  <br />
                  {dataReceptionIndicator}
                </>
              )}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export {ChatViewContent};
