import React, { useState, useEffect, useRef } from 'react';
import { Star, Download } from 'lucide-react';
import CachedImage from './CachedImage';

// Memoized to prevent unnecessary re-renders when other cards update
const StreamCard = React.memo(({ 
  stream, 
  showPlot, 
  onDoubleClick, 
  onContextMenu, 
  profileId, 
  cacheMap, 
  apiDebug, 
  fetchMetadata, 
  metadataCache, 
  sectionType, 
  onDownload, 
  isFavorite, 
  onToggleFavorite 
}) => {
  const [metadata, setMetadata] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const observerRef = useRef(null);

  // Lazy loading: Only mark as visible when it enters the viewport
  useEffect(() => {
    observerRef.current = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setIsVisible(true);
        if (observerRef.current) observerRef.current.disconnect();
      }
    }, { rootMargin: '200px' });

    if (cardRef.current) {
      observerRef.current.observe(cardRef.current);
    }

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  // Fetch metadata (plot/rating) only if visible and showPlot is toggled
  useEffect(() => {
    if (showPlot && isVisible && !metadata && (sectionType === 'vod' || sectionType === 'series')) {
      const id = stream.stream_id || stream.series_id;
      const cacheKey = `${sectionType}_${id}`;

      if (metadataCache[cacheKey]) {
        setMetadata(metadataCache[cacheKey]);
      } else {
        fetchMetadata(stream).then(data => {
          if (data) setMetadata(data);
        });
      }
    }
  }, [showPlot, isVisible, stream, fetchMetadata, metadata, metadataCache, sectionType]);

  const logo = stream.stream_icon || stream.cover;
  const name = stream.name || stream.title;
  const plot = metadata?.plot || metadata?.description || '';
  const year = metadata?.releasedate?.split('-')[0] || metadata?.release_date?.split('-')[0] || '';
  const rating = metadata?.rating || '';

  return (
    <div
      ref={cardRef}
      className="stream-card"
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{
        height: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '450px' : undefined,
        minHeight: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '400px' : undefined,
        maxHeight: showPlot && (sectionType === 'vod' || sectionType === 'series') ? '500px' : undefined
      }}
    >
      <CachedImage
        src={logo}
        alt={name}
        className="stream-logo"
        profileId={profileId}
        cacheMap={cacheMap}
        apiDebug={apiDebug}
      />
      
      <div className="stream-name">{name}</div>
      
      {/* Favorite Star */}
      {sectionType !== 'episode' && (
        <button
          className="favorite-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onToggleFavorite) onToggleFavorite(stream);
          }}
          style={{
            position: 'absolute', top: '5px', right: '5px',
            background: 'rgba(0, 0, 0, 0.5)', border: 'none', borderRadius: '50%',
            width: '24px', height: '24px', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 11
          }}
        >
          <Star size={14} fill={isFavorite ? "#ffd43b" : "none"} color={isFavorite ? "#ffd43b" : "#909296"} />
        </button>
      )}

      {/* Download Button */}
      {(sectionType === 'vod' || sectionType === 'series') && (
        <button
          className="download-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onDownload) onDownload(stream);
          }}
          title="Download"
        >
          <Download size={12} color="white" />
        </button>
      )}

      {/* Plot Section */}
      {showPlot && (sectionType === 'vod' || sectionType === 'series') && (
        <div className="stream-plot">
          {(year || rating) && (
            <div style={{ fontSize: '0.75rem', color: '#ffd43b', fontWeight: 'bold', marginBottom: '2px' }}>
              {year && <span>{year}</span>}
              {year && rating && <span> • </span>}
              {rating && <span>⭐ {rating}</span>}
            </div>
          )}
          {plot ? (
            <div className="plot-text-container">{plot}</div>
          ) : (
            <div className="no-plot-text">
              {metadata === null ? 'Loading...' : 'No description available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Optimization: Only re-render if key visual props change
  return (
    prevProps.stream.stream_id === nextProps.stream.stream_id &&
    prevProps.stream.series_id === nextProps.stream.series_id &&
    prevProps.showPlot === nextProps.showPlot &&
    prevProps.cacheMap === nextProps.cacheMap &&
    prevProps.metadataCache === nextProps.metadataCache &&
    prevProps.isFavorite === nextProps.isFavorite
  );
});

export default StreamCard;