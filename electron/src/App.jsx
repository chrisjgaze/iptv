import React, { useState, useEffect, useMemo } from 'react';
import { Settings, RefreshCw, Play, Search, Copy, Download, Cast, ChevronRight, ChevronDown, X } from 'lucide-react';
import { SERVER_URLS, parseM3U, getRewrittenUrl } from './utils/m3u';
import VideoPlayer from './components/VideoPlayer';
import CachedImage from './components/CachedImage';

const USERNAME = "c91392c3e194";
const PASSWORD = "7657840f7676";

function App() {
  const [selectedServer, setSelectedServer] = useState(SERVER_URLS[0]);
  const [status, setStatus] = useState('Ready');
  const [categories, setCategories] = useState([]);
  const [streams, setStreams] = useState([]);
  const [filteredStreams, setFilteredStreams] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [englishOnly, setEnglishOnly] = useState(false);
  const [playerMode, setPlayerMode] = useState('vlc'); // 'vlc', 'internal', 'cast'
  const [currentStream, setCurrentStream] = useState(null); // For internal player
  
  // Cast State
  const [castDevices, setCastDevices] = useState(['None']);
  const [selectedCastDevice, setSelectedCastDevice] = useState('None');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedSubGroups, setExpandedSubGroups] = useState({});
  const [expandedSeries, setExpandedSeries] = useState({});
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [tileSize, setTileSize] = useState(200);

  // Download State
  const [activeDownloads, setActiveDownloads] = useState({});
  const [showDownloads, setShowDownloads] = useState(false);

  // --- Helpers ---
  const toggleGroup = (prefix) => {
      setExpandedGroups(prev => ({...prev, [prefix]: !prev[prefix]}));
  };

  const toggleSection = (name) => {
      setExpandedSections(prev => ({...prev, [name]: !prev[name]}));
  };

  const toggleSubGroup = (id) => {
      setExpandedSubGroups(prev => ({...prev, [id]: !prev[id]}));
  };

  const toggleSeries = (id) => {
      setExpandedSeries(prev => ({...prev, [id]: !prev[id]}));
  };

  const toggleSeason = (id) => {
      setExpandedSeasons(prev => ({...prev, [id]: !prev[id]}));
  };

  const handleM3UData = (rawData) => {
      // ... (existing logic) ...
      setStatus('Parsing M3U...');
      setTimeout(() => {
          const data = parseM3U(rawData);
          setCategories(data.categories);
          setStreams(data.streams);
          setStatus(`Loaded ${data.streams.length} streams in ${data.categories.length} categories.`);
          
          if (data.categories.length > 0 && !selectedCategory) {
             setSelectedCategory(data.categories[0]);
          }
      }, 100);
  };

  // --- Download Logic ---
  const startDownload = (stream) => {
      const id = Date.now().toString() + Math.random().toString().slice(2, 6);
      const url = getRewrittenUrl(stream.url, selectedServer);
      const filename = stream.name || "download";

      setActiveDownloads(prev => ({
          ...prev,
          [id]: {
              id,
              filename,
              progress: 0,
              speed: 0,
              loaded: 0,
              total: 0,
              status: 'starting'
          }
      }));

      // Trigger IPC
      if (window.api && window.api.startDownload) {
          window.api.startDownload({ url, filename, id });
          setShowDownloads(true); // Open panel
      }
  };

  const cancelDownload = (id) => {
      if (window.api && window.api.cancelDownload) {
          window.api.cancelDownload(id);
      }
      setActiveDownloads(prev => {
          const next = { ...prev };
          delete next[id];
          return next;
      });
  };

  useEffect(() => {
      if (!window.api) return;

      const onProgress = (data) => {
          setActiveDownloads(prev => {
              if (!prev[data.id]) return prev;
              return {
                  ...prev,
                  [data.id]: {
                      ...prev[data.id],
                      progress: data.progress || 0,
                      loaded: data.loaded || 0,
                      total: data.total || 0,
                      speed: data.rate || 0,
                      status: 'downloading'
                  }
              };
          });
      };

      const onComplete = (data) => {
          // Remove from list or mark done. Let's remove for now or show 'Done'
          setActiveDownloads(prev => {
              const next = { ...prev };
              delete next[data.id];
              return next;
          });
          setStatus(`Download complete: ${data.filePath}`);
      };

      if (window.api.onDownloadProgressUpdate) window.api.onDownloadProgressUpdate(onProgress);
      if (window.api.onDownloadComplete) window.api.onDownloadComplete(onComplete);
      
      // Listen for debug logs from main process
      if (window.api.onDownloadLog) {
          window.api.onDownloadLog((msg) => {
              console.log("%c[Main Process]", "color: cyan", msg);
          });
      }

      return () => {
          // Cleanup listeners if api exposes removal (assuming it does or overwrites)
      };
  }, []);

  // --- Initial Load ---
  useEffect(() => {
      // ... (existing load logic)
      const loadLocal = async () => {
          setStatus('Checking local cache...');
          try {
              const result = await window.api.loadLocalM3U();
              if (result.success) {
                  console.log("Local cache loaded");
                  handleM3UData(result.data);
              } else {
                  setStatus('Ready (No local cache). Click Reload to fetch.');
              }
          } catch (e) {
              console.error("Local load error", e);
              setStatus('Ready.');
          }
      };
      loadLocal();

      if (window.api.castScan) {
          window.api.castScan().then(devices => {
              setCastDevices(['None', ...devices]);
          });
          
          window.api.onCastDeviceFound(name => {
              setCastDevices(prev => {
                  if (!prev.includes(name)) return [...prev, name];
                  return prev;
              });
          });
      }
  }, []); 

  // ... (rest of logic) ...


  // Watch for 'None' selection to stop casting
  useEffect(() => {
      if (selectedCastDevice === 'None') {
          // Find if there was a previous device and stop it
          // We can just broadcast a stop to all if we don't track the last one, 
          // but usually calling stop on the backend is enough.
          // For simplicity, we stop the last known active device if we were to track it.
          // Instead, let's just trigger a global stop in main.js if device is null.
          window.api.castStop(null); 
          setStatus('Casting stopped.');
      }
  }, [selectedCastDevice]);

  // --- Actions ---

  const fetchM3U = async () => {
    setIsLoading(true);
    setStatus('Connecting...');
    
    // Construct URL
    const base = selectedServer.replace(/\/$/, "");
    const url = `${base}/get.php?username=${USERNAME}&password=${PASSWORD}&type=m3u_plus&output=ts`;

    // Setup progress listener
    const handleProgress = (data) => {
       if (data.connected) {
         const speedMB = (data.speed / (1024 * 1024)).toFixed(2); // Speed in MB/s
         const loadedMB = (data.loaded / (1024 * 1024)).toFixed(1);
         setStatus(`Downloading... ${loadedMB} MB downloaded (${speedMB} MB/s)`);
       }
    };

    if (window.api && window.api.onProgress) {
        window.api.removeProgressListeners(); // Clean up old listeners
        window.api.onProgress(handleProgress);
    }

    try {
      // Use Electron IPC to fetch (bypass CORS)
      const result = await window.api.fetchM3U(url);
      
      if (result.success) {
        handleM3UData(result.data);
      } else {
        setStatus(`Error: ${result.error}`);
        alert(`Failed to fetch M3U: ${result.error}`);
      }
    } catch (e) {
      setStatus(`Error: ${e.message}`);
    } finally {
      setIsLoading(false);
      if (window.api && window.api.removeProgressListeners) {
          window.api.removeProgressListeners();
      }
    }
  };

  const playStream = async (stream) => {
    if (!stream || !stream.url) return;
    
    // Rewrite URL to use selected server
    const finalUrl = getRewrittenUrl(stream.url, selectedServer);
    
    if (playerMode === 'internal') {
        setCurrentStream({ ...stream, url: finalUrl });
    } else if (playerMode === 'cast') {
        if (!selectedCastDevice) {
            alert("No Chromecast selected. Please select a device.");
            return;
        }
        setStatus(`Casting to ${selectedCastDevice}: ${stream.name}`);
        const result = await window.api.castPlay(selectedCastDevice, finalUrl);
        if (!result.success) {
            alert(`Cast failed: ${result.error}`);
        } else {
            setStatus(`Playing on ${selectedCastDevice}: ${stream.name}`);
        }
    } else {
        setStatus(`Launching VLC for: ${stream.name}`);
        const result = await window.api.launchVLC(finalUrl, null, stream.name);
        if (!result.success) {
          alert(`Failed to launch VLC: ${result.error}`);
        }
    }
  };

  // --- Filtering Logic ---

  // 1. First, compute matching streams globally based on search query
  const matchingStreams = useMemo(() => {
    if (!searchQuery && !englishOnly) return streams;

    const lowerQuery = searchQuery.toLowerCase();
    
    // English filter regex/logic
    const forbidden = ["SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH", "ITALIAN", "SPANISH", "PORTUGUES", "TURKISH", "RUSSIAN", "ARABIC"];

    return streams.filter(s => {
        // Step 1: English Filter
        if (englishOnly) {
            // Rule 1: Category Name Pipe Logic
            const catUpper = (s.group_title || "").toUpperCase();
            if (catUpper.includes('|')) {
                const allowedPipes = ['EN|', 'US|', 'UK|'];
                if (!allowedPipes.some(p => catUpper.includes(p))) return false;
            }

            // Rule 2: Category Name Forbidden Starts
            const forbiddenCatStarts = ["DENMARK", "FINLAND", "NORWAY", "SWEDEN"];
            if (forbiddenCatStarts.some(prefix => catUpper.startsWith(prefix))) return false;

            // Rule 3: Stream Name Forbidden Start Words
            const nameUpper = s.name.toUpperCase();
            if (forbidden.some(f => nameUpper.startsWith(f))) return false;
        }

        // Step 2: Search Query
        if (!searchQuery) return true;
        
        // Match against Stream Name OR Category Name
        const nameMatch = s.name.toLowerCase().includes(lowerQuery);
        const catMatch = s.group_title.toLowerCase().includes(lowerQuery);
        
        return nameMatch || catMatch;
    });
  }, [streams, searchQuery, englishOnly]);

  // 2. Compute visible categories based on matching streams
  const visibleCategories = useMemo(() => {
      // Get unique categories from matching streams
      const cats = new Set(matchingStreams.map(s => s.group_title));
      
      // If we are searching, the order might be based on relevance, but usually keeping original sort is best.
      // We filter the original 'categories' list to maintain order.
      return categories.filter(c => cats.has(c));
  }, [categories, matchingStreams]);

  // Group categories by first word (prefix)
  const groupedCategories = useMemo(() => {
      const groups = {};
      visibleCategories.forEach(cat => {
          const prefix = cat.split(' ')[0] || "Other";
          if (!groups[prefix]) groups[prefix] = [];
          groups[prefix].push(cat);
      });
      return groups;
  }, [visibleCategories]);

  // Auto-expand group of selected category
  useEffect(() => {
      if (selectedCategory) {
          const prefix = selectedCategory.split(' ')[0] || "Other";
          setExpandedGroups(prev => ({...prev, [prefix]: true}));
      }
  }, [selectedCategory]);

  // 3. Compute final list for the main view (matching streams in selected category)
  useEffect(() => {
    if (!selectedCategory) {
      setFilteredStreams([]);
      return;
    }
    
    // If the selected category is no longer visible, we might want to switch?
    // For now, just show what matches in this category.
    const inCategory = matchingStreams.filter(s => s.group_title === selectedCategory);
    setFilteredStreams(inCategory);

  }, [selectedCategory, matchingStreams]);

  // Group streams by marker (##### NAME #####)
  const streamSections = useMemo(() => {
    const sections = [];
    let currentSection = { name: 'General', streams: [] };
    let hasMarkers = false;
    
    filteredStreams.forEach(stream => {
        const match = stream.name.match(/^#+\s*(.+?)\s*#+$/);
        if (match) {
            hasMarkers = true;
            if (currentSection.streams.length > 0 || sections.length > 0) {
                 // Only push previous if it has content or if we are switching sections
                 // Actually, we should always push the previous section if we hit a marker, 
                 // UNLESS it's the initial "General" and it's empty.
                 if (currentSection.streams.length > 0 || currentSection.name !== 'General') {
                    sections.push(currentSection);
                 }
            }
            currentSection = { name: match[1], streams: [] };
        } else {
            currentSection.streams.push(stream);
        }
    });
    
    // Push the last section
    if (currentSection.streams.length > 0 || (hasMarkers && currentSection.name !== 'General')) {
        sections.push(currentSection);
    }

    // If no markers were found, just return the flat list as one section (which we might verify later)
    if (!hasMarkers && sections.length === 0 && currentSection.streams.length > 0) {
        return [currentSection];
    }
    
    return sections;
  }, [filteredStreams]);

  // Auto-expand all sections when category changes
  useEffect(() => {
      const newExpanded = {};
      streamSections.forEach(s => newExpanded[s.name] = true);
      setExpandedSections(newExpanded);
      setExpandedSubGroups({}); // Reset sub-groups
      setExpandedSeries({});    // Reset series groups
      setExpandedSeasons({});   // Reset season groups
  }, [streamSections]);

  // Auto-select first category if current selection disappears due to filter
  useEffect(() => {
      if (visibleCategories.length > 0) {
          if (!selectedCategory || !visibleCategories.includes(selectedCategory)) {
              setSelectedCategory(visibleCategories[0]);
          }
      } else {
          // No matches found globally
          setSelectedCategory(null);
      }
  }, [visibleCategories, selectedCategory]);


  // --- Render ---

  return (
    <div className="container">
      {/* Header */}
      <div className="header">
        <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>IPTV Electron</div>
        
        <div className="controls">
          <label>Server:</label>
          <select 
            value={selectedServer} 
            onChange={(e) => setSelectedServer(e.target.value)}
            style={{ width: '200px' }}
          >
            {SERVER_URLS.map(url => (
              <option key={url} value={url}>{url}</option>
            ))}
          </select>
          
          <button 
            className="btn btn-primary" 
            onClick={fetchM3U} 
            disabled={isLoading}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <RefreshCw size={16} className={isLoading ? 'spin' : ''} />
            {isLoading ? 'Loading...' : 'Reload'}
          </button>

          <label style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px' }}>
            <input 
              type="checkbox" 
              checked={englishOnly} 
              onChange={(e) => setEnglishOnly(e.target.checked)} 
            />
            English Only
          </label>

          <button 
            className="btn"
            onClick={() => setShowDownloads(!showDownloads)}
            title="Downloads"
            style={{ display: 'flex', alignItems: 'center', gap: '5px', marginLeft: '10px', position: 'relative' }}
          >
            <Download size={16} />
            {Object.keys(activeDownloads).length > 0 && (
                <span style={{ 
                    position: 'absolute', top: -5, right: -5, 
                    backgroundColor: '#ff6b6b', color: 'white', 
                    borderRadius: '50%', fontSize: '0.6rem', 
                    width: '16px', height: '16px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center' 
                }}>
                    {Object.keys(activeDownloads).length}
                </span>
            )}
          </button>
        </div>

        <div style={{ flex: 1 }}></div>

        <div className="controls">
            <div style={{ display: 'flex', gap: '10px', marginRight: '15px', alignItems: 'center', backgroundColor: '#25262b', padding: '4px', borderRadius: '4px', border: '1px solid #373a40' }}>
                <span style={{ fontSize: '0.8rem', paddingLeft: '5px', color: '#888' }}>Player:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input 
                        type="radio" 
                        name="player" 
                        value="vlc" 
                        checked={playerMode === 'vlc'} 
                        onChange={() => setPlayerMode('vlc')} 
                    />
                    VLC
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input 
                        type="radio" 
                        name="player" 
                        value="internal" 
                        checked={playerMode === 'internal'} 
                        onChange={() => setPlayerMode('internal')} 
                    />
                    Internal
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input 
                        type="radio" 
                        name="player" 
                        value="cast" 
                        checked={playerMode === 'cast'} 
                        onChange={() => setPlayerMode('cast')} 
                    />
                    <Cast size={14}/> Cast
                </label>
            </div>

            {playerMode === 'cast' && (
                <select 
                    value={selectedCastDevice}
                    onChange={(e) => setSelectedCastDevice(e.target.value)}
                    style={{ marginRight: '10px', width: '150px' }}
                >
                    {castDevices.length === 0 ? <option>Scanning...</option> : null}
                    {castDevices.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginRight: '15px' }}>
                <span style={{ fontSize: '0.8rem', color: '#888', whiteSpace: 'nowrap' }}>Size:</span>
                <input 
                    type="range" 
                    min="100" 
                    max="400" 
                    step="10"
                    value={tileSize} 
                    onChange={(e) => setTileSize(Number(e.target.value))}
                    style={{ width: '80px', padding: 0 }}
                />
            </div>

          <div style={{ position: 'relative' }}>
             <Search size={16} style={{ position: 'absolute', left: 8, top: 8, color: '#888' }} />
             <input 
               type="text" 
               placeholder="Search streams..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               style={{ paddingLeft: '30px', width: '250px' }}
             />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Download Manager Overlay */}
        {showDownloads && (
            <div className="downloads-modal">
                <div className="downloads-header">
                    <span>Active Downloads ({Object.keys(activeDownloads).length})</span>
                    <button onClick={() => setShowDownloads(false)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}><X size={16} /></button>
                </div>
                <div className="downloads-list">
                    {Object.values(activeDownloads).length === 0 ? (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No active downloads</div>
                    ) : (
                        Object.values(activeDownloads).map(dl => (
                            <div key={dl.id} className="download-item">
                                <div className="dl-row">
                                    <div className="dl-name" title={dl.filename}>{dl.filename}</div>
                                    <button className="dl-cancel" onClick={() => cancelDownload(dl.id)}><X size={14} /></button>
                                </div>
                                <div className="dl-progress-bg">
                                    <div className="dl-progress-bar" style={{ width: `${(dl.progress * 100).toFixed(1)}%` }}></div>
                                </div>
                                <div className="dl-stats">
                                    <span>{(dl.loaded / (1024*1024)).toFixed(1)} / {(dl.total / (1024*1024)).toFixed(1)} MB</span>
                                    <span>{(dl.speed / 1024).toFixed(0)} KB/s</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        )}

        {/* Sidebar: Categories */}
        <div className="sidebar">
          <div className="sidebar-header">
            Categories ({visibleCategories.length})
          </div>
          <div className="sidebar-list">
            {Object.entries(groupedCategories).sort((a, b) => a[0].localeCompare(b[0])).map(([prefix, cats]) => (
                <div key={prefix}>
                    <div className="group-header" onClick={() => toggleGroup(prefix)}>
                        {expandedGroups[prefix] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        {prefix}
                        <span style={{ fontSize: '0.75rem', opacity: 0.6, marginLeft: 'auto' }}>{cats.length}</span>
                    </div>
                    {expandedGroups[prefix] && cats.map(cat => (
                        <div 
                            key={cat} 
                            className={`category-item ${selectedCategory === cat ? 'active' : ''}`}
                            onClick={() => setSelectedCategory(cat)}
                            style={{ paddingLeft: '32px' }}
                        >
                            {cat}
                        </div>
                    ))}
                </div>
            ))}
            {visibleCategories.length === 0 && (
              <div style={{ padding: 10, color: '#666', fontStyle: 'italic' }}>
                {searchQuery ? "No matches found." : "No categories loaded."}
              </div>
            )}
          </div>
        </div>

        {/* Stream Grid */}
        <div className="content-area">
          <div className="sidebar-header" style={{ borderBottom: '1px solid #373a40' }}>
            {selectedCategory || 'Select a Category'} ({filteredStreams.length})
          </div>
          <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}>
            {streamSections.map((section, secIdx) => {
                // Determine if we should show the header
                const showHeader = streamSections.length > 1 || section.name !== 'General';
                
                // Helper to render final stream cards
                const renderCards = (list, keyPrefix) => list.map((stream, idx) => (
                    <div 
                        key={`${keyPrefix}-${idx}`} 
                        className="stream-card"
                        onDoubleClick={() => playStream(stream)}
                        title={stream.name}
                    >
                        <div 
                            className="download-btn"
                            title="Download"
                            onClick={(e) => {
                                e.stopPropagation();
                                startDownload(stream);
                            }}
                        >
                            <Download size={14} />
                        </div>
                        <CachedImage 
                            src={stream.tvg_logo} 
                            alt={stream.name} 
                            className="stream-logo"
                        />
                        <div className="stream-name">{stream.displayName || stream.name}</div>
                    </div>
                ));

                // Helper to group by Series (Sxx Exx) and then render
                const renderWithSeriesGrouping = (list, keyPrefix, shouldStrip) => {
                    const seriesGroups = {}; // { SeriesName: { SeasonNum: [streams] } }
                    const looseStreams = [];

                    list.forEach(stream => {
                        let displayName = stream.name;
                        if (shouldStrip && displayName.includes('|')) {
                            const parts = displayName.split('|');
                            displayName = parts.slice(1).join('|').trim();
                        }
                        
                        // Check for Series Pattern:  "Name S01 E01" or "Name S01E01"
                        // Capture group 1 is the name
                        const match = displayName.match(/^(.*?)\s+S(\d+)\s*E(\d+)/i);
                        
                        // Attach the computed display name to the stream object temporarily for rendering
                        const streamWithDisplay = { ...stream, displayName };

                        if (match) {
                            const seriesName = match[1].trim();
                            const seasonNum = match[2];
                            if (!seriesGroups[seriesName]) seriesGroups[seriesName] = {};
                            if (!seriesGroups[seriesName][seasonNum]) seriesGroups[seriesName][seasonNum] = [];
                            seriesGroups[seriesName][seasonNum].push(streamWithDisplay);
                        } else {
                            looseStreams.push(streamWithDisplay);
                        }
                    });

                    return (
                        <>
                            {renderCards(looseStreams, `${keyPrefix}-loose`)}
                            {Object.keys(seriesGroups).sort().map(seriesName => {
                                const seriesKey = `${keyPrefix}-series-${seriesName}`;
                                const seasons = seriesGroups[seriesName];
                                const totalEpisodes = Object.values(seasons).reduce((acc, arr) => acc + arr.length, 0);

                                return (
                                    <React.Fragment key={seriesKey}>
                                        <div className="series-header" onClick={() => toggleSeries(seriesKey)}>
                                            {expandedSeries[seriesKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            {seriesName} ({totalEpisodes})
                                        </div>
                                        {expandedSeries[seriesKey] && Object.keys(seasons).sort().map(seasonNum => {
                                            const seasonKey = `${seriesKey}-S${seasonNum}`;
                                            const seasonLabel = `Season ${seasonNum}`;
                                            return (
                                                <React.Fragment key={seasonKey}>
                                                     <div className="season-header" onClick={() => toggleSeason(seasonKey)}>
                                                        {expandedSeasons[seasonKey] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        {seasonLabel} ({seasons[seasonNum].length})
                                                     </div>
                                                     {expandedSeasons[seasonKey] && renderCards(seasons[seasonNum], seasonKey)}
                                                </React.Fragment>
                                            )
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </>
                    );
                };

                // Process subgroups
                let content = null;
                if (!showHeader || expandedSections[section.name]) {
                    const groups = {};
                    const rootStreams = [];
                    
                    section.streams.forEach(s => {
                        const parts = s.name.split('|');
                        if (parts.length > 1) {
                            const prefix = parts[0].trim();
                            if (!groups[prefix]) groups[prefix] = [];
                            groups[prefix].push(s);
                        } else {
                            rootStreams.push(s);
                        }
                    });

                    // If only one group matches everything and no root streams, flatten it to avoid redundancy
                    const groupKeys = Object.keys(groups).sort();
                    if (groupKeys.length === 1 && rootStreams.length === 0) {
                         // Flatten the single group, strip prefix = true
                         content = renderWithSeriesGrouping(groups[groupKeys[0]], `${secIdx}-flat`, true);
                    } else {
                        content = (
                            <>
                                {renderWithSeriesGrouping(rootStreams, `${secIdx}-root`, false)}
                                {groupKeys.map(groupName => {
                                    const subGroupId = `${secIdx}-${groupName}`;
                                    return (
                                        <React.Fragment key={subGroupId}>
                                            <div className="sub-group-header" onClick={() => toggleSubGroup(subGroupId)}>
                                                {expandedSubGroups[subGroupId] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                {groupName} ({groups[groupName].length})
                                            </div>
                                            {expandedSubGroups[subGroupId] && renderWithSeriesGrouping(groups[groupName], subGroupId, true)}
                                        </React.Fragment>
                                    );
                                })}
                            </>
                        );
                    }
                }

                return (
                    <React.Fragment key={secIdx}>
                        {showHeader && (
                            <div className="section-header" onClick={() => toggleSection(section.name)}>
                                {expandedSections[section.name] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {section.name} ({section.streams.length})
                            </div>
                        )}
                        {content}
                    </React.Fragment>
                );
            })}
             {filteredStreams.length === 0 && selectedCategory && (
              <div style={{ padding: 20, color: '#666', gridColumn: '1/-1', textAlign: 'center' }}>
                No streams found in this category (check filters).
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Internal Player Overlay */}
      {currentStream && (
        <VideoPlayer 
            url={currentStream.url} 
            title={currentStream.name}
            onClose={() => setCurrentStream(null)} 
        />
      )}

      {/* Status Bar */}
      <div className="status-bar">
        {status}
      </div>
    </div>
  );
}

export default App;
