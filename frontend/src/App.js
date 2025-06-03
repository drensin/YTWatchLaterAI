/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import useAuth from './hooks/useAuth';
import useYouTube from './hooks/useYouTube';
import useWebSocketChat from './hooks/useWebSocketChat';

import LoadingOverlay from './components/LoadingOverlay';
import StatusPopup from './components/StatusPopup';
import ScreenHeader from './components/ScreenHeader'; // Import ScreenHeader

// Import screen content components
import LoginScreen from './components/LoginScreen';
import ConnectYouTubeView from './components/ConnectYouTubeView';
import UserStatusMessages from './components/UserStatusMessages';
import BottomNavigationBar from './components/BottomNavigationBar';
import PlaylistsScreen from './components/PlaylistsScreen';
import ChatScreen from './components/ChatScreen';


/**
 * The main application component for ReelWorthy.
 */
function App() {
  /** @type {React.RefObject<HTMLDivElement>} Reference to the DOM element that displays the AI's thinking process, used for auto-scrolling. */
  const thinkingOutputContainerRef = useRef(null);

  /** @state Manages the visibility, message, and type of status popups. */
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  /** @state Stores any general error messages to be displayed. */
  const [error, setError] = useState(null);
  /** @state Flag indicating if the selected playlist's items are loaded and ready for chat interaction. */
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  /** @state Tracks the currently active screen/view in the application. */
  const [currentScreen, setCurrentScreen] = useState('playlists');

  /**
   * Navigates to the specified screen.
   * @param {string} screen - The name of the screen to navigate to.
   */
  const navigateTo = (screen) => {
    setCurrentScreen(screen);
  };

  // Authentication-related state and handlers.
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

  // YouTube API interaction state and handlers.
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

  // WebSocket chat functionality state and handlers.
  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit: originalHandleQuerySubmit,
  } = useWebSocketChat(selectedPlaylistId, isPlaylistDataReadyForChat, setPopup, setError);

  /**
   * Handles the submission of a new query to the chat, setting the active output tab to 'Thinking'.
   * @param {string} query - The user's query.
   */
  const handleQuerySubmit = (query) => {
    setActiveOutputTab('Thinking');
    originalHandleQuerySubmit(query);
  };

  /** @type {boolean} Boolean flag to determine if the loading overlay should be shown. */
  const showOverlay = isLoadingAuth || isLoadingYouTube;

  /** @type {React.RefObject<boolean>} Reference to the previous streaming state, used to detect when streaming ends. */
  const prevIsStreaming = useRef(isStreaming);

  // Handles UI changes when AI response streaming ends, like switching to the suggestions tab.
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab('suggestions');
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

  // Fetches user playlists when authenticated and YouTube is linked, or resets state if not.
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      setCurrentScreen('login');
    }
  }, [
    isLoggedIn, isAuthorizedUser, isYouTubeLinked, userPlaylists.length,
    isLoadingYouTube, youtubeSpecificError, appAuthorizationError, fetchUserPlaylists,
    setYouTubeUserPlaylists, setSelectedPlaylistId, setYouTubeVideos,
  ]);

  // Manages navigation based on authentication and YouTube link status.
  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen('login');
      } else if (currentScreen === 'login' && isLoggedIn && isAuthorizedUser && isYouTubeLinked) {
        setCurrentScreen('playlists');
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);


  // Auto-scrolls the thinking output container when new content is added.
  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, activeOutputTab]);

  /**
   * Handles playlist selection changes within the chat interface.
   * Fetches items for the newly selected playlist.
   * @param {React.SyntheticEvent} event - The selection event, typically from a dropdown.
   */
  const handlePlaylistSelectionInChat = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(newPlaylistId);
    setError(null); // Clear previous general errors
    setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
      }
    } else {
      // If no playlist is selected (e.g., "Select a playlist" option)
      setYouTubeVideos([]); // Clear videos
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  /**
   * Handles playlist selection from the main playlists screen.
   * Fetches items for the selected playlist and navigates to the chat screen.
   * @param {string} playlistId - The ID of the selected playlist.
   */
  const handleSelectPlaylistFromList = useCallback(async (playlistId) => {
    if (!playlistId) {
      // Should not happen if playlists are always present, but good for robustness
      return;
    }
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(playlistId);
    setError(null); // Clear previous general errors
    setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
    const fetchSuccess = await fetchPlaylistItems(playlistId);
    if (fetchSuccess) {
      setIsPlaylistDataReadyForChat(true);
      navigateTo('chat');
    } else {
      // Error handled by useYouTube hook via setPopup
      // Optionally, show a generic popup here if specific error handling in hook is not enough
      setPopup({visible: true, message: 'Failed to load playlist items.', type: 'error'});
      setTimeout(() => {
        setPopup((p) => ({...p, visible: false}));
      }, 3000);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, navigateTo, setIsPlaylistDataReadyForChat, setError, setYouTubeErrorAppLevel, setPopup]);

  /**
   * Refreshes the items for the currently selected playlist.
   * Shows a status popup on success or if no playlist is selected.
   */
  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null); // Clear previous general errors
      setYouTubeErrorAppLevel(null); // Clear previous YouTube specific errors
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
        // Show success feedback
        if (setPopup) {
          setPopup({visible: true, message: 'Playlist refreshed.', type: 'info'});
        }
        setTimeout(() => {
          if (setPopup) {
            setPopup((p) => ({...p, visible: false}));
          }
        }, 2000);
      }
      // If fetchSuccess is false, error is handled by useYouTube hook via setPopup
    } else {
      // If no playlist is selected
      if (setPopup) {
        setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
      }
      setTimeout(() => {
        if (setPopup) {
          setPopup((p) => ({...p, visible: false}));
        }
      }, 3000);
    }
  };

  /**
   * Renders the content for the current active screen.
   * This function determines which main view to display based on the application's
   * authentication state, YouTube link status, and the `currentScreen` state.
   * @returns {JSX.Element|null} The JSX element for the current screen, or null if
   * authentication check is not complete.
   */
  const renderScreenContent = () => {
    // Wait for authentication check to complete before rendering anything
    if (!authChecked) {
      return null; // Or a global loading indicator
    }

    // Render login screen if user is not logged in
    if (!isLoggedIn) {
      return <LoginScreen onLogin={handleFirebaseLogin} />;
    }

    // Render status messages if user is logged in but not authorized
    if (!isAuthorizedUser) {
      return <UserStatusMessages currentUser={currentUser} isLoggedIn={isLoggedIn} isAuthorizedUser={isAuthorizedUser} authChecked={authChecked} />;
    }

    // Render YouTube connection view if user is authorized but YouTube is not linked
    if (!isYouTubeLinked) {
      return <ConnectYouTubeView onConnectYouTube={handleConnectYouTube} error={youtubeSpecificError} appAuthorizationError={appAuthorizationError} />;
    }

    // Main content rendering based on currentScreen
    switch (currentScreen) {
      case 'playlists':
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
      case 'chat':
        // If trying to access chat screen without a selected playlist, guide user back.
        if (!selectedPlaylistId) {
          return (
            <div style={{padding: '20px', textAlign: 'center'}}>
              <h2>Chat</h2>
              <p>Please select a playlist from the 'Playlists' screen first.</p>
              <button onClick={() => navigateTo('playlists')}>Go to Playlists</button>
            </div>
          );
        }
        // Render chat screen with all necessary props
        return (
          <ChatScreen
            userPlaylists={userPlaylists}
            selectedPlaylistId={selectedPlaylistId}
            onPlaylistSelection={handlePlaylistSelectionInChat}
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
        );
      case 'settings':
        // Placeholder for settings screen
        return <div style={{padding: '20px', textAlign: 'center'}}><h1>Settings</h1><p>Settings content will go here.</p><button onClick={handleFirebaseLogout}>Logout</button></div>;
      default:
        // Default to playlists screen if currentScreen is unrecognized
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
    }
  };

  /**
   * Renders the header for the current active screen.
   * The header title changes based on the current screen.
   * Navigation icons are currently not implemented in this header version.
   * @returns {JSX.Element|null} The JSX element for the screen header, or null if
   * no header should be displayed (e.g., on login or status screens).
   */
  const renderCurrentScreenHeader = () => {
    // Do not render header if user is not fully authenticated and YouTube linked
    if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
      return null;
    }

    // Do not render header on intermediate auth/status screens
    if (currentScreen === 'login' ||
        (isLoggedIn && !isAuthorizedUser) ||
        (isLoggedIn && isAuthorizedUser && !isYouTubeLinked)) {
      return null;
    }

    let title = '';
    // Left icon (e.g., back button) is not currently used in these primary screens.
    const onLeftIconClick = null;
    // Right icon (e.g., settings or other actions) is not currently used.
    const onRightIconClick = null;

    // Determine title based on the current screen
    if (currentScreen === 'playlists') {
      title = 'Playlists';
    } else if (currentScreen === 'chat') {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? `Playlist: ${selected.title}` : 'Chat'; // Updated title format
    } else if (currentScreen === 'settings') {
      title = 'Settings';
    } else {
      // Should not happen if currentScreen is always valid, but as a fallback:
      return null;
    }

    return (
      <ScreenHeader
        title={title}
        onLeftIconClick={onLeftIconClick}
        onRightIconClick={onRightIconClick}
      />
    );
  };

  // Main application layout
  return (
    <div className="App">
      {showOverlay && <LoadingOverlay />}
      {popup.visible && <StatusPopup message={popup.message} type={popup.type} />}

      {renderCurrentScreenHeader()}

      <div className="screen-content-wrapper">
        {error && <p style={{color: 'red', fontWeight: 'bold', padding: '10px'}}>{error}</p>}
        {renderScreenContent()}
      </div>

      {isLoggedIn && isAuthorizedUser && isYouTubeLinked &&
        <BottomNavigationBar currentScreen={currentScreen} onNavigate={navigateTo} />}
    </div>
  );
}

export default App;
