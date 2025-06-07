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
 * @param {string} props.thinkingOutput - The text representing the AI's internal thoughts.
 * @param {string} props.responseBuildUp - The accumulating main response text from the AI.
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
    thinkingOutput, // This is for "Internal Thoughts"
    responseBuildUp, // This is for "Response Build-up"
    thinkingOutputContainerRef,
  } = props;

  const [waitingDots, setWaitingDots] = useState('');
  const waitingIntervalRef = useRef(null);
  const waitingMessage = 'Query sent. Waiting for AI response';

  useEffect(() => {
    if (isStreaming && !thinkingOutput && !responseBuildUp) {
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
  }, [isStreaming, thinkingOutput, responseBuildUp]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const query = event.target.elements.query.value;
    if (query.trim()) {
      onQuerySubmit(query);
      event.target.elements.query.value = '';
    }
  };

  let internalThoughtsDisplay = thinkingOutput;
  let responseBuildUpDisplay = responseBuildUp;

  if (isStreaming) {
    if (!thinkingOutput && !responseBuildUp) {
      // If actively streaming but no output of any kind yet, show waiting.
      internalThoughtsDisplay = `${waitingMessage}${waitingDots}`;
      responseBuildUpDisplay = ''; // Keep response build-up empty until it starts
    } else {
      if (!thinkingOutput) {
        // internalThoughtsDisplay = 'No specific thoughts received yet, or thoughts are complete.';
      }
      if (!responseBuildUp && thinkingOutput) { // If thoughts are coming but no main response yet
        // responseBuildUpDisplay = "Waiting for main response content...";
      }
    }
  } else { // Not streaming
    if (!thinkingOutput && activeOutputTab === 'Thinking') {
      internalThoughtsDisplay = 'No internal thoughts to display for the last query.';
    }
    if (!responseBuildUp && activeOutputTab === 'Thinking' && !suggestedVideos.length && !thinkingOutput) {
      responseBuildUpDisplay = 'No response content to display.';
    }
  }


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
              {internalThoughtsDisplay || (isStreaming ? 'Receiving thoughts...' : 'None')}
              <br /><br />
              <strong>Response Build-up:</strong>
              <br />
              {responseBuildUpDisplay || (isStreaming && !suggestedVideos.length && thinkingOutput /* only show if thoughts are also streaming or done */ ? 'Receiving response...' : (suggestedVideos.length ? '' : 'None'))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export {ChatViewContent};
