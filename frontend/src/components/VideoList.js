import React, {useState} from 'react';
// Removed memo and FixedSizeList as we are removing virtualization

/**
 * Renders a list of videos.
 * @param {object} props - The component's props.
 * @param {Array<object>} props.videos - Array of video objects to display.
 * @returns {React.ReactElement} The rendered video list.
 */
function VideoList({videos}) {
  const [expandedDescriptions, setExpandedDescriptions] = useState({});

  if (!videos || videos.length === 0) {
    return <p>No videos to display.</p>;
  }

  const toggleDescription = (videoId) =>
    setExpandedDescriptions((prev) => ({
      ...prev, [videoId]: !prev[videoId],
    }));

  const renderDescription = (video, videoId) => {
    const description = video.description || 'No description';
    const isExpanded = expandedDescriptions[videoId];
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

export default VideoList;
