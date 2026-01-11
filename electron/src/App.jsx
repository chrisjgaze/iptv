import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Settings, RefreshCw, Play, Search, Copy, Download, Cast, ChevronRight, ChevronDown, X, User, Bug, Calendar, ArrowDown, ArrowUp, Star } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import CachedImage from './components/CachedImage';
import ProfileManager from './components/ProfileManager';

// Lazy-loading StreamCard component (memoized to prevent unnecessary re-renders)
const StreamCard = React.memo(({ stream, showPlot, onDoubleClick, onContextMenu, profileId, cacheMap, apiDebug, fetchMetadata, metadataCache, sectionType, onDownload, isFavorite, onToggleFavorite }) => {
  const [metadata, setMetadata] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef(null);
  const observerRef = useRef(null);

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

  useEffect(() => {
    if (showPlot && isVisible && !metadata && (sectionType === 'vod' || sectionType === 'series')) {
      const id = stream.stream_id || stream.series_id;
      const cacheKey = `${sectionType}_${id}`;

      // Check cache first
      if (metadataCache[cacheKey]) {
        setMetadata(metadataCache[cacheKey]);
      } else {
        // Fetch metadata
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
            position: 'absolute',
            top: '5px',
            right: '5px',
            background: 'rgba(0, 0, 0, 0.5)',
            border: 'none',
            borderRadius: '50%',
            width: '24px',
            height: '24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 11,
            transition: 'transform 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Star size={14} fill={isFavorite ? "#ffd43b" : "none"} color={isFavorite ? "#ffd43b" : "#909296"} />
        </button>
      )}

      {(sectionType === 'vod' || sectionType === 'series') && (
        <button
          className="download-btn"
          onClick={(e) => {
            e.stopPropagation();
            if (onDownload) onDownload(stream);
          }}
          style={{
            position: 'absolute',
            bottom: '-1px',
            right: '-1px',
            background: 'rgba(0, 0, 0, 0.7)',
            border: '1px solid var(--section-accent)',
            borderRight: 'none',
            borderBottom: 'none',
            borderRadius: '4px 0 4px 0',
            padding: '3px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s, transform 0.2s',
            zIndex: 10
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--section-accent)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
          title="Download"
        >
          <Download size={8} color="white" />
        </button>
      )}
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
            <div style={{
              fontSize: '0.7rem',
              color: '#c1c2c5',
              lineHeight: '1.3',
              flex: '1 1 0',
              minHeight: 0,
              overflow: 'auto'
            }}>
              {plot}
            </div>
          ) : (
            <div style={{ fontSize: '0.7rem', color: '#555', fontStyle: 'italic' }}>
              {metadata === null ? 'Loading...' : 'No description available'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if these specific props change
  return (
    prevProps.stream.stream_id === nextProps.stream.stream_id &&
    prevProps.stream.series_id === nextProps.stream.series_id &&
    prevProps.showPlot === nextProps.showPlot &&
    prevProps.cacheMap === nextProps.cacheMap &&
    prevProps.metadataCache === nextProps.metadataCache &&
    prevProps.isFavorite === nextProps.isFavorite
  );
});

function App() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [apiDebug, setApiDebug] = useState(true);

  // Section & Category State
  const [selectedSection, setSelectedSection] = useState('live'); // 'live', 'vod', 'series'
  const [allCategories, setAllCategories] = useState({ live: [], vod: [], series: [] });
  const [streams, setStreams] = useState([]); // CURRENT category streams
  const [selectedCategory, setSelectedCategory] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(false);
  const [playerMode, setPlayerMode] = useState('vlc');
  const [currentStream, setCurrentStream] = useState(null);

  const [castDevices, setCastDevices] = useState(['None']);
  const [selectedCastDevice, setSelectedCastDevice] = useState('None');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [tileSize, setTileSize] = useState(200);
  const [contextMenu, setContextMenu] = useState(null);
  const [seriesInfo, setSeriesInfo] = useState(null);
  const [activeSeason, setActiveSeason] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'details'
  const [accountInfo, setAccountInfo] = useState(null);
  const [imageCacheMap, setImageCacheMap] = useState({});
  const [showPlot, setShowPlot] = useState(false);
  const [metadataCache, setMetadataCache] = useState({}); // Cache for plot/metadata
  const [isRendering, setIsRendering] = useState(false); // Track if React is rendering
  const [displayCount, setDisplayCount] = useState(100); // Progressive rendering: start with 100 tiles
  const [yearFilter, setYearFilter] = useState('none'); // Year filter for streams
  const [sortByYear, setSortByYear] = useState(false); // Sort by year toggle
  const [downloads, setDownloads] = useState([]); // Active downloads list
  const [showDownloadManager, setShowDownloadManager] = useState(false); // Download manager visibility
  const [favorites, setFavorites] = useState([]); // List of favorite IDs for current profile

  // Sync favorites when profile changes
  useEffect(() => {
    if (currentProfile) {
      setFavorites(currentProfile.favorites || []);
    }
  }, [currentProfile?.id]);

  // --- API Actions ---

  const toggleFavorite = React.useCallback(async (stream) => {
    const id = (stream.stream_id || stream.series_id || stream.id || "").toString();
    if (!id) return;

    setFavorites(prev => {
      const isFav = prev.includes(id);
      const next = isFav ? prev.filter(favId => favId !== id) : [...prev, id];
      
      // Persist to config in background
      (async () => {
        if (currentProfile) {
          try {
            const config = await window.api.config.load();
            const profileIndex = config.profiles.findIndex(p => p.id === currentProfile.id);
            if (profileIndex !== -1) {
                config.profiles[profileIndex].favorites = next;
                await window.api.config.save(config);
            }
          } catch (e) {
            console.error("Failed to persist favorites", e);
          }
        }
      })();
      
      return next;
    });
  }, [currentProfile?.id]);

  const fetchCategories = async (section = selectedSection, bypassCache = false) => {
    if (!currentProfile || !selectedServer) return;
    setIsLoading(true);
    setStatus(`Loading ${section} categories...`);
    
    const actionMap = {
        live: 'get_live_categories',
        vod: 'get_vod_categories',
        series: 'get_series_categories'
    };

    const params = {
        server: selectedServer,
        username: currentProfile.username,
        password: currentProfile.password,
        action: actionMap[section],
        bypassCache
    };

    if (apiDebug) console.log(`[API DEBUG] Calling ${actionMap[section]} ${bypassCache ? '(Bypassing Cache)' : ''}`, params);

    try {
        const result = await window.api.xcApi(params);

        if (result.success) {
            if (apiDebug) console.log(`[API DEBUG] ${actionMap[section]} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
            let cats = Array.isArray(result.data) ? result.data : [];

            // Add synthetic "|EN| All" category for VOD
            if (section === 'vod') {
                const enCategories = cats.filter(cat => cat.category_name?.startsWith('|EN|'));
                if (enCategories.length > 0) {
                    const syntheticCategory = {
                        category_id: 'synthetic_en_all',
                        category_name: '|EN| All',
                        parent_id: 0
                    };
                    // Insert at the beginning
                    cats = [syntheticCategory, ...cats];
                }
            }

            setAllCategories(prev => ({ ...prev, [section]: cats }));
            setStatus(`Loaded ${cats.length || 0} ${section} categories.`);
        } else {
            if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Error:`, result.error);
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        if (apiDebug) console.error(`[API DEBUG] ${actionMap[section]} Exception:`, e);
        setStatus(`Exception: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchStreams = async (catId) => {
    if (!currentProfile || !selectedServer || !catId) return;
    setIsLoading(true);
    setStatus(`Loading streams...`);

    const t0 = performance.now();

    // Handle Favorites category
    if (catId === 'favorites') {
        const actionMap = {
            live: 'get_live_streams',
            vod: 'get_vod_streams',
            series: 'get_series'
        };

        try {
            // To show favorites, we ideally need all streams from all categories
            // which might be slow. A better way for XC API is often to fetch all,
            // but for now we'll fetch them from the current section's "all" if possible, 
            // or just rely on what's already loaded if the user has favorites.
            // Actually, the most reliable way is to fetch the full list for the section.
            const params = {
                server: selectedServer,
                username: currentProfile.username,
                password: currentProfile.password,
                action: actionMap[selectedSection]
            };

            const result = await window.api.xcApi(params);
            if (result.success) {
                const data = Array.isArray(result.data) ? result.data : [];
                // Use functional update or ensure we have latest favorites
                setFavorites(currentFavs => {
                    const favIdsSet = new Set(currentFavs);
                    const favStreams = data.filter(s => favIdsSet.has((s.stream_id || s.series_id || s.id)?.toString()));
                    
                    setStreams(favStreams);
                    setDisplayCount(100);
                    setStatus(`Loaded ${favStreams.length} favorites.`);
                    return currentFavs;
                });
            }
        } catch (e) {
            console.error("Failed to fetch favorites", e);
        } finally {
            setIsLoading(false);
            return;
        }
    }

    // Handle synthetic "|EN| All" category
    if (catId === 'synthetic_en_all' && selectedSection === 'vod') {
        if (apiDebug) console.log(`[API DEBUG] Fetching aggregated |EN| streams...`);

        try {
            const enCategories = allCategories.vod.filter(cat =>
                cat.category_name?.startsWith('|EN|') &&
                cat.category_id !== 'synthetic_en_all'
            );

            if (apiDebug) console.log(`[API DEBUG] Found ${enCategories.length} |EN| categories to aggregate`);

            let allStreams = [];
            for (const cat of enCategories) {
                const params = {
                    server: selectedServer,
                    username: currentProfile.username,
                    password: currentProfile.password,
                    action: 'get_vod_streams',
                    extraParams: { category_id: cat.category_id }
                };

                if (apiDebug) console.log(`[API DEBUG] Fetching streams from ${cat.category_name}...`);

                const result = await window.api.xcApi(params);
                if (result.success) {
                    const streams = Array.isArray(result.data) ? result.data : [];
                    if (apiDebug) console.log(`[API DEBUG] Got ${streams.length} streams from ${cat.category_name}`);
                    allStreams = [...allStreams, ...streams];
                }
            }

            const t1 = performance.now();
            if (apiDebug) console.log(`[API DEBUG] Aggregated ${allStreams.length} total streams from ${enCategories.length} categories (${(t1-t0).toFixed(1)}ms)`);

            // Remove duplicates by stream_id
            const uniqueStreams = Array.from(
                new Map(allStreams.map(s => [s.stream_id, s])).values()
            );

            if (apiDebug) console.log(`[API DEBUG] After deduplication: ${uniqueStreams.length} unique streams`);

            // Pre-check cache BEFORE setting streams
            const urls = uniqueStreams.map(s => s.stream_icon || s.cover || s.info?.movie_image).filter(u => !!u);
            let cacheResults = {};
            if (urls.length > 0) {
                const t2 = performance.now();
                if (apiDebug) console.log(`[IMG CACHE] Batch checking ${urls.length} images...`);
                try {
                    cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: currentProfile.id });
                    const t3 = performance.now();
                    const hitCount = Object.keys(cacheResults).length;
                    if (apiDebug) console.log(`[IMG CACHE] Batch check complete: ${hitCount}/${urls.length} cached (${(t3-t2).toFixed(1)}ms)`);
                } catch (e) {
                    console.error("Batch cache check failed", e);
                }
            }

            const t4 = performance.now();
            if (apiDebug) console.log(`[RENDER] Setting state... (${(t4-t0).toFixed(1)}ms)`);

            setIsRendering(true);

            setTimeout(() => {
                const t5 = performance.now();
                if (apiDebug) console.log(`[RENDER] Applying state update (${(t5-t0).toFixed(1)}ms)`);

                setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
                setStreams(uniqueStreams);
                setDisplayCount(100);

                requestAnimationFrame(() => {
                    const t6 = performance.now();
                    if (apiDebug) console.log(`[RENDER] Initial 100 tiles rendered (${(t6-t0).toFixed(1)}ms)`);
                    setIsRendering(false);

                    if (uniqueStreams.length > 100) {
                        const remaining = uniqueStreams.length - 100;
                        if (apiDebug) console.log(`[RENDER] Scheduling ${remaining} more tiles to load progressively...`);
                    }
                });

                setStatus(`Loaded ${uniqueStreams.length} aggregated |EN| streams.`);
            }, 0);

            setIsLoading(false);
            return;
        } catch (e) {
            if (apiDebug) console.error(`[API DEBUG] Aggregated fetch Exception:`, e);
            setStatus(`Exception: ${e.message}`);
            setIsLoading(false);
            return;
        }
    }

    // Normal category fetch
    const actionMap = {
        live: 'get_live_streams',
        vod: 'get_vod_streams',
        series: 'get_series'
    };

    const params = {
        server: selectedServer,
        username: currentProfile.username,
        password: currentProfile.password,
        action: actionMap[selectedSection],
        extraParams: { category_id: catId }
    };

    if (apiDebug) console.log(`[API DEBUG] Calling ${actionMap[selectedSection]} for category ${catId}`, params);

    try {
        const result = await window.api.xcApi(params);
        const t1 = performance.now();

        if (result.success) {
            if (apiDebug) console.log(`[API DEBUG] ${actionMap[selectedSection]} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}: ${result.data?.length || 0} items (${(t1-t0).toFixed(1)}ms)`, result.data);
            const data = Array.isArray(result.data) ? result.data : [];

            // Pre-check cache BEFORE setting streams to avoid double-render
            const urls = data.map(s => s.stream_icon || s.cover || s.info?.movie_image).filter(u => !!u);
            let cacheResults = {};
            if (urls.length > 0) {
                const t2 = performance.now();
                if (apiDebug) console.log(`[IMG CACHE] Batch checking ${urls.length} images...`);
                try {
                    cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: currentProfile.id });
                    const t3 = performance.now();
                    const hitCount = Object.keys(cacheResults).length;
                    if (apiDebug) console.log(`[IMG CACHE] Batch check complete: ${hitCount}/${urls.length} cached (${(t3-t2).toFixed(1)}ms)`);
                } catch (e) {
                    console.error("Batch cache check failed", e);
                }
            }

            const t4 = performance.now();
            if (apiDebug) console.log(`[RENDER] Setting state... (${(t4-t0).toFixed(1)}ms)`);

            // Show rendering indicator
            setIsRendering(true);

            // Use setTimeout to allow UI to breathe before heavy render
            setTimeout(() => {
                const t5 = performance.now();
                if (apiDebug) console.log(`[RENDER] Applying state update (${(t5-t0).toFixed(1)}ms)`);

                setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
                setStreams(data);
                setDisplayCount(100); // Reset to first 100 items

                // Schedule after-render check
                requestAnimationFrame(() => {
                    const t6 = performance.now();
                    if (apiDebug) console.log(`[RENDER] Initial 100 tiles rendered (${(t6-t0).toFixed(1)}ms)`);
                    setIsRendering(false); // Hide rendering indicator

                    // Auto-load remaining tiles progressively
                    if (data.length > 100) {
                        const remaining = data.length - 100;
                        if (apiDebug) console.log(`[RENDER] Scheduling ${remaining} more tiles to load progressively...`);
                    }
                });

                setStatus(`Loaded ${data.length || 0} streams.`);
            }, 0);
        } else {
            if (apiDebug) console.error(`[API DEBUG] ${actionMap[selectedSection]} Error:`, result.error);
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        if (apiDebug) console.error(`[API DEBUG] ${actionMap[selectedSection]} Exception:`, e);
        setStatus(`Exception: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchSeriesInfo = async (seriesId) => {
    if (!currentProfile || !selectedServer || !seriesId) return;
    setIsLoading(true);
    setStatus(`Fetching episodes...`);

    const params = {
        server: selectedServer,
        username: currentProfile.username,
        password: currentProfile.password,
        action: 'get_series_info',
        extraParams: { series_id: seriesId }
    };

    if (apiDebug) console.log(`[API DEBUG] Calling get_series_info for ID ${seriesId}`, params);

    try {
        const result = await window.api.xcApi(params);

        if (result.success) {
            if (apiDebug) console.log(`[API DEBUG] get_series_info Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);

            // Flatten all episodes to get their URLs for batch cache check
            const allEpisodes = [];
            Object.values(result.data.episodes || {}).forEach(season => {
                allEpisodes.push(...season);
            });

            // Pre-check cache BEFORE setting series info
            const urls = allEpisodes.map(ep => ep.info?.movie_image).filter(u => !!u);
            if (result.data.info?.cover) urls.push(result.data.info.cover);

            let cacheResults = {};
            if (urls.length > 0) {
                try {
                    cacheResults = await window.api.checkImageCacheBatch({ urls, profileId: currentProfile.id });
                } catch (e) {
                    console.error("Batch cache check failed", e);
                }
            }

            // Single state update with series info and cache map
            setImageCacheMap(prev => ({ ...prev, ...cacheResults }));
            setSeriesInfo(result.data);
            setViewMode('details');

            const seasonKeys = Object.keys(result.data.episodes || {}).sort((a,b) => parseInt(a)-parseInt(b));
            if (seasonKeys.length > 0) setActiveSeason(seasonKeys[0]);
            setStatus(`Loaded series: ${result.data.info?.name}`);
        } else {
            if (apiDebug) console.error(`[API DEBUG] get_series_info Error:`, result.error);
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        if (apiDebug) console.error(`[API DEBUG] get_series_info Exception:`, e);
        setStatus(`Exception: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchAccountInfo = async () => {
    if (!currentProfile || !selectedServer) return;
    setStatus('Fetching account info...');
    
    const params = {
        server: selectedServer,
        username: currentProfile.username,
        password: currentProfile.password,
        action: '' 
    };

    if (apiDebug) console.log(`[API DEBUG] Calling Account Info (action: '')`, params);

    try {
        const result = await window.api.xcApi(params);
        if (result.success) {
            if (apiDebug) console.log(`[API DEBUG] Account Info Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
            setAccountInfo(result.data);
            setStatus('Account info loaded.');
        } else {
            if (apiDebug) console.error(`[API DEBUG] Account Info Error:`, result.error);
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        if (apiDebug) console.error(`[API DEBUG] Account Info Exception:`, e);
        setStatus(`Exception: ${e.message}`);
    }
  };

  const backToList = () => {
    setSeriesInfo(null);
    setViewMode('list');
    setStatus('Ready');
  };

  // Download handler
  const handleDownload = async (stream) => {
    const streamUrl = getXcUrl(stream);
    const streamName = stream.name || stream.title || 'Unknown';

    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const newDownload = {
      id: downloadId,
      name: streamName,
      url: streamUrl,
      progress: 0,
      speed: '0 KB/s',
      status: 'queued', // queued, downloading, completed, error, cancelled
      error: null
    };

    setDownloads(prev => [...prev, newDownload]);
    setShowDownloadManager(true);

    // Start download
    if (window.api && window.api.startDownload) {
      try {
        await window.api.startDownload({
          id: downloadId,
          url: streamUrl,
          name: streamName,
          profileId: currentProfile?.id
        });
      } catch (err) {
        console.error('Download failed:', err);
        setDownloads(prev => prev.map(d =>
          d.id === downloadId
            ? { ...d, status: 'error', error: err.message }
            : d
        ));
      }
    }
  };

  const cancelDownload = async (downloadId) => {
    if (window.api && window.api.cancelDownload) {
      await window.api.cancelDownload({ id: downloadId });
    }
    setDownloads(prev => prev.map(d =>
      d.id === downloadId ? { ...d, status: 'cancelled' } : d
    ));
  };

  const removeDownload = async (downloadId) => {
    // Find the download to check its status
    const dl = downloads.find(d => d.id === downloadId);
    
    // If it's not finished, tell backend to cancel/remove it from queue
    if (dl && dl.status !== 'completed' && dl.status !== 'cancelled') {
      if (window.api && window.api.cancelDownload) {
        await window.api.cancelDownload({ id: downloadId });
      }
    }
    
    setDownloads(prev => prev.filter(d => d.id !== downloadId));
  };

  const moveDownload = (downloadId, direction) => {
    setDownloads(prev => {
      const index = prev.findIndex(d => d.id === downloadId);
      if (index === -1) return prev;

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= prev.length) return prev;

      const newDownloads = [...prev];
      [newDownloads[index], newDownloads[newIndex]] = [newDownloads[newIndex], newDownloads[index]];
      return newDownloads;
    });
  };

  // Listen for download progress updates
  useEffect(() => {
    if (!window.api || !window.api.onDownloadProgress) return;

    const handleProgress = (data) => {
      setDownloads(prev => prev.map(d =>
        d.id === data.id
          ? { ...d, progress: data.progress, speed: data.speed, status: data.status, error: data.error }
          : d
      ));

      // Auto-remove cancelled downloads after 2 seconds
      if (data.status === 'cancelled') {
        setTimeout(() => {
          setDownloads(prev => prev.filter(d => d.id !== data.id));
        }, 2000);
      }
    };

    window.api.onDownloadProgress(handleProgress);

    return () => {
      if (window.api.removeDownloadProgressListeners) {
        window.api.removeDownloadProgressListeners();
      }
    };
  }, []);

  // Lazy load metadata for a single stream (VOD or Series)
  const fetchStreamMetadata = async (stream) => {
    const id = stream.stream_id || stream.series_id;
    const cacheKey = `${selectedSection}_${id}`;

    // Already cached?
    if (metadataCache[cacheKey]) {
      return metadataCache[cacheKey];
    }

    const action = selectedSection === 'vod' ? 'get_vod_info' : 'get_series_info';
    const paramKey = selectedSection === 'vod' ? 'vod_id' : 'series_id';

    const params = {
        server: selectedServer,
        username: currentProfile.username,
        password: currentProfile.password,
        action,
        extraParams: { [paramKey]: id }
    };

    if (apiDebug) console.log(`[METADATA] Lazy loading ${action} for ID ${id}`, params);

    try {
        const t0 = performance.now();
        const result = await window.api.xcApi(params);
        const t1 = performance.now();

        if (result.success) {
            if (apiDebug) console.log(`[METADATA] ${action} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'} for ID ${id} (${(t1-t0).toFixed(1)}ms)`);
            const metadata = result.data.info || result.data;
            setMetadataCache(prev => ({ ...prev, [cacheKey]: metadata }));
            return metadata;
        } else {
            if (apiDebug) console.error(`[METADATA] ${action} Error for ID ${id}:`, result.error);
        }
    } catch (err) {
        if (apiDebug) console.error(`[METADATA] ${action} Exception for ID ${id}:`, err);
    }
    return null;
  };

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
        const config = await window.api.config.load();
        if (config.profiles?.length > 0) {
            const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            setCurrentProfile(active);
            setFavorites(active.favorites || []);
            if (active.servers?.length > 0) setSelectedServer(active.servers[0]);
        } else {
            setShowProfiles(true);
        }

        if (window.api.onCastDeviceFound) {
            window.api.onCastDeviceFound((name) => {
                setCastDevices(prev => {
                    if (prev.includes(name)) return prev;
                    const next = [...prev.filter(d => d !== 'None'), name];
                    setSelectedCastDevice(current => {
                        if (!current || current === 'None') return name;
                        return current;
                    });
                    return next;
                });
            });
            window.api.castScan();
        }
    };
    init();
  }, []);

  useEffect(() => {
    if (currentProfile && selectedServer) {
        fetchCategories('live');
        fetchCategories('vod');
        fetchCategories('series');
    }
  }, [currentProfile?.id, selectedServer]);

  useEffect(() => {
    if (selectedCategory) fetchStreams(selectedCategory);
    else setStreams([]);
  }, [selectedCategory, selectedSection]);

  // Reset displayCount when filters or sort changes
  useEffect(() => {
    setDisplayCount(100);
  }, [searchQuery, yearFilter, englishOnly, sortByYear]);

  // Progressive loading: gradually increase displayCount after initial render
  useEffect(() => {
    if (streams.length > displayCount && !isRendering) {
      const timer = setTimeout(() => {
        const newCount = Math.min(displayCount + 100, streams.length);
        if (apiDebug) console.log(`[RENDER] Loading ${newCount - displayCount} more tiles (${displayCount} -> ${newCount})`);
        setDisplayCount(newCount);
      }, 50); // Small delay between batches
      return () => clearTimeout(timer);
    }
  }, [streams.length, displayCount, isRendering, apiDebug]);

  // --- Helpers ---

  const getXcUrl = (stream, type = selectedSection) => {
    if (!stream || !currentProfile || !selectedServer) return null;
    const base = selectedServer.replace(/\/$/, "");
    const { username, password } = currentProfile;
    const id = stream.stream_id || stream.id;

    if (type === 'live') {
        return `${base}/${username}/${password}/${id}.ts`;
    } else if (type === 'vod' || type === 'episode') {
        const ext = stream.container_extension || 'mp4';
        const path = type === 'episode' ? 'series' : 'movie';
        return `${base}/${path}/${username}/${password}/${id}.${ext}`;
    }
    return null;
  };

  const getXcLogoUrl = (stream) => {
    const rawLogo = stream.stream_icon || stream.cover;
    if (!rawLogo || !selectedServer) return rawLogo;
    if (rawLogo.startsWith('http')) return rawLogo;
    const base = selectedServer.replace(/\/$/, "");
    return `${base}${rawLogo.startsWith('/') ? '' : '/'}${rawLogo}`;
  };

  const playStream = async (stream, type = selectedSection) => {
    if (type === 'series') {
        fetchSeriesInfo(stream.series_id);
        return;
    }
    const finalUrl = getXcUrl(stream, type);
    if (!finalUrl) return;
    
    if (playerMode === 'internal') {
        setCurrentStream({ ...stream, url: finalUrl });
    } else if (playerMode === 'cast') {
        const device = selectedCastDevice?.trim();
        if (!device || device === 'None' || device === '') {
            alert("No Chromecast selected. Please select a device from the dropdown.");
            return;
        }
        window.api.castPlay(device, finalUrl);
    } else {
        window.api.launchVLC(finalUrl, null, stream.name || stream.title);
    }
  };

  const handleVlcPathChange = async () => {
    if (window.api && window.api.selectVlcPath) {
        const newPath = await window.api.selectVlcPath();
        if (newPath) {
            const config = await window.api.config.load();
            config.vlcPath = newPath;
            await window.api.config.save(config);
            setStatus(`VLC path updated: ${newPath}`);
        }
    }
  };

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleContextMenu = async (e, stream) => {
    e.preventDefault();
    const id = stream.stream_id || stream.series_id || stream.id;
    const isEpisode = !!stream.episode_num;
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, stream, isLoading: !isEpisode });

    if (isEpisode) {
        setContextMenu(prev => ({ ...prev, info: stream.info || stream, isLoading: false }));
        return;
    }

    if (selectedSection === 'vod' || selectedSection === 'series') {
        const action = selectedSection === 'vod' ? 'get_vod_info' : 'get_series_info';
        const paramKey = selectedSection === 'vod' ? 'vod_id' : 'series_id';
        
        const params = {
            server: selectedServer,
            username: currentProfile.username,
            password: currentProfile.password,
            action,
            extraParams: { [paramKey]: id }
        };

        if (apiDebug) console.log(`[API DEBUG] Calling ${action} for ID ${id}`, params);

        try {
            const result = await window.api.xcApi(params);
            if (result.success) {
                if (apiDebug) console.log(`[API DEBUG] ${action} Result ${result.fromCache ? '(FROM CACHE)' : '(FRESH)'}:`, result.data);
                setContextMenu(prev => ({ ...prev, info: result.data.info, isLoading: false }));
            } else {
                if (apiDebug) console.error(`[API DEBUG] ${action} Error:`, result.error);
                setContextMenu(prev => ({ ...prev, isLoading: false }));
            }
        } catch (err) {
            if (apiDebug) console.error(`[API DEBUG] ${action} Exception:`, err);
            setContextMenu(prev => ({ ...prev, isLoading: false }));
        }
    } else {
        setContextMenu(prev => ({ ...prev, isLoading: false }));
    }
  };

  const copyToClipboard = (text) => {
    if (text) {
        navigator.clipboard.writeText(text);
        setStatus(`Copied to clipboard`);
    }
    handleCloseContextMenu();
  };

  const getSectionColor = () => {
    if (selectedSection === 'live') return '#ffd43b'; // Yellow
    if (selectedSection === 'vod') return '#40c057';  // Green
    if (selectedSection === 'series') return '#ff6b6b'; // Red
    return '#00d4ff'; 
  };

  // --- Logic ---

  const groupedCategories = useMemo(() => {
    const currentCats = allCategories[selectedSection] || [];
    const allowed = ["EN", "UK", "US", "GB", "CA", "MULTI", "NETFLIX", "APPLE+", "DISNEY+", "4K", "18", "24/7", "CHRISTMAS", "FORMULA", "FOR", "WORLDCUP", "BEIN", "WC", "NZ", "AU"];

    const filtered = currentCats.filter(c => {
        const nameUpper = (c.category_name || "").toUpperCase();
        if (searchQuery && !nameUpper.includes(searchQuery.toUpperCase())) return false;
        if (englishOnly) {
            const cleanName = nameUpper.replace(/^[|\s]+/, "");
            return allowed.some(word => cleanName.startsWith(word.toUpperCase() + "|") || cleanName.startsWith(word.toUpperCase() + " ") || cleanName === word.toUpperCase());
        }
        return true;
    });

    const groups = {};
    
    // Add synthetic Favorites category at the very top
    groups[" Favorites"] = [{
        category_id: 'favorites',
        category_name: '★ Favorites',
        parent_id: 0
    }];

    filtered.forEach(cat => {
        const name = cat.category_name || "";
        let prefix = "General";
        if (name.includes('|')) {
            const parts = name.split('|').map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length > 0) prefix = parts[0];
        } else {
            const firstWord = name.split(' ')[0];
            if (firstWord) prefix = firstWord;
        }
        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(cat);
    });
    return groups;
  }, [allCategories, selectedSection, searchQuery, englishOnly]);

  const { visibleStreams, totalFilteredCount } = useMemo(() => {
    let filtered = streams;
    const lowerQuery = searchQuery.toLowerCase();

    // Filter by Search Query
    if (searchQuery) {
        filtered = filtered.filter(s =>
            (s.name || s.title || "").toLowerCase().includes(lowerQuery)
        );
    }

    // Filter by English Only
    if (englishOnly) {
        const forbidden = ["SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH", "ITALIAN", "SPANISH"];
        filtered = filtered.filter(s => !forbidden.some(word => (s.name || s.title)?.toUpperCase().includes(word)));
    }

    // Filter by Year (looking for (YYYY) in title)
    if (yearFilter !== 'none') {
        filtered = filtered.filter(s => {
            const title = s.name || s.title || "";
            return title.includes(`(${yearFilter})`);
        });
    }

    // Sort by Year if toggle is ON
    if (sortByYear) {
        const extractYear = (stream) => {
            const title = stream.name || stream.title || "";
            const yearMatch = title.match(/\((\d{4})\)/);
            return yearMatch ? parseInt(yearMatch[1]) : null;
        };

        // Separate streams with years and without years
        const withYears = filtered.filter(s => extractYear(s) !== null);
        const withoutYears = filtered.filter(s => extractYear(s) === null);

        // Sort streams with years (newest first)
        withYears.sort((a, b) => {
            const yearA = extractYear(a);
            const yearB = extractYear(b);
            return yearB - yearA; // Descending order (newest first)
        });

        // Sort streams without years alphabetically
        withoutYears.sort((a, b) => {
            const nameA = (a.name || a.title || "").toLowerCase();
            const nameB = (b.name || b.title || "").toLowerCase();
            return nameA.localeCompare(nameB);
        });

        // Combine: years first, then alphabetical
        filtered = [...withYears, ...withoutYears];
    }

    const totalCount = filtered.length;

    // Progressive rendering: only show first displayCount items
    return {
      visibleStreams: filtered.slice(0, displayCount),
      totalFilteredCount: totalCount
    };
  }, [streams, englishOnly, searchQuery, yearFilter, sortByYear, displayCount]);

  return (
    <div className="container" onClick={handleCloseContextMenu} style={{ '--section-accent': getSectionColor() }}>
      <div className="header">
        <div 
            style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={fetchAccountInfo}
            title="Click for Account Info"
        >
            <User size={20} color={getSectionColor()} /> 
            <span className="rainbow-text">{currentProfile?.name || 'No Profile'}</span>
        </div>
        
        <div className="controls">
          <button className="btn" onClick={() => setShowProfiles(true)} style={{ background: 'transparent', border: 'none' }}><Settings size={16} /> Profiles</button>
          <div className="section-tabs">
            {[{ id: 'live', color: '#ffd43b' }, { id: 'vod', color: '#40c057' }, { id: 'series', color: '#ff6b6b' }].map(s => (
                <button 
                    key={s.id} 
                    className="btn section-btn" 
                    onClick={() => { setSelectedSection(s.id); setSelectedCategory(null); setViewMode('list'); setSeriesInfo(null); }} 
                    style={{ 
                        padding: '2px 12px', 
                        fontSize: '0.7rem', 
                        backgroundColor: selectedSection === s.id ? s.color : 'transparent', 
                        color: selectedSection === s.id ? '#000' : '#909296',
                        border: 'none'
                    }}
                >
                    {s.id.toUpperCase()}
                </button>
            ))}
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              opacity: (selectedSection === 'vod' || selectedSection === 'series') ? 1 : 0.3,
              pointerEvents: (selectedSection === 'vod' || selectedSection === 'series') ? 'auto' : 'none'
            }}
          >
            <input
              type="checkbox"
              checked={showPlot}
              onChange={(e) => setShowPlot(e.target.checked)}
              disabled={selectedSection === 'live'}
            />
            PLOT
          </label>
          <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} style={{ width: '150px' }}>
            {currentProfile?.servers?.map(url => <option key={url} value={url}>{url}</option>)}
          </select>
          <button className="btn" onClick={() => fetchCategories(selectedSection, true)}><RefreshCw size={16} className={isLoading ? 'spin' : ''} /></button>
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
            <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} /> EN
          </label>

          <button
            className="btn"
            onClick={() => {
                setApiDebug(!apiDebug);
                setStatus(`API Debug: ${!apiDebug ? 'ON' : 'OFF'}`);
            }}
            style={{
                background: 'transparent',
                border: 'none',
                color: apiDebug ? '#ff6b6b' : '#909296',
                display: 'flex',
                alignItems: 'center',
                padding: '4px'
            }}
            title="Toggle API Debug"
          >
            <Bug size={16} />
          </button>
          <button
            className="btn"
            onClick={() => setShowDownloadManager(!showDownloadManager)}
            style={{
              background: 'transparent',
              border: 'none',
              color: downloads.some(d => d.status === 'downloading') ? '#40c057' : '#909296',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px',
              position: 'relative'
            }}
            title="Download Manager"
          >
            <ArrowDown size={16} />
            {downloads.filter(d => d.status !== 'completed' && d.status !== 'cancelled').length > 0 && (
              <span style={{
                fontSize: '0.7rem',
                background: downloads.some(d => d.status === 'downloading') ? '#40c057' : '#909296',
                color: '#000',
                borderRadius: '50%',
                width: '18px',
                height: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold'
              }}>
                {downloads.filter(d => d.status !== 'completed' && d.status !== 'cancelled').length}
              </span>
            )}
          </button>
        </div>

        <div style={{ flex: 1 }}></div>

        <div className="controls">
            <div className="player-selector" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {['vlc', 'internal', 'cast'].map(m => (
                    <React.Fragment key={m}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem' }}>
                            <input type="radio" checked={playerMode === m} onChange={() => setPlayerMode(m)} /> 
                            <span onClick={m === 'vlc' ? handleVlcPathChange : undefined} style={{ cursor: m === 'vlc' ? 'pointer' : 'inherit' }}>{m.toUpperCase()}</span>
                        </label>
                        {m === 'cast' && playerMode === 'cast' && (
                            <select value={selectedCastDevice} onChange={(e) => setSelectedCastDevice(e.target.value)} style={{ padding: '1px 4px', fontSize: '0.65rem', width: '100px', marginLeft: '2px', height: '20px' }}>
                                {castDevices.map(name => <option key={name} value={name}>{name}</option>)}
                            </select>
                        )}
                    </React.Fragment>
                ))}
            </div>
            <input type="range" min="100" max="400" value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: '60px' }} />
            <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 6, top: 8, color: '#888' }} />
                <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '24px', width: '150px' }} />
            </div>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} style={{ width: '80px', fontSize: '0.75rem' }}>
                <option value="none">Year</option>
                {Array.from({ length: new Date().getFullYear() - 1950 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                ))}
            </select>
            <button
                className="btn"
                onClick={() => setSortByYear(!sortByYear)}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: sortByYear ? getSectionColor() : '#909296',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px'
                }}
                title={sortByYear ? "Sort by year ON (newest first)" : "Sort by year OFF (natural order)"}
            >
                <Calendar size={16} />
            </button>
        </div>
      </div>

      <div className="main-content">
        {showProfiles && <ProfileManager onClose={() => setShowProfiles(false)} onProfileChanged={setCurrentProfile} />}
        <div className="sidebar">
          <div className="sidebar-header">Categories</div>
          <div className="sidebar-list">
            {Object.entries(groupedCategories).sort().map(([prefix, cats]) => (
                <div key={prefix}>
                    <div className="group-header" onClick={() => setExpandedGroups(p => ({...p, [prefix]: !p[prefix]}))}>
                        {expandedGroups[prefix] ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {prefix}
                    </div>
                    {expandedGroups[prefix] && cats.map(cat => (
                        <div key={cat.category_id} className={`category-item ${selectedCategory === cat.category_id ? 'active' : ''}`} onClick={() => { setSelectedCategory(cat.category_id); setViewMode('list'); setSeriesInfo(null); }} style={{ paddingLeft: '32px' }}>
                            {cat.category_name}
                        </div>
                    ))}
                </div>
            ))}
          </div>
        </div>

        <div className="content-area">
          <div className="sidebar-header" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {viewMode === 'details' ? (
                <><button className="btn" onClick={backToList} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>← BACK</button>
                <span style={{ color: 'var(--section-accent)', fontWeight: 'bold' }}>{seriesInfo?.info?.name}</span></>
            ) : (
                <span>
                  Streams ({visibleStreams.length}
                  {totalFilteredCount > visibleStreams.length && (
                    <span style={{ color: '#888' }}> of {totalFilteredCount}</span>
                  )})
                </span>
            )}
          </div>

          <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}>
            {viewMode === 'details' ? (
                Object.keys(seriesInfo?.episodes || {}).sort((a,b) => parseInt(a)-parseInt(b)).map(seasonNum => (
                    <React.Fragment key={`season-${seasonNum}`}>
                        <div className="section-header" style={{ marginTop: seasonNum === '1' ? '0' : '20px' }}>SEASON {seasonNum.padStart(2, '0')}</div>
                                                {seriesInfo.episodes[seasonNum].map(ep => (
                                                    <div key={ep.id} className="stream-card" onDoubleClick={() => playStream(ep, 'episode')} onContextMenu={(e) => handleContextMenu(e, ep)}>
                                                        <CachedImage
                                                            src={ep.info?.movie_image || seriesInfo?.info?.cover}
                                                            alt={ep.title}
                                                            className="stream-logo"
                                                            profileId={currentProfile?.id}
                                                            cacheMap={imageCacheMap}
                                                            apiDebug={apiDebug}
                                                        />
                                                        <div className="stream-name">E{ep.episode_num}: {ep.title}</div>
                                                    </div>
                                                ))}
                    </React.Fragment>
                ))
            ) : (
                visibleStreams.map((s) => {
                    const id = (s.stream_id || s.series_id || s.id).toString();
                    return (
                        <StreamCard
                            key={id}
                            stream={s}
                            showPlot={showPlot}
                            onDoubleClick={() => playStream(s)}
                            onContextMenu={(e) => handleContextMenu(e, s)}
                            profileId={currentProfile?.id}
                            cacheMap={imageCacheMap}
                            apiDebug={apiDebug}
                            fetchMetadata={fetchStreamMetadata}
                            metadataCache={metadataCache}
                            sectionType={selectedSection}
                            onDownload={handleDownload}
                            isFavorite={favorites.includes(id)}
                            onToggleFavorite={toggleFavorite}
                        />
                    );
                })
            )}
          </div>
        </div>
      </div>

      {currentStream && <VideoPlayer url={currentStream.url} title={currentStream.name || currentStream.title} onClose={() => setCurrentStream(null)} />}

      {accountInfo && (
          <div className="modal-overlay" onClick={() => setAccountInfo(null)}>
              <div className="account-modal" onClick={e => e.stopPropagation()} style={{ position: 'relative' }}>
                  <button className="close-modal-btn" onClick={() => setAccountInfo(null)}><X size={20} /></button>
                  <div className="series-browser-header" style={{ marginBottom: '0' }}>
                      <div className="series-header-info"><h2 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}><User size={24} /> Account Details</h2></div>
                  </div>
                  <div className="account-body">
                      <div className="account-grid">
                          <div className="account-section">
                              <h3>User Profile</h3>
                              <div className="account-row"><span>Username:</span> <span>{accountInfo.user_info?.username}</span></div>
                              <div className="account-row"><span>Password:</span> <span>{accountInfo.user_info?.password}</span></div>
                              <div className="account-row"><span>Status:</span> <span style={{ color: accountInfo.user_info?.status === 'Active' ? '#40c057' : '#ff6b6b' }}>{accountInfo.user_info?.status}</span></div>
                              <div className="account-row"><span>Expiry:</span> <span>{accountInfo.user_info?.exp_date ? new Date(parseInt(accountInfo.user_info.exp_date) * 1000).toLocaleDateString() : 'N/A'}</span></div>
                              <div className="account-row"><span>Created:</span> <span>{accountInfo.user_info?.created_at ? new Date(parseInt(accountInfo.user_info.created_at) * 1000).toLocaleDateString() : 'N/A'}</span></div>
                              <div className="account-row"><span>Trial:</span> <span>{accountInfo.user_info?.is_trial === "1" ? "Yes" : "No"}</span></div>
                              <div className="account-row"><span>Auth:</span> <span>{accountInfo.user_info?.auth}</span></div>
                          </div>
                          <div className="account-section">
                              <h3>Connections</h3>
                              <div className="account-row"><span>Max Allowed:</span> <span>{accountInfo.user_info?.max_connections}</span></div>
                              <div className="account-row"><span>Currently Active:</span> <span>{accountInfo.user_info?.active_cons}</span></div>
                              <div className="account-row"><span>Formats:</span> <span>{accountInfo.user_info?.allowed_output_formats?.join(', ')}</span></div>
                              <div className="account-row" style={{ marginTop: '10px' }}><span>Message:</span> <span style={{ fontStyle: 'italic' }}>{accountInfo.user_info?.message || "No system messages"}</span></div>
                          </div>
                      </div>

                      <div className="account-section">
                          <h3>Server Infrastructure</h3>
                          <div className="account-grid">
                              <div>
                                  <div className="account-row"><span>URL:</span> <span>{accountInfo.server_info?.url}</span></div>
                                  <div className="account-row"><span>HTTP Port:</span> <span>{accountInfo.server_info?.port}</span></div>
                                  <div className="account-row"><span>HTTPS Port:</span> <span>{accountInfo.server_info?.https_port}</span></div>
                                  <div className="account-row"><span>Protocol:</span> <span>{accountInfo.server_info?.server_protocol}</span></div>
                              </div>
                              <div>
                                  <div className="account-row"><span>RTMP Port:</span> <span>{accountInfo.server_info?.rtmp_port}</span></div>
                                  <div className="account-row"><span>Timezone:</span> <span>{accountInfo.server_info?.timezone}</span></div>
                                  <div className="account-row"><span>Server Time:</span> <span>{accountInfo.server_info?.time_now}</span></div>
                                  <div className="account-row"><span>Process:</span> <span>{accountInfo.server_info?.process ? "Running" : "Idle"}</span></div>
                              </div>
                          </div>
                      </div>

                      <div className="account-raw">
                          <details><summary style={{ cursor: 'pointer', fontSize: '0.8rem', color: '#888' }}>Raw Response</summary><pre>{JSON.stringify(accountInfo, null, 2)}</pre></details>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {contextMenu && (() => {
          const isEpisode = !!contextMenu.stream.episode_num;
          const finalUrl = getXcUrl(contextMenu.stream, isEpisode ? 'episode' : selectedSection);
          const finalLogoUrl = getXcLogoUrl(contextMenu.stream);
          const info = contextMenu.info;
          return (
              <div className="context-menu" style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }} onClick={e => e.stopPropagation()}>
                  <div className="context-menu-item" onClick={() => copyToClipboard(finalUrl)}><Copy size={14} /> <span>Copy Stream URL</span></div>
                  {finalLogoUrl && <div className="context-menu-item" onClick={() => copyToClipboard(finalLogoUrl)}><Copy size={14} /> <span>Copy Logo URL</span></div>}
                  <div className="context-menu-separator" />
                  {contextMenu.isLoading ? (
                      <div className="context-menu-info" style={{ textAlign: 'center', opacity: 0.6 }}>Loading metadata...</div>
                  ) : info ? (
                      <div className="context-menu-metadata">
                          {isEpisode && <div className="metadata-row" style={{ color: 'var(--section-accent)', fontWeight: 'bold', marginBottom: '8px' }}>{contextMenu.stream.title}</div>}
                          {(info.plot || contextMenu.stream.plot) && <div className="metadata-row"><strong>Plot:</strong> <div className="metadata-text">{info.plot || contextMenu.stream.plot}</div></div>}
                          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            {info.director && <div className="metadata-row"><strong>Dir:</strong> {info.director}</div>}
                            {(info.releasedate || info.release_date) && <div className="metadata-row"><strong>Year:</strong> {(info.releasedate || info.release_date).split('-')[0]}</div>}
                          </div>
                          <div className="context-menu-separator" />
                      </div>
                  ) : null}
                  <div className="context-menu-info"><strong>ID:</strong> {contextMenu.stream.stream_id || contextMenu.stream.series_id || contextMenu.stream.id}</div>
                  <div className="context-menu-info"><strong>Stream URL:</strong> <div className="url-text">{finalUrl || 'N/A'}</div></div>
                  {finalLogoUrl && <div className="context-menu-info"><strong>Logo URL:</strong> <div className="url-text">{finalLogoUrl}</div></div>}
              </div>
          );
      })()}

      {isRendering && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          pointerEvents: 'all'
        }}>
          <div style={{
            padding: '20px 40px',
            backgroundColor: 'var(--bg-secondary)',
            border: '2px solid var(--section-accent)',
            borderRadius: '8px',
            fontSize: '1.2rem',
            color: 'var(--text-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <RefreshCw size={24} className="spin" color={getSectionColor()} />
              <span>Rendering first 100 tiles...</span>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#888' }}>
              {streams.length} total in category
            </div>
          </div>
        </div>
      )}

      {showDownloadManager && (
        <div style={{
          position: 'fixed',
          top: '60px',
          right: '20px',
          width: '450px',
          maxHeight: '600px',
          backgroundColor: 'var(--bg-secondary)',
          border: '2px solid var(--border)',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'var(--bg-dark)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={18} color={getSectionColor()} />
              <span style={{ fontWeight: 'bold' }}>Download Manager</span>
            </div>
            <button
              onClick={() => setShowDownloadManager(false)}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                padding: '4px'
              }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px'
          }}>
            {downloads.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: 'var(--text-secondary)',
                fontSize: '0.9rem'
              }}>
                No downloads yet. Click the download button on VOD or Series tiles to start.
              </div>
            ) : (
              downloads.map((dl, index) => (
                <div
                  key={dl.id}
                  style={{
                    padding: '12px',
                    marginBottom: '8px',
                    backgroundColor: 'var(--bg-dark)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '8px'
                  }}>
                    <div style={{
                      flex: 1,
                      fontSize: '0.85rem',
                      fontWeight: 'bold',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      marginRight: '8px'
                    }}>
                      {dl.name}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {index > 0 && (
                        <button
                          onClick={() => moveDownload(dl.id, 'up')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Move up"
                        >
                          <ArrowUp size={14} color="var(--text-secondary)" />
                        </button>
                      )}
                      {index < downloads.length - 1 && (
                        <button
                          onClick={() => moveDownload(dl.id, 'down')}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center'
                          }}
                          title="Move down"
                        >
                          <ArrowDown size={14} color="var(--text-secondary)" />
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (dl.status === 'downloading') {
                            cancelDownload(dl.id);
                          } else {
                            removeDownload(dl.id);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid #ff6b6b',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          padding: '2px',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title={dl.status === 'downloading' ? 'Cancel' : 'Remove'}
                      >
                        <X size={14} color="#ff6b6b" />
                      </button>
                    </div>
                  </div>

                  <div style={{
                    marginBottom: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '0.75rem'
                  }}>
                    <div style={{
                      padding: '2px 6px',
                      borderRadius: '3px',
                      backgroundColor:
                        dl.status === 'downloading' ? '#40c057' :
                        dl.status === 'completed' ? '#228be6' :
                        dl.status === 'error' ? '#ff6b6b' :
                        dl.status === 'cancelled' ? '#909296' :
                        '#ffd43b',
                      color: '#000',
                      fontWeight: 'bold',
                      fontSize: '0.7rem'
                    }}>
                      {dl.status.toUpperCase()}
                    </div>
                    {dl.status === 'downloading' && (
                      <span style={{ color: 'var(--text-secondary)' }}>{dl.speed}</span>
                    )}
                  </div>

                  {(dl.status === 'downloading' || dl.status === 'queued') && (
                    <div style={{
                      width: '100%',
                      height: '6px',
                      backgroundColor: 'var(--border)',
                      borderRadius: '3px',
                      overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${dl.progress}%`,
                        height: '100%',
                        backgroundColor: getSectionColor(),
                        transition: 'width 0.3s ease'
                      }} />
                    </div>
                  )}

                  {dl.status === 'downloading' && (
                    <div style={{
                      marginTop: '4px',
                      fontSize: '0.7rem',
                      color: 'var(--text-secondary)',
                      textAlign: 'right'
                    }}>
                      {dl.progress.toFixed(1)}%
                    </div>
                  )}

                  {dl.error && (
                    <div style={{
                      marginTop: '6px',
                      fontSize: '0.7rem',
                      color: '#ff6b6b',
                      padding: '4px',
                      backgroundColor: 'rgba(255, 107, 107, 0.1)',
                      borderRadius: '3px'
                    }}>
                      Error: {dl.error}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="status-bar">{status}</div>
    </div>
  );
}

export default App;