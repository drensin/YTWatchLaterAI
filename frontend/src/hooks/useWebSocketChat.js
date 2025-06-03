/**
 * @fileoverview Custom React hook for managing WebSocket chat interactions.
 */
import {useState, useEffect, useCallback, useRef} from 'react';

const WEBSOCKET_SERVICE_URL = 'wss://gemini-chat-service-679260739905.us-central1.run.app'; // Define or import
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
 * @property {string} activeOutputTab - The currently active output tab ('Results' or 'Thinking').
 * @property {(tabName: string) => void} setActiveOutputTab - Setter for `activeOutputTab`.
 * @property {boolean} isStreaming - True if the AI is currently streaming a response.
 * @property {(query: string) => Promise<void>} handleQuerySubmit - Function to submit a new query to the chat.
 */

/**
 * Custom hook to manage WebSocket connection, message handling, and chat state for AI interactions.
 * It handles connecting to a WebSocket service, sending queries, receiving streamed responses
 * (including 'thinking' process and final suggested videos), and managing UI state related to the chat.
 * Includes logic for ping/pong keep-alive and automatic reconnection attempts.
 *
 * @param {string} selectedPlaylistId - The ID of the currently selected YouTube playlist.
 * @param {boolean} isPlaylistDataReady - Flag indicating if the data for the selected playlist is ready for chat.
 * @param {(config: {visible: boolean, message: string, type: string}) => void} setAppPopup - Callback to show app-level popups.
 * @param {(errorMessage: string | null) => void} setAppError - Callback to set app-level error messages.
 * @param {string} selectedModelId - The ID of the user-selected Gemini model to be used for chat.
 * @returns {WebSocketChatHookReturn} An object containing chat state and handler functions.
 */
function useWebSocketChat(selectedPlaylistId, isPlaylistDataReady, setAppPopup, setAppError, selectedModelId) {
  /** @type {React.RefObject<WebSocket|null>} Reference to the WebSocket instance. */
  const ws = useRef(null);
  /** @type {React.RefObject<NodeJS.Timeout|null>} Reference to the ping interval timer. */
  const pingIntervalRef = useRef(null);
  /** @type {React.RefObject<NodeJS.Timeout|null>} Reference to the reconnect timeout timer. */
  const reconnectTimeoutRef = useRef(null);
  /** @type {React.RefObject<string>} Buffer for accumulating incoming 'thinking' text chunks. */
  const thinkingChunkBuffer = useRef('');
  /** @type {React.RefObject<NodeJS.Timeout|null>} Reference to the timeout for debouncing thinking output display updates. */
  const thinkingUpdateTimeout = useRef(null);

  /** @state Stores the array of video objects suggested by the AI. @type {Array<SuggestedVideo>} */
  const [suggestedVideos, setSuggestedVideos] = useState([]);
  /** @state Stores the last query submitted by the user. @type {string} */
  const [lastQuery, setLastQuery] = useState('');
  /** @state Stores the accumulated 'thinking' output from the AI. @type {string} */
  const [thinkingOutput, setThinkingOutput] = useState('');
  /** @state Determines which tab ('Results' or 'Thinking') is currently active in the UI. @type {string} */
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  /** @state Flag indicating whether the AI is currently streaming a response. @type {boolean} */
  const [isStreaming, setIsStreaming] = useState(false);
  /** @state Counter for WebSocket reconnection attempts. @type {number} */
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  /**
   * Clears all WebSocket related timers: ping interval, reconnect timeout, and thinking update timeout.
   * @type {() => void}
   */
  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
    if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current);
    thinkingUpdateTimeout.current = null;
  }, []);

  /**
   * Flushes the buffered 'thinking' text chunks to the `thinkingOutput` state
   * and clears the thinking update timeout. This ensures all received 'thinking'
   * data is rendered.
   * @type {() => void}
   */
  const flushThinkingBuffer = useCallback(() => {
    if (thinkingChunkBuffer.current.length > 0) {
      setThinkingOutput((prev) => prev + thinkingChunkBuffer.current);
      thinkingChunkBuffer.current = '';
    }
    if (thinkingUpdateTimeout.current) {
      clearTimeout(thinkingUpdateTimeout.current);
      thinkingUpdateTimeout.current = null;
    }
  }, []);

  /**
   * Intentionally closes the WebSocket connection and cleans up associated resources.
   * This includes flushing any buffered thinking output and clearing all timers.
   * Event handlers are nullified before closing to prevent them from firing during the close operation.
   * @type {() => void}
   */
  const closeWebSocket = useCallback(() => {
    flushThinkingBuffer();
    clearWebSocketTimers();
    if (ws.current) {
      // Detach event handlers before closing to prevent them from firing during close.
      ws.current.onopen = null;
      ws.current.onmessage = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.close();
      ws.current = null;
      console.log('WebSocket connection intentionally closed.');
    }
  }, [clearWebSocketTimers, flushThinkingBuffer]);

  /**
   * Initiates or re-initiates a WebSocket connection for the given playlist ID and selected AI model.
   * If a `playlistIdToConnect` is provided, it closes any existing connection and establishes a new one.
   * If no `playlistIdToConnect` is provided, it ensures any existing connection is closed.
   * Sets up event handlers for open, message, close, and error events.
   * On open, it sends an 'INIT_CHAT' message with the playlist ID and selected model ID.
   * Implements a ping mechanism to keep the connection alive.
   * @param {string} playlistIdToConnect - The ID of the playlist to connect the chat to.
   * @type {(playlistIdToConnect: string) => void}
   */
  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) {
      if (ws.current) {
        console.log('No playlist selected, closing WebSocket.');
        closeWebSocket();
      }
      return;
    }
    closeWebSocket(); // Ensure any existing connection is closed before starting a new one.
    console.log(`Attempting WebSocket connection for playlist: ${playlistIdToConnect}`);
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false); // Reset streaming state for new connection
    thinkingChunkBuffer.current = ''; // Clear any old buffer

    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      setReconnectAttempt(0); // Reset reconnect attempts on successful connection
      clearWebSocketTimers(); // Clear any lingering reconnect timers
      // Send INIT_CHAT message to backend, including the selected model ID
      ws.current.send(JSON.stringify({
        type: 'INIT_CHAT',
        payload: {
          playlistId: playlistIdToConnect,
          modelId: selectedModelId, // Include the selected model ID
        },
      }));
      if (setAppPopup) setAppPopup({visible: true, message: 'Chat service connected.', type: 'info'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 2000);

      // Start ping interval to keep connection alive
      pingIntervalRef.current = setInterval(() => {
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({type: 'PING'}));
        }
      }, 30000); // Send ping every 30 seconds
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
        case 'STREAM_CHUNK':
          thinkingChunkBuffer.current += message.payload.textChunk;
          if (!isStreaming) setIsStreaming(true); // Set streaming true when first chunk arrives
          setActiveOutputTab('Thinking'); // Switch to thinking tab

          // Debounce thinking output updates for performance
          if (thinkingUpdateTimeout.current) {
            clearTimeout(thinkingUpdateTimeout.current);
          }
          thinkingUpdateTimeout.current = setTimeout(() => {
            if (thinkingChunkBuffer.current.length > 0) {
              setThinkingOutput((prev) => prev + thinkingChunkBuffer.current);
              thinkingChunkBuffer.current = ''; // Clear buffer after updating state
            }
          }, 200); // Update UI every 200ms with buffered chunks
          break;
        case 'STREAM_END':
          flushThinkingBuffer(); // Ensure all buffered chunks are displayed
          setSuggestedVideos(message.payload.suggestedVideos || []);
          if (setAppPopup) setAppPopup({visible: true, message: 'Suggestions received!', type: 'success'});
          setTimeout(() => {
            if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
          }, 2000);
          setActiveOutputTab('Results'); // Switch to results tab
          setIsStreaming(false);
          break;
        case 'ERROR':
          flushThinkingBuffer();
          if (setAppError) setAppError(`Chat Error: ${message.error}`);
          if (setAppPopup) setAppPopup({visible: true, message: `Chat Error: ${message.error}`, type: 'error'});
          setTimeout(() => {
            if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
          }, 5000);
          setActiveOutputTab('Results'); // Revert to results tab on error
          setIsStreaming(false);
          break;
        default:
          console.warn('Received unknown WebSocket message type:', message.type);
      }
    };

    /**
     * Handles WebSocket close or error events, attempting reconnection if appropriate.
     * @param {Event} event - The WebSocket close or error event.
     */
    const handleWSCloseOrError = (event) => {
      console.log('WebSocket closed or error:', event.type);
      clearWebSocketTimers(); // Stop pinging and any pending reconnects

      // If onclose is null, it means closeWebSocket was called intentionally, so don't reconnect.
      if (selectedPlaylistId && ws.current && !ws.current.onclose) {
        return;
      }

      // Attempt to reconnect if a playlist is selected and max attempts not reached
      if (selectedPlaylistId && reconnectAttempt < MAX_RECONNECT_ATTEMPTS) {
        const nextAttempt = reconnectAttempt + 1;
        setReconnectAttempt(nextAttempt);
        // Exponential backoff for reconnection delay
        const delay = Math.min(MAX_RECONNECT_DELAY_MS, INITIAL_RECONNECT_DELAY_MS * Math.pow(2, nextAttempt - 1));
        if (setAppPopup) setAppPopup({visible: true, message: `Chat connection lost. Reconnecting (${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`, type: 'warning'});

        reconnectTimeoutRef.current = setTimeout(() => {
          if (selectedPlaylistId) { // Check if playlist is still selected before reconnecting
            console.log(`Reconnection attempt ${nextAttempt}`);
            startWebSocketConnection(selectedPlaylistId);
          } else {
            console.log('Playlist deselected during reconnect timeout, aborting reconnect.');
          }
        }, delay);
      } else if (selectedPlaylistId) {
        // Max reconnect attempts reached or no playlist selected
        if (setAppError) setAppError('Failed to reconnect to chat service.');
        if (setAppPopup) setAppPopup({visible: true, message: 'Failed to reconnect to chat. Please re-select playlist or refresh.', type: 'error'});
      }
    };

    ws.current.onclose = handleWSCloseOrError;
    ws.current.onerror = handleWSCloseOrError;
  }, [
    selectedPlaylistId,
    selectedModelId,
    reconnectAttempt,
    closeWebSocket,
    clearWebSocketTimers,
    setAppPopup,
    setAppError,
    flushThinkingBuffer,
    setActiveOutputTab,
  ]);

  /** @type {React.RefObject<string|null>} Stores the previously selected playlist ID to detect changes. */
  const prevSelectedPlaylistIdRef = useRef(selectedPlaylistId);

  /**
   * Effect to manage the WebSocket connection lifecycle based on changes to
   * `selectedPlaylistId` and `isPlaylistDataReady`.
   * - If a playlist is selected and its data is ready:
   *   - Clears previous chat state if the playlist ID has changed.
   *   - Starts a new WebSocket connection.
   * - If no playlist is selected or data is not ready, closes any existing WebSocket connection.
   * - Ensures WebSocket is closed on component unmount or when dependencies trigger a re-evaluation
   *   that should terminate the connection.
   */
  useEffect(() => {
    if (selectedPlaylistId && isPlaylistDataReady) {
      let needsToClearData = false;
      // If the selected playlist ID has changed
      if (selectedPlaylistId !== prevSelectedPlaylistIdRef.current) {
        console.log('New playlist selected in useEffect, clearing states.');
        needsToClearData = true;
        prevSelectedPlaylistIdRef.current = selectedPlaylistId;
      } else if (!ws.current) {
        // If it's an initial connection for this playlist (e.g., after page load or reconnect)
        // and not a playlist change, data might already be relevant or will be fetched.
        console.log('Initial connection for playlist, not clearing data (it should be empty or will be set).');
      }

      if (needsToClearData) {
        setThinkingOutput('');
        setSuggestedVideos([]);
        setLastQuery('');
        setActiveOutputTab('Results'); // Default to results tab on new playlist
      }
      startWebSocketConnection(selectedPlaylistId);
    } else {
      // If no playlist is selected or data is not ready, close the WebSocket.
      closeWebSocket();
      prevSelectedPlaylistIdRef.current = null; // Reset previous ID
    }

    // Cleanup function: close WebSocket when component unmounts or dependencies change
    // such that the connection should be terminated.
    return () => {
      closeWebSocket();
    };
  }, [selectedPlaylistId, isPlaylistDataReady, startWebSocketConnection, closeWebSocket, setActiveOutputTab]);


  /**
   * Handles the submission of a user's query to the WebSocket.
   * Validates that a playlist is selected and the WebSocket connection is open.
   * Sends the query and updates UI state (lastQuery, clears previous results/thinking, sets streaming state).
   * Handles potential errors during query submission.
   * @param {string} query - The query text submitted by the user.
   * @type {(query: string) => Promise<void>}
   */
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
    if (setAppError) setAppError(null); // Clear previous app-level errors
    setSuggestedVideos([]); // Clear previous suggestions
    setThinkingOutput(''); // Clear previous thinking output
    thinkingChunkBuffer.current = ''; // Clear buffer
    if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current); // Clear pending buffer flush

    setActiveOutputTab('Thinking'); // Switch to thinking tab
    setIsStreaming(true); // Indicate that streaming has started

    try {
      ws.current.send(JSON.stringify({type: 'USER_QUERY', payload: {query}}));
    } catch (err) {
      console.error('Error sending query via WebSocket:', err);
      if (setAppError) setAppError(err.message);
      if (setAppPopup) setAppPopup({visible: true, message: `Query error: ${err.message}`, type: 'error'});
      setTimeout(() => {
        if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
      }, 5000);
      // Reset UI state on send error
      setActiveOutputTab('Results');
      setIsStreaming(false);
      thinkingChunkBuffer.current = '';
      if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current);
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
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit,
  };
}

export {useWebSocketChat};
