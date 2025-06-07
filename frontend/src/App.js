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


/**
 * The main application component for ReelWorthy.
 * @returns {JSX.Element} The rendered App component.
 */
function App() {
  const thinkingOutputContainerRef = useRef(null);
  const [popup, setPopup] = useState({visible: false, message: '', type: ''});
  const [error, setError] = useState(null);
  const [isPlaylistDataReadyForChat, setIsPlaylistDataReadyForChat] = useState(false);
  const [currentScreen, setCurrentScreen] = useState('playlists');
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('');
  const [initialAutoNavAttempted, setInitialAutoNavAttempted] = useState(false);
  const [includeSubscriptionFeed, setIncludeSubscriptionFeed] = useState(() => {
    return localStorage.getItem('reelworthy_settings_includeSubscriptionFeed') === 'true';
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

  useEffect(() => {
    if (availableModels.length > 0) {
      const storedPreference = localStorage.getItem('preferredGeminiModel');
      if (storedPreference && availableModels.includes(storedPreference)) {
        setSelectedModelId(storedPreference);
      } else {
        const flashModel = availableModels.find((modelName) => modelName.toLowerCase().includes('flash'));
        const defaultToSet = flashModel || availableModels[0] || 'models/gemini-1.5-flash-latest'; // Changed let to const
        if (defaultToSet) {
          setSelectedModelId(defaultToSet);
          localStorage.setItem('preferredGeminiModel', defaultToSet);
        }
      }
    }
  }, [availableModels]);

  const handleModelSelection = (newModelId) => {
    setSelectedModelId(newModelId);
    localStorage.setItem('preferredGeminiModel', newModelId);
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
      navigateTo('chat');
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
    dataReceptionIndicator, // Changed from responsesReceivedCount
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
    setActiveOutputTab('Thinking');
    originalHandleQuerySubmit(query);
  };

  const showOverlay = isLoadingAuth || isLoadingYouTube;
  const prevIsStreaming = useRef(isStreaming);

  useEffect(() => {
    if (prevIsStreaming.current && !isStreaming) {
      if (suggestedVideos && suggestedVideos.length > 0) {
        setActiveOutputTab('suggestions');
      }
    }
    prevIsStreaming.current = isStreaming;
  }, [isStreaming, suggestedVideos, setActiveOutputTab]);

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
    setYouTubeUserPlaylists, setSelectedPlaylistId, setYouTubeVideos, setCurrentScreen,
  ]);

  useEffect(() => {
    if (authChecked) {
      if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked) {
        setCurrentScreen('login');
      }
    }
  }, [authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked, currentScreen]);

  useEffect(() => {
    const useDefaultEnabled = localStorage.getItem('reelworthy_useDefaultPlaylistEnabled') === 'true';
    const storedDefaultPlaylistId = localStorage.getItem('reelworthy_defaultPlaylistId');

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
          if (currentScreen !== 'chat') {
            if (selectedPlaylistId === storedDefaultPlaylistId && isPlaylistDataReadyForChat) {
              navigateTo('chat');
            } else if (selectedPlaylistId !== storedDefaultPlaylistId || !isPlaylistDataReadyForChat) {
              console.log(`Auto-loading default playlist: ${storedDefaultPlaylistId}`);
              handleSelectPlaylistFromList(storedDefaultPlaylistId);
            }
          }
        } else {
          console.warn('Default playlist from localStorage not found. Clearing default settings.');
          localStorage.removeItem('reelworthy_defaultPlaylistId');
          localStorage.removeItem('reelworthy_useDefaultPlaylistEnabled');
          if (currentScreen === 'login') navigateTo('playlists');
        }
      }
    } else if (currentScreen === 'login') {
      navigateTo('playlists');
    }
    setInitialAutoNavAttempted(true);
  }, [
    authChecked, isLoggedIn, isAuthorizedUser, isYouTubeLinked,
    userPlaylists, currentScreen, handleSelectPlaylistFromList,
    selectedPlaylistId, isPlaylistDataReadyForChat, navigateTo,
    initialAutoNavAttempted,
  ]);

  useEffect(() => {
    if (activeOutputTab === 'Thinking' && thinkingOutputContainerRef.current) {
      thinkingOutputContainerRef.current.scrollTop = thinkingOutputContainerRef.current.scrollHeight;
    }
  }, [thinkingOutput, dataReceptionIndicator, activeOutputTab]); // Changed dependency

  const renderScreenContent = () => {
    if (!authChecked) return null;
    if (!isLoggedIn) return <LoginScreen onLogin={handleFirebaseLogin} />;
    if (!isAuthorizedUser) return <UserStatusMessages currentUser={currentUser} isLoggedIn={isLoggedIn} isAuthorizedUser={isAuthorizedUser} authChecked={authChecked} appAuthorizationError={appAuthorizationError} />;
    if (!isYouTubeLinked) return <ConnectYouTubeView onConnectYouTube={handleConnectYouTube} error={youtubeSpecificError} />;

    switch (currentScreen) {
      case 'playlists':
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
      case 'chat':
        if (!selectedPlaylistId) {
          return (
            <div style={{padding: '20px', textAlign: 'center'}}>
              <h2>Chat</h2>
              <p>Please select a playlist from the 'Playlists' screen first.</p>
              <button onClick={() => navigateTo('playlists')}>Go to Playlists</button>
            </div>
          );
        }
        console.log('[App.js] Rendering ChatScreen with dataReceptionIndicator:', dataReceptionIndicator); // Correctly placed log, updated variable name
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
            dataReceptionIndicator={dataReceptionIndicator} // Changed prop
            thinkingOutputContainerRef={thinkingOutputContainerRef}
          />
        );
      case 'settings':
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
        if (currentScreen !== 'login') {
          console.warn(`Unknown screen: ${currentScreen}, defaulting to playlists.`);
        }
        return <PlaylistsScreen userPlaylists={userPlaylists} onSelectPlaylist={handleSelectPlaylistFromList} />;
    }
  };

  const renderCurrentScreenHeader = () => {
    if (!isLoggedIn || !isAuthorizedUser || !isYouTubeLinked || currentScreen === 'login') return null;
    if (isLoggedIn && !isAuthorizedUser) return null;
    if (isLoggedIn && isAuthorizedUser && !isYouTubeLinked) return null;

    let title = '';
    const onLeftIconClick = null;
    const onRightIconClick = null;

    if (currentScreen === 'playlists') title = 'Playlists';
    else if (currentScreen === 'chat') {
      const selected = userPlaylists.find((p) => p.id === selectedPlaylistId);
      title = selected ? `Playlist: ${selected.title}` : 'Chat';
    } else if (currentScreen === 'settings') title = 'Settings';
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
