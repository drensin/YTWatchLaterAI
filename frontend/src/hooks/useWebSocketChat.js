/**
 * @fileoverview Custom React hook for managing WebSocket chat interactions.
 */
import {useState, useEffect, useCallback, useRef} from 'react';

const WEBSOCKET_SERVICE_URL = process.env.REACT_APP_WEBSOCKET_SERVICE_URL || 'wss://gemini-chat-service-679260739905.us-central1.run.app';
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * @typedef {object} SuggestedVideo
 * @property {string} id - The YouTube video ID.
 * @property {string} title - The title of the video.
 * @property {string} channelTitle - The title of the channel that uploaded the video.
 * @property {string} publishedAt - The publication date of the video (ISO string).
 * @property {string} description - A snippet of the video's description.
 * @property {string} thumbnailUrl - URL of the video's thumbnail image.
 * @property {string} [reason] - Optional reason why the video was suggested.
 */

/**
 * @typedef {object} WebSocketChatHookReturn
 * @property {Array<SuggestedVideo>} suggestedVideos - Suggested videos from the chat.
 * @property {string} lastQuery - The last query submitted by the user.
 * @property {string} thinkingOutput - The raw output from the AI as it 'thinks'.
 * @property {string} dataReceptionIndicator - String of '#' indicating data chunks received.
 * @property {string} activeOutputTab - The currently active output tab ('Results' or 'Thinking').
 * @property {(tabName: string) => void} setActiveOutputTab - Setter for `activeOutputTab`.
 * @property {boolean} isStreaming - True if the AI is currently streaming a response.
 * @property {(query: string) => Promise<void>} handleQuerySubmit - Function to submit a new query to the chat.
 */

/**
 * Custom hook to manage WebSocket connection, message handling, and chat state for AI interactions.
 * It handles connecting to a WebSocket service, sending queries, receiving streamed responses
 * (including 'thinking' process and data reception indicators), and managing UI state related to the chat.
 * Includes logic for ping/pong keep-alive and automatic reconnection attempts.
 *
 * @param {string} selectedPlaylistId - The ID of the currently selected YouTube playlist.
 * @param {boolean} isPlaylistDataReady - Flag indicating if the data for the selected playlist is ready for chat.
 * @param {function(object): void} setAppPopup - Callback to show app-level popups.
 * @param {function(string | null): void} setAppError - Callback to set app-level error messages.
 * @param {string} selectedModelId - The ID of the user-selected Gemini model to be used for chat.
 * @param {string | null | undefined} userId - The Firebase UID of the current user.
 * @param {boolean} currentIncludeSubscriptionFeed - The current preference for including subscription feed videos.
 * @param {boolean} deepThinking - The current preference for the deep thinking feature.
 * @returns {WebSocketChatHookReturn} An object containing chat state and handler functions.
 */
function useWebSocketChat(selectedPlaylistId, isPlaylistDataReady, setAppPopup, setAppError, selectedModelId, userId, currentIncludeSubscriptionFeed, deepThinking) {
  const ws = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [lastQuery, setLastQuery] = useState('');
  const [thinkingOutput, setThinkingOutput] = useState('');
  const [dataReceptionIndicator, setDataReceptionIndicator] = useState(''); // New state for "###"
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  const [isStreaming, setIsStreaming] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
  }, []);

  const closeWebSocket = useCallback(() => {
    clearWebSocketTimers();
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
      ws.current = null;
      console.log('WebSocket connection intentionally closed.');
    }
  }, [clearWebSocketTimers]);

  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) {
      if (ws.current) {
        console.log('No playlist selected, closing WebSocket.');
        closeWebSocket();
      }
      return;
    }
    closeWebSocket();
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false);
    setThinkingOutput('');
    setDataReceptionIndicator(''); // Clear on new connection

    ws.current.onopen = () => {
      setReconnectAttempt(0);
      clearWebSocketTimers();

      ws.current.send(JSON.stringify({
        type: 'INIT_CHAT',
        payload: {
          playlistId: playlistIdToConnect,
          modelId: selectedModelId,
          includeSubscriptionFeed: currentIncludeSubscriptionFeed,
          userId: userId,
          deepThinking: deepThinking,
        },
      }));
      if (setAppPopup) setAppPopup({visible: true, message: 'Chat service connected.', type: 'info'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 2000);

      pingIntervalRef.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({type: 'PING'}));
        }
      }, 30000);
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      switch (message.type) {
        case 'CHAT_INITIALIZED':
          if (setAppPopup) setAppPopup({visible: true, message: 'Chat session ready!', type: 'success'});
          setTimeout(() => {
            if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
          }, 2000);
          setIsStreaming(false);
          break;
        case 'THINKING_CHUNK':
          if (message.payload && message.payload.textChunk) {
            setThinkingOutput((prev) => prev + message.payload.textChunk);
          }
          if (!isStreaming) setIsStreaming(true);
          setActiveOutputTab('Thinking');
          break;
        case 'CONTENT_CHUNK_RECEIVED': // New case
          setDataReceptionIndicator((prev) => prev + '#');
          if (!isStreaming) setIsStreaming(true); // Ensure streaming is true
          setActiveOutputTab('Thinking'); // Keep thinking tab active
          break;
        case 'STREAM_END':
          setSuggestedVideos(message.payload.suggestedVideos || []);
          setDataReceptionIndicator(''); // Clear indicator
          if (setAppPopup) setAppPopup({visible: true, message: 'Suggestions received!', type: 'success'});
          setTimeout(() => {
            if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
          }, 2000);
          setActiveOutputTab('Results');
          setIsStreaming(false);
          break;
        case 'ERROR':
          setDataReceptionIndicator(''); // Clear indicator
          if (setAppError) setAppError(`Chat Error: ${message.error}`);
          if (setAppPopup) setAppPopup({visible: true, message: `Chat Error: ${message.error}`, type: 'error'});
          setTimeout(() => {
            if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
          }, 5000);
          setActiveOutputTab('Results');
          setIsStreaming(false);
          break;
        default:
          console.warn('Received unknown WebSocket message type:', message.type);
      }
    };

    /**
     * Handles WebSocket close or error events, attempting reconnection if appropriate.
     * Clears timers and attempts to reconnect if conditions are met (playlist selected, max attempts not reached).
     * @param {Event} event - The WebSocket close or error event.
     */
    const handleWSCloseOrError = (event) => {
      console.log('WebSocket closed or error:', event.type);
      clearWebSocketTimers();
      setDataReceptionIndicator(''); // Clear indicator on close/error too

      if (selectedPlaylistId && ws.current && !ws.current.onclose) {
        return;
      }

      if (selectedPlaylistId && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1));
        if (setAppPopup) setAppPopup({visible: true, message: `Chat connection lost. Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`, type: 'warning'});

        reconnectTimeoutRef.current = setTimeout(() => {
          if (selectedPlaylistId) {
            console.log(`Reconnection attempt ${nextAttempt}`);
            startWebSocketConnection(selectedPlaylistId);
          } else {
            console.log('Playlist deselected during reconnect timeout, aborting reconnect.');
          }
        }, delay);
      } else if (selectedPlaylistId) {
        if (setAppError) setAppError('Failed to reconnect to chat service.');
        if (setAppPopup) setAppPopup({visible: true, message: 'Failed to reconnect to chat. Please re-select playlist or refresh.', type: 'error'});
      }
    };

    ws.current.onclose = handleWSCloseOrError;
    ws.current.onerror = handleWSCloseOrError;
  }, [
    selectedPlaylistId,
    selectedModelId,
    userId,
    currentIncludeSubscriptionFeed,
    deepThinking,
    reconnectAttempt,
    closeWebSocket,
    clearWebSocketTimers,
    setAppPopup,
    setAppError,
    setActiveOutputTab,
    // isStreaming, // Removed isStreaming as a dependency
  ]);

  const prevSelectedPlaylistIdRef = useRef(selectedPlaylistId);

  useEffect(() => {
    if (selectedPlaylistId && isPlaylistDataReady) {
      let needsToClearData = false;
      if (selectedPlaylistId !== prevSelectedPlaylistIdRef.current) {
        needsToClearData = true;
        prevSelectedPlaylistIdRef.current = selectedPlaylistId;
      } else if (!ws.current) {
        // Initial connection for this playlist, data should be empty or will be set by server.
      }

      if (needsToClearData) {
        setThinkingOutput('');
        setDataReceptionIndicator(''); // Clear indicator
        setSuggestedVideos([]);
        setLastQuery('');
        setActiveOutputTab('Results');
      }
      startWebSocketConnection(selectedPlaylistId);
    } else {
      closeWebSocket();
      prevSelectedPlaylistIdRef.current = null;
    }

    return () => {
      closeWebSocket();
    };
  }, [selectedPlaylistId, isPlaylistDataReady, startWebSocketConnection, closeWebSocket, setActiveOutputTab]);

  const handleQuerySubmit = useCallback(async (query) => {
    if (!selectedPlaylistId) {
      if (setAppPopup) setAppPopup({visible: true, message: 'Please select a playlist.', type: 'error'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 3000);
      return;
    }
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      if (setAppPopup) setAppPopup({visible: true, message: 'Chat not connected. Please wait or try re-selecting the playlist.', type: 'error'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 5000);
      return;
    }

    setLastQuery(query);
    if (setAppError) setAppError(null);
    setSuggestedVideos([]);
    setThinkingOutput('');
    setDataReceptionIndicator(''); // Reset indicator

    setActiveOutputTab('Thinking');
    setIsStreaming(true);

    try {
      ws.current.send(JSON.stringify({type: 'USER_QUERY', payload: {query}}));
    } catch (err) {
      console.error('Error sending query via WebSocket:', err);
      if (setAppError) setAppError(err.message);
      if (setAppPopup) setAppPopup({visible: true, message: `Query error: ${err.message}`, type: 'error'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 5000);
      setActiveOutputTab('Results');
      setIsStreaming(false);
      setDataReceptionIndicator(''); // Clear on error too
    }
  }, [
    selectedPlaylistId,
    setAppPopup,
    setAppError,
    setActiveOutputTab,
  ]);

  return {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    dataReceptionIndicator, // Return new indicator
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit,
  };
}

export {useWebSocketChat};
