/**
 * @fileoverview Defines the VideoList React component, which displays a list of
 * YouTube videos with their thumbnails, titles, durations, descriptions (expandable),
 * and a link to watch on YouTube.
 */
import React, {useState} from 'react';
// Removed memo and FixedSizeList as we are removing virtualization

/**
 * Renders a list of videos.
 * @param {object} props - The component's props.
 * @param {Array<{id?: string, videoId?: string, title: string, thumbnailUrl?: string, duration?: string, description?: string, reason?: string}>} props.videos - Array of video objects to display.
 * @returns {JSX.Element} The rendered video list.
 */
function VideoList({videos}) {
  /**
   * @state Manages the expanded/collapsed state of video descriptions, keyed by video ID.
   * @type {Object<string, boolean>}
   */
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  if (!videos || videos.length === 0) {
    return <p>No videos to display.</p>;
  }

  /**
   * Toggles the expanded state of a video's description.
   * @param {string} videoId - The ID of the video whose description state to toggle.
   * @returns {void}
   */
  const toggleDescription = (videoId) =>
    setExpandedDescriptions((prev) => ({
      ...prev, [videoId]: !prev[videoId],
    }));

  /**
   * Renders the description for a video, with a "More..."/"Less..." button
   * if the description exceeds a certain length.
   * @param {{id?: string, videoId?: string, title: string, thumbnailUrl?: string, duration?: string, description?: string, reason?: string}} video - The video object.
   * @param {string} videoId - The ID of the video (used as key for expansion state).
   * @returns {JSX.Element} The rendered video description.
   */
  const renderDescription = (video, videoId) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[videoId];
    // Maximum length for the truncated description.
    const maxLength = 150; // This can be adjusted or made responsive if needed
    if (description.length <= maxLength) {
      return <p className="video-description"><strong>Description:</strong> {description}</p>;
    }
    return (
      <p className="video-description">
        <strong>Description:</strong> {isExpanded ? description : `${description.substring(0, maxLength)}...`}
        <button onClick={() => toggleDescription(videoId)} className="more-less-button">
          {isExpanded ? 'Less...' : 'More...'}
        </button>
      </p>
    );
  };

  return (
    <ul className="video-list"> {/* Changed from List to ul, removed virtualization-specific props */}
      {videos.map((video) => {
        // Use video.videoId if available (from YouTube API for playlist items),
        // otherwise fallback to video.id (potentially for suggested videos if structure differs).
        const videoId = video.videoId || video.id;
        return (
          <li key={videoId} className="video-list-item"> {/* Using li for semantic list items */}
            {video.thumbnailUrl && (
              <img
                src={video.thumbnailUrl}
                alt={`Thumbnail for ${video.title}`}
                loading="lazy" // Keep lazy loading
                className="video-thumbnail"
              />
            )}
            <div className="video-details">
              <h4>{video.title}</h4>
              {video.duration && <p><strong>Duration:</strong> {video.duration}</p>}
              {renderDescription(video, videoId)}
              {video.reason && <p className="video-reason" style={{color: 'green', fontStyle: 'italic'}}><strong>Reason:</strong> {video.reason}</p>}
              <a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="watch-link" title="Watch on YouTube">
                ▶ Watch
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export {VideoList};
