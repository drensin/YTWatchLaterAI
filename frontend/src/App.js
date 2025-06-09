/**
 * @fileoverview This file defines the main React application component for ReelWorthy.
 * It handles user authentication, YouTube API interactions, playlist management,
 * and the chat interface with the Gemini AI service.
 */
import React, {useState, useEffect, useCallback, useRef} from 'react';
import './App.css';
import {useAuth} from './hooks/useAuth';
import {useYouTube} from './hooks/useYouTube';
import {useWebSocketChat} from './hooks/useWebSocketChat';

import {LoadingOverlay} from './components/LoadingOverlay';
import {StatusPopup} from './components/StatusPopup';
import {ScreenHeader} from './components/ScreenHeader'; // Import ScreenHeader

// Import screen content components
import {LoginScreen} from './components/LoginScreen';
import {ConnectYouTubeView} from './components/ConnectYouTubeView';
import {UserStatusMessages} from './components/UserStatusMessages';
import {BottomNavigationBar} from './components/BottomNavigationBar';
import {PlaylistsScreen} from './components/PlaylistsScreen';
import {ChatScreen} from './components/ChatScreen';
import {SettingsScreen} from './components/SettingsScreen';

// --- Constants ---
// Screen Names
const SCREEN_LOGIN = 'login';
const SCREEN_PLAYLISTS = 'playlists';
const SCREEN_CHAT = 'chat';
const SCREEN_SETTINGS = 'settings';

// Output Tab Names
const TAB_THINKING = 'Thinking';
const TAB_SUGGESTIONS = 'suggestions';

// localStorage Keys
const LS_KEY_INCLUDE_FEED = 'reelworthy_settings_includeSubscriptionFeed';
const LS_KEY_PREFERRED_MODEL = 'preferredGeminiModel';
const LS_KEY_USE_DEFAULT_PLAYLIST = 'reelworthy_useDefaultPlaylistEnabled';
const LS_KEY_DEFAULT_PLAYLIST_ID = 'reelworthy_defaultPlaylistId';

/**
 * The main application component for ReelWorthy.
 * @returns {JSX.Element} The rendered App component.
 */
function App() {
  const thinkingOutputContainerRef = useRef(null);
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [error, setError] = useState(null);
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  const [currentScreen, setCurrentScreen] = useState(SCREEN_PLAYLISTS);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [initialAutoNavAttempted, setInitialAutoNavAttempted] = useState(false);
  const [includeSubscriptionFeed, setIncludeSubscriptionFeed] = useState(() => {
    return localStorage.getItem(LS_KEY_INCLUDE_FEED) === 'true';
  });

  const navigateTo = useCallback((screen) => {
    setCurrentScreen(screen);
  }, [setCurrentScreen]);

  const {
    currentUser,
    isLoggedIn,
    isAuthorizedUser,
    isYouTubeLinkedByAuthCheck,
    availableModels: fetchedModels,
    authChecked,
    appAuthorizationError,
    isLoadingAuth,
    handleFirebaseLogin,
    handleFirebaseLogout,
  } = useAuth(setPopup);

  /**
   * Filters fetched AI models to exclude TTS and vision models, updating availableModels state.
   * Runs when `fetchedModels` (from `useAuth`) changes.
   */
  useEffect(() => {
    if (fetchedModels && fetchedModels.length > 0) {
      const filteredModels = fetchedModels.filter((modelName) => {
        const lowerModelName = modelName.toLowerCase();
        return !lowerModelName.includes('tts') && !lowerModelName.includes('vision');
      });
      setAvailableModels(filteredModels);
      if (filteredModels.length === 0 && fetchedModels.length > 0) {
        console.warn('All available models were filtered out (tts/vision). Check model list from backend if this is unexpected.');
      }
    } else if (fetchedModels) {
      setAvailableModels([]);
    }
  }, [fetchedModels]);

  /**
   * Sets the selected AI model based on stored preference or defaults when available models change.
   * Runs when `availableModels` state changes.
   */
  useEffect(() => {
    if (availableModels.length > 0) {
      const storedPreference = localStorage.getItem(LS_KEY_PREFERRED_MODEL);
      if (storedPreference && availableModels.includes(storedPreference)) {
        setSelectedModelId(storedPreference);
      } else {
        const flashModel = availableModels.find((modelName) => modelName.toLowerCase().includes('flash'));
        const defaultToSet = flashModel || availableModels[0] || 'models/gemini-1.5-flash-latest';
        if (defaultToSet) {
          setSelectedModelId(defaultToSet);
          localStorage.setItem(LS_KEY_PREFERRED_MODEL, defaultToSet);
        }
      }
    }
  }, [availableModels]);

  const handleModelSelection = (newModelId) => {
    setSelectedModelId(newModelId);
    localStorage.setItem(LS_KEY_PREFERRED_MODEL, newModelId);
    if (setPopup) {
      const modelDisplayName = newModelId.split('/').pop();
      setPopup({visible: true, message: `AI Model set to: ${modelDisplayName}`, type: 'info'});
      setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
    }
  };

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

  const handleSelectPlaylistFromList = useCallback(async (playlistId) => {
    if (!playlistId) {
      console.warn('handleSelectPlaylistFromList called with no playlistId');
      return;
    }
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(playlistId);
    setError(null);
    setYouTubeErrorAppLevel(null);
    const fetchSuccess = await fetchPlaylistItems(playlistId);
    if (fetchSuccess) {
      setIsPlaylistDataReadyForChat(true);
      navigateTo(SCREEN_CHAT);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, navigateTo, setIsPlaylistDataReadyForChat, setError, setYouTubeErrorAppLevel]);

  const handlePlaylistSelectionInChat = useCallback(async (event) => {
    const newPlaylistId = event.target.value;
    setIsPlaylistDataReadyForChat(false);
    setSelectedPlaylistId(newPlaylistId);
    setError(null);
    setYouTubeErrorAppLevel(null);
    if (newPlaylistId) {
      const fetchSuccess = await fetchPlaylistItems(newPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
      }
    } else {
      setYouTubeVideos([]);
    }
  }, [fetchPlaylistItems, setSelectedPlaylistId, setYouTubeVideos, setYouTubeErrorAppLevel, setError, setIsPlaylistDataReadyForChat]);

  const refreshSelectedPlaylistItems = async () => {
    if (selectedPlaylistId) {
      setError(null);
      setYouTubeErrorAppLevel(null);
      const fetchSuccess = await fetchPlaylistItems(selectedPlaylistId);
      if (fetchSuccess) {
        setIsPlaylistDataReadyForChat(true);
        if (setPopup) {
          setPopup({visible: true, message: 'Playlist refreshed.', type: 'info'});
          setTimeout(() => setPopup((p) => ({...p, visible: false})), 2000);
        }
      }
    } else {
      if (setPopup) {
        setPopup({visible: true, message: 'Please select a playlist first.', type: 'error'});
        setTimeout(() => setPopup((p) => ({...p, visible: false})), 3000);
      }
    }
  };

  const {
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    dataReceptionIndicator,
    activeOutputTab,
    setActiveOutputTab,
    isStreaming,
    handleQuerySubmit: originalHandleQuerySubmit,
  } = useWebSocketChat(
      selectedPlaylistId,
      isPlaylistDataReadyForChat,
      setPopup,
      setError,
      selectedModelId,
      currentUser?.uid,
      includeSubscriptionFeed,
  );

  const handleQuerySubmit = (query) => {
    setActiveOutputTab(TAB_THINKING);
    originalHandleQuerySubmit(query);
  };

  const showOverlay = isLoadingAuth || isLoadingYouTube;
  const prevIsStreaming = useRef(isStreaming);

  /**
   * Switches to the 'suggestions' tab when AI response streaming ends and videos are available.
   * Runs when `isStreaming`, `suggestedVideos`, or `setActiveOutputTab` changes.
   */
  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab(TAB_SUGGESTIONS);
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

  /**
   * Manages playlist fetching and navigation based on auth and YouTube link status.
   * Fetches playlists if user is logged in, authorized, YouTube linked, and playlists are empty.
   * Navigates to login screen and resets YouTube data if user is not logged in or authorized.
   * Runs when relevant auth, YouTube, or playlist states change.
   */
  useEffect(() => {
    if (isLoggedIn && isAuthorizedUser && isYouTubeLinked && userPlaylists.length === 0 && !isLoadingYouTube && !youtubeSpecificError && !appAuthorizationError) {
      fetchUserPlaylists();
    } else if (!isLoggedIn || !isAuthorizedUser) {
      setYouTubeUserPlaylists([]);
      setSelectedPlaylistId('');
      setYouTubeVideos([]);
      setCurrentScreen(SCREEN_LOGIN);
    }
  }, [
    isLoggedIn, isAuthorizedUser, isYouTubeLinked, userPlaylists.length,
    isLoadingYouTube, youtubeSpecificError, appAuthorizationError, fetchUserPlaylists,
    setYouTubeUserPlaylists, setSelectedPlaylistId, setYouTubeVideos, setCurrentScreen,
  ]);

  /**
   * Ensures user is on the login screen if initial auth checks complete and user is not fully authenticated/linked.
   * Runs when `authChecked` or other auth/link statuses change.
   * Note: `currentScreen` is in dependencies; care is taken to avoid loops.
   */
  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen(SCREEN_LOGIN);
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);

  /**
   * Handles automatic navigation to a default playlist or the chat screen on app load.
   * Checks localStorage for default playlist settings and navigates accordingly if conditions
   * (user authenticated, YouTube linked, playlists loaded) are met.
   * Runs when auth, YouTube, playlist, or screen states change.
   */
  useEffect(() => {
    const useDefaultEnabled = localStorage.getItem(LS_KEY_USE_DEFAULT_PLAYLIST) === 'true';
    const storedDefaultPlaylistId = localStorage.getItem(LS_KEY_DEFAULT_PLAYLIST_ID);

    if (!authChecked || !isLoggedIn || !isAuthorizedUser || !isYouTubeLinked || initialAutoNavAttempted) {
      return;
    }
    if (useDefaultEnabled && storedDefaultPlaylistId && userPlaylists.length === 0) {
      return;
    }

    if (useDefaultEnabled && storedDefaultPlaylistId) {
      if (userPlaylists.length > 0) {
        const defaultPlaylistExists = userPlaylists.some((p) => p.id === storedDefaultPlaylistId);
        if (defaultPlaylistExists) {
          if (currentScreen !== SCREEN_CHAT) {
            if (selectedPlaylistId === storedDefaultPlaylistId && isPlaylistDataReadyForChat) {
              navigateTo(SCREEN_CHAT);
            } else if (selectedPlaylistId !== storedDefaultPlaylistId || !isPlaylistDataReadyForChat) {
              console.log(`Auto-loading default playlist: ${storedDefaultPlaylistId}`);
              handleSelectPlaylistFromList(storedDefaultPlaylistId);
            }
          }
        } else {
          console.warn('Default playlist from localStorage not found. Clearing default settings.');
          localStorage.removeItem(LS_KEY_DEFAULT_PLAYLIST_ID);
          localStorage.removeItem(LS_KEY_USE_DEFAULT_PLAYLIST);
          if (currentScreen === SCREEN_LOGIN) navigateTo(SCREEN_PLAYLISTS);
        }
      }
    } else if (currentScreen === SCREEN_LOGIN) {
      navigateTo(SCREEN_PLAYLISTS);
    }
    setInitialAutoNavAttempted(true);
  }, [
    authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked,
    userPlaylists, currentScreen, handleSelectPlaylistFromList,
    selectedPlaylistId, isPlaylistDataReadyForChat, navigateTo,
    initialAutoNavAttempted,
  ]);

  /**
   * Auto-scrolls the 'Thinking' output container to the bottom when its content changes and the tab is active.
   * Runs when `thinkingOutput`, `dataReceptionIndicator`, or `activeOutputTab` changes.
   */
  useEffect(() => {
    if (activeOutputTab === TAB_THINKING && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, dataReceptionIndicator, activeOutputTab]);

  const renderScreenContent = () => {
    if (!authChecked) return null;
    if (!isLoggedIn) return <LoginScreen onLogin={handleFirebaseLogin} />;
    if (!isAuthorizedUser) return <UserStatusMessages currentUser={currentUser} isLoggedIn={isLoggedIn} isAuthorizedUser={isAuthorizedUser} authChecked={authChecked} appAuthorizationError={appAuthorizationError} />;
    if (!isYouTubeLinked) return <ConnectYouTubeView onConnectYouTube={handleConnectYouTube} error={youtubeSpecificError} />;

    switch (currentScreen) {
      case SCREEN_PLAYLISTS:
        return <PlaylistsScreen
          userPlaylists={userPlaylists}
          onSelectPlaylist={handleSelectPlaylistFromList}
          selectedPlaylistId={selectedPlaylistId}
        />;
      case SCREEN_CHAT:
        if (!selectedPlaylistId) {
          return (
            <div style={{padding: '20px', textAlign: 'center'}}>
              <h2>Chat</h2>
              <p>Please select a playlist from the 'Playlists' screen first.</p>
              <button onClick={() => navigateTo(SCREEN_PLAYLISTS)}>Go to Playlists</button>
            </div>
          );
        }
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
            dataReceptionIndicator={dataReceptionIndicator}
            thinkingOutputContainerRef={thinkingOutputContainerRef}
          />
        );
      case SCREEN_SETTINGS:
        return (
          <SettingsScreen
            selectedModelId={selectedModelId}
            availableModels={availableModels}
            onModelSelection={handleModelSelection}
            onLogout={handleFirebaseLogout}
            userPlaylists={userPlaylists}
            includeSubscriptionFeed={includeSubscriptionFeed}
            onIncludeSubscriptionFeedChange={setIncludeSubscriptionFeed}
          />
        );
      default:
        if (currentScreen !== SCREEN_LOGIN) {
          console.warn(`Unknown screen: ${currentScreen}, defaulting to playlists.`);
        }
        return <PlaylistsScreen
          userPlaylists={userPlaylists}
          onSelectPlaylist={handleSelectPlaylistFromList}
          selectedPlaylistId={selectedPlaylistId}
        />;
    }
  };

  const renderCurrentScreenHeader = () => {
    if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked || currentScreen === SCREEN_LOGIN) return null;
    if (isLoggedIn && !isAuthorizedUser) return null; // This condition is covered by the one above if !isAuthorizedUser implies !isYouTubeLinked
    if (isLoggedIn && isAuthorizedUser && !isYouTubeLinked) return null; // This condition is also covered by the first line

    let title = '';
    const onLeftIconClick = null;
    const onRightIconClick = null;

    if (currentScreen === SCREEN_PLAYLISTS) title = 'Playlists';
    else if (currentScreen === SCREEN_CHAT) {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? `Playlist: ${selected.title}` : 'Chat';
    } else if (currentScreen === SCREEN_SETTINGS) title = 'Settings';
    else return null;

    return <ScreenHeader title={title} onLeftIconClick={onLeftIconClick} onRightIconClick={onRightIconClick} />;
  };

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
