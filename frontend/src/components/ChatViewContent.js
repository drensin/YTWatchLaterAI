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
 * @param {(query: string) => void} props.onQuerySubmit - Callback function to submit a new query.
 * @param {boolean} props.isStreaming - Indicates if the AI is currently streaming a response.
 * @param {string} props.activeOutputTab - The currently active tab ('suggestions' or 'Thinking').
 * @param {(tabName: string) => void} props.onSetOutputTab - Callback function to set the active output tab.
 * @param {Array<{id: string, title: string, channelTitle: string, publishedAt: string, description: string, thumbnailUrl: string}>} props.suggestedVideos - An array of video objects suggested by the AI.
 * @param {string} props.lastQuery - The most recent query submitted by the user.
 * @param {string} props.thinkingOutput - The text representing the AI's thinking process.
 * @param {React.RefObject<HTMLDivElement>} props.thinkingOutputContainerRef - Ref for the scrollable container of the thinking output.
 * @returns {JSX.Element} The rendered chat view content.
 */
function ChatViewContent(props) {
  const {
    onQuerySubmit,
    isStreaming,
    activeOutputTab,
    onSetOutputTab,
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    thinkingOutputContainerRef,
  } = props;

  /**
   * @state Stores the animated "waiting" dots displayed while waiting for the AI stream to start.
   * @type {string}
   */
  const [waitingDots, setWaitingDots] = useState('');
  /**
   * @state Flag indicating if the component is ready and waiting for the AI stream to begin after a query submission.
   * @type {boolean}
   */
  const [isPrimedForStream, setIsPrimedForStream] = useState(false);
  /**
   * @type {React.RefObject<NodeJS.Timeout|null>}
   * Reference to the interval timer for the waiting dots animation.
   */
  const waitingIntervalRef = useRef(null);
  /** @const {string} Message displayed while waiting for the AI stream. */
  const waitingMessage = 'Query sent to Gemini. Waiting for stream';

  /**
   * Manages the "waiting for stream" dots animation.
   * Starts an interval to animate dots if the component is primed for a stream,
   * is currently streaming, and no thinking output has arrived yet.
   * Clears the interval and resets dots when streaming stops or output arrives.
   */
  useEffect(() => {
    // Condition to start or continue the waiting dots animation
    if (isPrimedForStream && isStreaming && (!thinkingOutput || thinkingOutput.trim() === '')) {
      if (!waitingIntervalRef.current) { // Start interval only if not already running
        setWaitingDots(''); // Reset dots at the beginning
        waitingIntervalRef.current = setInterval(() => {
          setWaitingDots((prevDots) => (prevDots.length >= 3 ? '.' : prevDots + '.'));
        }, 10000); // Interval duration for dot animation
      }
    } else {
      // Condition to stop the waiting dots animation
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
        waitingIntervalRef.current = null;
      }
      setWaitingDots(''); // Clear dots
      // If stream was primed and thinking output has arrived, unprime
      if (isPrimedForStream && thinkingOutput && thinkingOutput.trim() !== '') {
        setIsPrimedForStream(false);
      }
    }

    // Cleanup function to clear the interval when the component unmounts or dependencies change
    return () => {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
      }
    };
  }, [isPrimedForStream, isStreaming, thinkingOutput]);

  /**
   * Handles the submission of the chat query form.
   * It primes the component for streaming, resets waiting dots, calls the
   * `onQuerySubmit` prop, and clears the input field.
   * @param {React.FormEvent<HTMLFormElement>} event - The form submission event.
   * @returns {void}
   */
  const handleSubmit = (event) => {
    event.preventDefault();
    const query = event.target.elements.query.value;
    if (query.trim()) { // Ensure query is not just whitespace
      setIsPrimedForStream(true); // Indicate that we are expecting a stream
      setWaitingDots(''); // Reset waiting dots immediately on new query
      onQuerySubmit(query);
      event.target.elements.query.value = ''; // Clear the input field
    }
  };

  // Determine what to display in the "Thinking" tab.
  // If waiting for the stream to start, show the waiting message with animated dots.
  // Otherwise, show the actual thinking output from the AI.
  let displayThinkingOutput;
  if (activeOutputTab === 'Thinking') {
    if (isPrimedForStream && isStreaming && (!thinkingOutput || thinkingOutput.trim() === '')) {
      displayThinkingOutput = `${waitingMessage}${waitingDots}`;
    } else {
      displayThinkingOutput = thinkingOutput;
    }
  }

  return (
    <div className="chat-view-content">
      <form onSubmit={handleSubmit} className="chat-form">
        <input
          type="text"
          name="query" // Name attribute for form element access
          placeholder="Ask about your playlist..."
          disabled={isStreaming} // Disable input while AI is responding
        />
        <button type="submit" className="send-button" disabled={isStreaming} title="Send query">
          ➤
        </button>
      </form>

      {/* Display the last query and number of results if available */}
      {lastQuery && (
        <p className="last-query-display">
          Showing {suggestedVideos ? suggestedVideos.length : 0} results for: <em>{lastQuery}</em>
        </p>
      )}

      {/* Tabs for switching between AI suggestions and thinking process */}
      <div className="tabs">
        <button
          onClick={() => onSetOutputTab('suggestions')}
          className={activeOutputTab === 'suggestions' ? 'active' : ''}
          disabled={isStreaming} // Disable tab switching while streaming
        >
          Results
        </button>
        <button
          onClick={() => onSetOutputTab('Thinking')}
          className={activeOutputTab === 'Thinking' ? 'active' : ''}
          disabled={isStreaming} // Disable tab switching while streaming
        >
          Thinking
        </button>
      </div>

      {/* Content area for the active tab */}
      <div className="chat-tab-content-area">
        {activeOutputTab === 'suggestions' && (
          <VideoList videos={suggestedVideos} listType="suggestions" />
        )}
        {activeOutputTab === 'Thinking' && (
          <div className="thinking-output-container" ref={thinkingOutputContainerRef}>
            <pre className="thinking-output">
              {displayThinkingOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export {ChatViewContent};
