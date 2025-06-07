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
 * @param {(query: string) => void} props.onQuerySubmit - Handler for submitting a chat query.
 * @param {boolean} props.isStreaming - Whether the chat response is streaming.
 * @param {string} props.activeOutputTab - The active tab in the output section ('suggestions' or 'Thinking').
 * @param {(tabName: string) => void} props.onSetOutputTab - Handler to set the active output tab.
 * @param {Array<{id: string, title: string, channelTitle: string, publishedAt: string, description: string, thumbnailUrl: string}>} props.suggestedVideos - Array of suggested video objects.
 * @param {string} props.lastQuery - The last submitted query.
 * @param {string} props.thinkingOutput - The AI's thinking process output (internal thoughts).
 * @param {string} props.responseBuildUp - The accumulating main response text from the AI.
 * @param {React.RefObject<HTMLDivElement>} props.thinkingOutputContainerRef - Ref for the thinking output container.
 * @returns {JSX.Element} The rendered Chat screen.
 */
function ChatScreen(props) {
  // selectedPlaylistId and userPlaylists are still passed in for ChatViewContent,
  // but onNavigate, playlistTitle, handleSettingsClick, handleBackClick are removed
  // as the header is now managed by App.js.
  // All props are effectively for ChatViewContent now.
  const {
    selectedPlaylistId,
    userPlaylists,
    /* other props for ChatViewContent */
    ...chatViewProps
  } = props;


  return (
    <div className="chat-screen"> {/* This root div might need adjustment or removal */}
      {/* <ScreenHeader title={playlistTitle} ... /> REMOVED */}
      <div className="chat-screen-content">
        <ChatViewContent
          selectedPlaylistId={selectedPlaylistId}
          userPlaylists={userPlaylists}
          {...chatViewProps}
        />
      </div>
    </div>
  );
}

export {ChatScreen};
