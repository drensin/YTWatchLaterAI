import React, {useState, useEffect, useRef} from 'react';
import VideoList from './VideoList';

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

  const [waitingDots, setWaitingDots] = useState('');
  const [isPrimedForStream, setIsPrimedForStream] = useState(false);
  const waitingIntervalRef = useRef(null);
  const waitingMessage = 'Query sent to Gemini. Waiting for stream';

  useEffect(() => {
    if (isPrimedForStream && isStreaming && (!thinkingOutput || thinkingOutput.trim() === '')) {
      if (!waitingIntervalRef.current) {
        setWaitingDots('');
        waitingIntervalRef.current = setInterval(() => {
          setWaitingDots((prevDots) => (prevDots.length >= 3 ? '.' : prevDots + '.'));
        }, 10000);
      }
    } else {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
        waitingIntervalRef.current = null;
      }
      setWaitingDots('');
      if (isPrimedForStream && thinkingOutput && thinkingOutput.trim() !== '') {
        setIsPrimedForStream(false);
      }
    }
    return () => {
      if (waitingIntervalRef.current) {
        clearInterval(waitingIntervalRef.current);
      }
    };
  }, [isPrimedForStream, isStreaming, thinkingOutput]);

  const handleSubmit = (event) => {
    event.preventDefault();
    const query = event.target.elements.query.value;
    if (query.trim()) {
      setIsPrimedForStream(true);
      setWaitingDots('');
      onQuerySubmit(query);
      event.target.elements.query.value = '';
    }
  };

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
          name="query"
          placeholder="Ask about your playlist..."
          disabled={isStreaming}
        />
        <button type="submit" className="send-button" disabled={isStreaming}>
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
              {displayThinkingOutput}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatViewContent;
