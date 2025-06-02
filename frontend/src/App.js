/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
// Removed memo and FixedSizeList import as they are now in VideoList.js
import './App.css';
import useAuth from './hooks/useAuth';
import useYouTube from './hooks/useYouTube';
import useWebSocketChat from './hooks/useWebSocketChat';

// Import relocated components
import LoginButton from './components/LoginButton';
// ChatInterface and VideoList are now used within MainAuthenticatedView
// import ChatInterface from './components/ChatInterface';
import LoadingOverlay from './components/LoadingOverlay';
import StatusPopup from './components/StatusPopup';
// import VideoList from './components/VideoList';

// Import new view components
import ConnectYouTubeView from './components/ConnectYouTubeView';
import MainAuthenticatedView from './components/MainAuthenticatedView';
import UserStatusMessages from './components/UserStatusMessages';

// --- Main App ---
/**
 * The main application component for ReelWorthy.
 * Manages application state, user authentication, YouTube data fetching,
 * and interactions with the AI chat service.
 * @returns {React.ReactElement} The rendered App component.
 */
function App() {
  const thinkingOutputContainerRef = useRef(null); // Keep ref for DOM manipulation here

  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [error, setError] = useState(null); // General app error, distinct from auth/youtube errors
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);

  const {
    currentUser,
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinkedByAuthCheck,
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  } = useAuth(setPopup);

  const {
    userPlaylists,
    selectedPlaylistId,
    setSelectedPlaylistId,
    fetchUserPlaylists,
    fetchPlaylistItems,
    handleConnectYouTube,
    isYouTubeLinked,
    youtubeSpecificError,
    isLoadingYouTube,
    setVideos: setYouTubeVideos,
    setUserPlaylists: setYouTubeUserPlaylists,
    setYoutubeSpecificError: setYouTubeErrorAppLevel,
  } = useYouTube(currentUser, isLoggedIn, isAuthorizedUser, setPopup, isYouTubeLinkedByAuthCheck);

  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit, // This now comes from useWebSocketChat
  } = useWebSocketChat(selectedPlaylistId, isPlaylistDataReadyForChat, setPopup, setError);


  const showOverlay = isLoadingAuth || isLoadingYouTube; // isLoadingChat can be added if useWebSocketChat exposes it

  // Effect to fetch user playlists when auth and YouTube link status are favorable.
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      console.log('App.js useEffect: Fetching user playlists (conditions met).');
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      // suggestedVideos will be cleared by useWebSocketChat when selectedPlaylistId changes
      // if (ws.current) closeWebSocket(); // closeWebSocket is now internal to useWebSocketChat
    }
  }, [
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinked,
    userPlaylists.length,
    isLoadingYouTube,
    youtubeSpecificError,
    appAuthorizationError,
    fetchUserPlaylists,
    setYouTubeUserPlaylists,
    setSelectedPlaylistId,
    setYouTubeVideos,
  ]);


  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles the selection of a new playlist from the dropdown.
   * @param {React.ChangeEvent<HTMLSelectElement>} event - The select change event.
   */
  const handlePlaylistSelection = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false); // Reset readiness
    setSelectedPlaylistId(newPlaylistId);
    setError(null);
    setYouTubeErrorAppLevel(null);

    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true); // Signal data is ready
      }
      // WebSocket connection is managed by useWebSocketChat based on selectedPlaylistId and isPlaylistDataReadyForChat
    } else {
      setYouTubeVideos([]);
      // isPlaylistDataReadyForChat remains false, useWebSocketChat will see selectedPlaylistId is null/empty
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  /**
   * Refreshes the items for the currently selected playlist and re-initializes chat if connected.
   */
  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null);
      setYouTubeErrorAppLevel(null);
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId);
      if (fetchSuccess) {
        // Re-triggering chat initialization is handled by useWebSocketChat's
        // dependency on selectedPlaylistId, if it needs to re-init.
        // Or, if explicit re-init is needed, useWebSocketChat could expose a function.
        // For now, assuming selection change or this refresh implies re-sync.
        if (setPopup) setPopup({visible: true, message: 'Playlist refreshed.', type: 'info'});
        setTimeout(() => {
          if (setPopup) setPopup((p) => ({...p, visible: false}));
        }, 2000);
      }
    } else {
      if (setPopup) setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
      setTimeout(() => {
        if (setPopup) setPopup((p) => ({...p, visible: false}));
      }, 3000);
    }
  };

  // handleQuerySubmit is now provided by useWebSocketChat

  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />}
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />}
      <header className="App-header">
        <h1 className="app-header-title">ReelWorthy</h1>
        <div className="header-login-control">
          {authChecked && !isLoggedIn && <LoginButton onLogin={handleFirebaseLogin} />}
          {authChecked && isLoggedIn && (
            <button onClick={handleFirebaseLogout} className='auth-button'>
              Logout
            </button>
          )}
        </div>
      </header>
      <main>
        {error && <p style={{color: 'red', fontWeight: 'bold'}}>App Error: {error}</p>}
        {/* appAuthorizationError and youtubeSpecificError are now handled by ConnectYouTubeView or MainAuthenticatedView if still relevant */}

        {!authChecked && null /* Primary loading handled by showOverlay with LoadingOverlay */}

        {authChecked && !isLoggedIn && (
          <UserStatusMessages isLoggedIn={isLoggedIn} authChecked={authChecked} />
        )}

        {isLoggedIn && !isAuthorizedUser && authChecked && (
          <UserStatusMessages
            currentUser={currentUser}
            isLoggedIn={isLoggedIn}
            isAuthorizedUser={isAuthorizedUser}
            authChecked={authChecked}
          />
        )}

        {isLoggedIn && isAuthorizedUser && !isYouTubeLinked && authChecked && (
          <ConnectYouTubeView
            onConnectYouTube={handleConnectYouTube}
            error={youtubeSpecificError}
            appAuthorizationError={appAuthorizationError}
          />
        )}

        {isLoggedIn && isAuthorizedUser && isYouTubeLinked && authChecked && (
          <MainAuthenticatedView
            userPlaylists={userPlaylists}
            selectedPlaylistId={selectedPlaylistId}
            onPlaylistSelection={handlePlaylistSelection}
            isLoadingYouTube={isLoadingYouTube}
            onRefreshPlaylist={refreshSelectedPlaylistItems}
            onQuerySubmit={handleQuerySubmit}
            isStreaming={isStreaming}
            activeOutputTab={activeOutputTab}
            onSetOutputTab={setActiveOutputTab}
            suggestedVideos={suggestedVideos}
            lastQuery={lastQuery}
            thinkingOutput={thinkingOutput}
            thinkingOutputContainerRef={thinkingOutputContainerRef}
          />
        )}
      </main>
    </div>
  );
}

export default App;
