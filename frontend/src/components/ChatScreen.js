/**
 * @fileoverview Defines the ChatScreen React component, which serves as a container
 * for the chat interaction view (`ChatViewContent`).
 */
import React from 'react';
// ScreenHeader is now rendered by App.js
import {ChatViewContent} from './ChatViewContent';

/**
 * Renders the content for the Chat screen for a selected playlist.
 * The header is now handled by App.js.
 * @param {object} props - The component's props, passed down from App.js.
 * @param {string} props.selectedPlaylistId - The ID of the currently selected YouTube playlist.
 * @param {Array<object>} props.userPlaylists - The list of the user's YouTube playlists.
 * @param {function(string): void} props.onQuerySubmit - Handler for submitting a chat query.
 * @param {boolean} props.isStreaming - Whether the chat response is streaming.
 * @param {string} props.activeOutputTab - The active tab in the output section ('suggestions' or 'Thinking').
 * @param {function(string): void} props.onSetOutputTab - Handler to set the active output tab.
 * @param {Array<{id: string, title: string, channelTitle: string, publishedAt: string, description: string, thumbnailUrl: string}>} props.suggestedVideos - Array of suggested video objects.
 * @param {string} props.lastQuery - The last submitted query.
 * @param {string} props.thinkingOutput - The AI's thinking process output (internal thoughts).
 * @param {string} props.dataReceptionIndicator - String of '#' indicating data chunks received.
 * @param {React.RefObject<HTMLDivElement>} props.thinkingOutputContainerRef - Ref for the thinking output container.
 * @returns {JSX.Element} The rendered Chat screen.
 */
function ChatScreen(props) {
  // selectedPlaylistId and userPlaylists are still passed in for ChatViewContent,
  // but onNavigate, playlistTitle, handleSettingsClick, handleBackClick are removed
  // as the header is now managed by App.js.
  // All props are effectively for ChatViewContent now.
  // Explicitly destructure all props needed by ChatViewContent
  const {
    selectedPlaylistId,
    userPlaylists,
    onQuerySubmit,
    isStreaming,
    activeOutputTab,
    onSetOutputTab,
    suggestedVideos,
    lastQuery,
    thinkingOutput,
    dataReceptionIndicator, // Changed from responsesReceivedCount
    thinkingOutputContainerRef,
    // Note: responsesReceivedCount was removed from App.js props, replaced by dataReceptionIndicator.
    // If any other props were intended to be passed via ...chatViewProps, they should be added here.
  } = props;

  console.log('[ChatScreen] All props received:', props);
  // console.log('[ChatScreen] chatViewProps being spread:', chatViewProps); // No longer using chatViewProps

  return (
    <div className="chat-screen"> {/* This root div might need adjustment or removal */}
      {/* <ScreenHeader title={playlistTitle} ... /> REMOVED */}
      <div className="chat-screen-content">
        <ChatViewContent
          selectedPlaylistId={selectedPlaylistId}
          userPlaylists={userPlaylists}
          onQuerySubmit={onQuerySubmit}
          isStreaming={isStreaming}
          activeOutputTab={activeOutputTab}
          onSetOutputTab={onSetOutputTab}
          suggestedVideos={suggestedVideos}
          lastQuery={lastQuery}
          thinkingOutput={thinkingOutput}
          dataReceptionIndicator={dataReceptionIndicator} // Changed prop
          thinkingOutputContainerRef={thinkingOutputContainerRef}
        />
      </div>
    </div>
  );
}

export {ChatScreen};
