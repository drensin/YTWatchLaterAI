/**
 * @fileoverview Custom React hook for managing WebSocket chat interactions.
 */
import {useState, useEffect, useCallback, useRef} from 'react';

const WEBSOCKET_SERVICE_URL = 'wss://gemini-chat-service-679260739905.us-central1.run.app'; // Define or import
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;

/**
 * @typedef {object} WebSocketChatHookReturn
 * @property {Array<object>} suggestedVideos - Suggested videos from the chat.
 * @property {string} lastQuery - The last query submitted by the user.
 * @property {string} thinkingOutput - The raw output from the AI as it 'thinks'.
 * @property {string} activeOutputTab - The currently active output tab ('Results' or 'Thinking').
 * @property {function(string): void} setActiveOutputTab - Setter for `activeOutputTab`.
 * @property {boolean} isStreaming - True if the AI is currently streaming a response.
 * @property {function(string): Promise<void>} handleQuerySubmit - Function to submit a new query to the chat.
 */

/**
 * Custom hook to manage WebSocket connection, message handling, and chat state.
 * @param {string} selectedPlaylistId - The ID of the currently selected playlist.
 * @param {boolean} isPlaylistDataReady - Flag indicating if playlist data is ready for chat.
 * @param {function(config: {visible: boolean, message: string, type: string}): void} setAppPopup - Function to show app-level popups.
 * @param {function(string|null): void} setAppError - Function to set app-level errors.
 * @returns {WebSocketChatHookReturn} Chat state and handlers.
 */
function useWebSocketChat(selectedPlaylistId, isPlaylistDataReady, setAppPopup, setAppError) {
  const ws = useRef(null);
  const pingIntervalRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const thinkingChunkBuffer = useRef('');
  const thinkingUpdateTimeout = useRef(null);

  const [suggestedVideos, setSuggestedVideos] = useState([]);
  const [lastQuery, setLastQuery] = useState('');
  const [thinkingOutput, setThinkingOutput] = useState('');
  const [activeOutputTab, setActiveOutputTab] = useState('Results');
  const [isStreaming, setIsStreaming] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const clearWebSocketTimers = useCallback(() => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    pingIntervalRef.current = null;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    reconnectTimeoutRef.current = null;
    if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current);
    thinkingUpdateTimeout.current = null;
  }, []);

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

  const closeWebSocket = useCallback(() => {
    flushThinkingBuffer();
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
  }, [clearWebSocketTimers, flushThinkingBuffer]);

  const startWebSocketConnection = useCallback((playlistIdToConnect) => {
    if (!playlistIdToConnect) {
      if (ws.current) {
        console.log('No playlist selected, closing WebSocket.');
        closeWebSocket();
      }
      return;
    }
    closeWebSocket();
    console.log(`Attempting WebSocket connection for playlist: ${playlistIdToConnect}`);
    ws.current = new WebSocket(WEBSOCKET_SERVICE_URL);
    setIsStreaming(false);
    thinkingChunkBuffer.current = '';

    ws.current.onopen = () => {
      console.log('WebSocket connected. Initializing chat...');
      setReconnectAttempt(0);
      clearWebSocketTimers();
      ws.current.send(JSON.stringify({type: 'INIT_CHAT', payload: {playlistId: playlistIdToConnect}}));
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
      if (message.type === 'CHAT_INITIALIZED') {
        if (setAppPopup) setAppPopup({visible: true, message: 'Chat session ready!', type: 'success'});
        setTimeout(() => {
          if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
        }, 2000);
        setIsStreaming(false);
      } else if (message.type === 'STREAM_CHUNK') {
        thinkingChunkBuffer.current += message.payload.textChunk;
        if (!isStreaming) setIsStreaming(true);
        setActiveOutputTab('Thinking');

        if (thinkingUpdateTimeout.current) {
          clearTimeout(thinkingUpdateTimeout.current);
        }
        thinkingUpdateTimeout.current = setTimeout(() => {
          if (thinkingChunkBuffer.current.length > 0) {
            setThinkingOutput((prev) => prev + thinkingChunkBuffer.current);
            thinkingChunkBuffer.current = '';
          }
        }, 200);
      } else if (message.type === 'STREAM_END') {
        flushThinkingBuffer();
        setSuggestedVideos(message.payload.suggestedVideos || []);
        if (setAppPopup) setAppPopup({visible: true, message: 'Suggestions received!', type: 'success'});
        setTimeout(() => {
          if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
        }, 2000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      } else if (message.type === 'ERROR') {
        flushThinkingBuffer();
        if (setAppError) setAppError(`Chat Error: ${message.error}`);
        if (setAppPopup) setAppPopup({visible: true, message: `Chat Error: ${message.error}`, type: 'error'});
        setTimeout(() => {
          if (setAppPopup) setAppPopup((p) => ({...p, visible: false}));
        }, 5000);
        setActiveOutputTab('Results');
        setIsStreaming(false);
      }
    };

    const handleWSCloseOrError = (event) => {
      console.log('WebSocket closed or error:', event.type);
      clearWebSocketTimers();
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
  }, [selectedPlaylistId, reconnectAttempt, closeWebSocket, clearWebSocketTimers, setAppPopup, setAppError, flushThinkingBuffer]);

  const prevSelectedPlaylistIdRef = useRef(selectedPlaylistId);

  useEffect(() => {
    if (selectedPlaylistId && isPlaylistDataReady) {
      let needsToClearData = false;
      if (selectedPlaylistId !== prevSelectedPlaylistIdRef.current) {
        console.log('New playlist selected in useEffect, clearing states.');
        needsToClearData = true;
        prevSelectedPlaylistIdRef.current = selectedPlaylistId;
      } else if (!ws.current) {
        console.log('Initial connection for playlist, not clearing data (it should be empty).');
      }

      if (needsToClearData) {
        setThinkingOutput('');
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
    thinkingChunkBuffer.current = '';
    if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current);

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
      thinkingChunkBuffer.current = '';
      if (thinkingUpdateTimeout.current) clearTimeout(thinkingUpdateTimeout.current);
    }
  }, [selectedPlaylistId, setAppPopup, setAppError]);

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

export default useWebSocketChat;
