import React, { useState, useEffect, useMemo } from 'react';
import { Settings, RefreshCw, Play, Search, Copy, Download, Cast, ChevronRight, ChevronDown, X, User } from 'lucide-react';
import VideoPlayer from './components/VideoPlayer';
import CachedImage from './components/CachedImage';
import ProfileManager from './components/ProfileManager';

function App() {
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);
  const [status, setStatus] = useState('Ready');
  
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

  // --- API Actions ---

  const fetchCategories = async (section = selectedSection) => {
    if (!currentProfile || !selectedServer) return;
    setIsLoading(true);
    setStatus(`Loading ${section} categories...`);
    
    const actionMap = {
        live: 'get_live_categories',
        vod: 'get_vod_categories',
        series: 'get_series_categories'
    };

    try {
        const result = await window.api.xcApi({
            server: selectedServer,
            username: currentProfile.username,
            password: currentProfile.password,
            action: actionMap[section]
        });

        if (result.success) {
            setAllCategories(prev => ({ ...prev, [section]: Array.isArray(result.data) ? result.data : [] }));
            setStatus(`Loaded ${result.data.length || 0} ${section} categories.`);
        } else {
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        setStatus(`Exception: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchStreams = async (catId) => {
    if (!currentProfile || !selectedServer || !catId) return;
    setIsLoading(true);
    setStatus(`Loading streams...`);
    
    const actionMap = {
        live: 'get_live_streams',
        vod: 'get_vod_streams',
        series: 'get_series'
    };

    try {
        const result = await window.api.xcApi({
            server: selectedServer,
            username: currentProfile.username,
            password: currentProfile.password,
            action: actionMap[selectedSection],
            extraParams: { category_id: catId }
        });

        if (result.success) {
            setStreams(Array.isArray(result.data) ? result.data : []);
            setStatus(`Loaded ${result.data.length || 0} streams.`);
        } else {
            setStatus(`Error: ${result.error}`);
        }
    } catch (e) {
        setStatus(`Exception: ${e.message}`);
    } finally {
        setIsLoading(false);
    }
  };

  const getXcUrl = (stream) => {
    if (!stream || !currentProfile) return null;
    const base = selectedServer.replace(/\/$/, "");
    const { username, password } = currentProfile;
    const id = stream.stream_id || stream.series_id;

    if (selectedSection === 'live') {
        return `${base}/${username}/${password}/${id}`;
    } else if (selectedSection === 'vod') {
        const ext = stream.container_extension || 'mp4';
        return `${base}/movie/${username}/${password}/${id}.${ext}`;
    }
    return null;
  };

  const playStream = async (stream) => {
    const finalUrl = getXcUrl(stream);
    if (!finalUrl) {
        if (selectedSection === 'series') alert("Series playback coming soon!");
        return;
    }
    
    if (playerMode === 'internal') {
        setCurrentStream({ ...stream, url: finalUrl });
    } else if (playerMode === 'cast') {
        if (!selectedCastDevice || selectedCastDevice === 'None') {
            alert("Please select a Cast device.");
            return;
        }
        window.api.castPlay(selectedCastDevice, finalUrl);
    } else {
        window.api.launchVLC(finalUrl, null, stream.name);
    }
  };

  // --- Effects ---

  useEffect(() => {
    const init = async () => {
        const config = await window.api.config.load();
        if (config.profiles?.length > 0) {
            const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
            setCurrentProfile(active);
            if (active.servers?.length > 0) setSelectedServer(active.servers[0]);
        } else {
            setShowProfiles(true);
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

  // --- Logic ---

  const groupedCategories = useMemo(() => {
    const currentCats = allCategories[selectedSection] || [];
    console.log(`[Filter Debug] Section: ${selectedSection}, EN Only: ${englishOnly}, Total Cats: ${currentCats.length}`);
    
    // Define English/Global allowlist for categories
    // Strictly Allow-only list (at START of string)
    const allowed = ["EN", "UK", "US", "GB", "MULTI", "NETFLIX", "APPLE+", "DISNEY+", "4K", "18", "24/7", "CHRISTMAS", "FORMULA", "FOR", "WORLDCUP"];

    const filtered = currentCats.filter(c => {
        const nameUpper = (c.category_name || "").toUpperCase();
        
        // Step 1: Search Query Filter
        if (searchQuery && !nameUpper.includes(searchQuery.toUpperCase())) return false;

        // Step 2: English Only Filter (Strict Allow List - Start of String)
        if (englishOnly) {
            return allowed.some(word => {
                const w = word.toUpperCase();
                
                // Remove leading pipes and spaces for the "starts with" check
                const cleanName = nameUpper.replace(/^[|\s]+/, "");
                
                // Match if the cleaned string starts with the word followed by a boundary
                return cleanName.startsWith(w + "|") || 
                       cleanName.startsWith(w + " ") || 
                       cleanName === w;
            });
        }

        return true;
    });

    console.log(`[Filter Debug] Cats after filter: ${filtered.length}`);

    const groups = {};
    filtered.forEach(cat => {
        const name = cat.category_name || "";
        let prefix = "General";
        
        if (name.includes('|')) {
            // Split and filter out empty strings (handles starting/trailing pipes)
            const parts = name.split('|').map(p => p.trim()).filter(p => p.length > 0);
            if (parts.length > 0) {
                prefix = parts[0];
            }
        } else {
            const firstWord = name.split(' ')[0];
            if (firstWord) prefix = firstWord;
        }

        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push(cat);
    });
    return groups;
  }, [allCategories, selectedSection, searchQuery, englishOnly]);

  const visibleStreams = useMemo(() => {
    if (!englishOnly) return streams;
    const forbidden = ["SWEDEN", "NORWAY", "DENMARK", "FINLAND", "DEUTSCH", "FRENCH", "ITALIAN", "SPANISH"];
    return streams.filter(s => !forbidden.some(word => s.name?.toUpperCase().includes(word)));
  }, [streams, englishOnly]);

  const handleCloseContextMenu = () => setContextMenu(null);
  const handleContextMenu = async (e, stream) => {
    e.preventDefault();
    const id = stream.stream_id || stream.series_id;
    
    // Initial state with basic info
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, stream, isLoading: true });

    // Fetch extended info in background
    if (selectedSection === 'vod' || selectedSection === 'series') {
        const action = selectedSection === 'vod' ? 'get_vod_info' : 'get_series_info';
        const paramKey = selectedSection === 'vod' ? 'vod_id' : 'series_id';
        
        try {
            const result = await window.api.xcApi({
                server: selectedServer,
                username: currentProfile.username,
                password: currentProfile.password,
                action,
                extraParams: { [paramKey]: id }
            });

            if (result.success) {
                setContextMenu(prev => ({
                    ...prev,
                    info: result.data.info,
                    isLoading: false
                }));
            } else {
                setContextMenu(prev => ({ ...prev, isLoading: false }));
            }
        } catch (err) {
            setContextMenu(prev => ({ ...prev, isLoading: false }));
        }
    } else {
        setContextMenu(prev => ({ ...prev, isLoading: false }));
    }
  };

  const copyToClipboard = (text) => {
    if (text) {
        navigator.clipboard.writeText(text);
        setStatus(`Copied URL to clipboard`);
    }
    handleCloseContextMenu();
  };

  return (
    <div className="container" onClick={handleCloseContextMenu}>
      <div className="header">
        <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={20} /> {currentProfile?.name || 'No Profile'}
        </div>
        
        <div className="controls">
          <button className="btn" onClick={() => setShowProfiles(true)}><Settings size={16} /> Profiles</button>
          
          <div style={{ display: 'flex', gap: '4px', background: '#25262b', padding: '2px', borderRadius: '4px' }}>
            {['live', 'vod', 'series'].map(s => (
                <button key={s} className={`btn ${selectedSection === s ? 'btn-primary' : ''}`} onClick={() => { setSelectedSection(s); setSelectedCategory(null); }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                    {s.toUpperCase()}
                </button>
            ))}
          </div>

          <select value={selectedServer} onChange={(e) => setSelectedServer(e.target.value)} style={{ width: '150px' }}>
            {currentProfile?.servers?.map(url => <option key={url} value={url}>{url}</option>)}
          </select>

          <button className="btn" onClick={() => fetchCategories()}><RefreshCw size={16} className={isLoading ? 'spin' : ''} /></button>
          
          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem' }}>
            <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} /> EN
          </label>
        </div>

        <div style={{ flex: 1 }}></div>

        <div className="controls">
            <div className="player-selector" style={{ display: 'flex', gap: '8px' }}>
                {['vlc', 'internal', 'cast'].map(m => (
                    <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem' }}>
                        <input type="radio" checked={playerMode === m} onChange={() => setPlayerMode(m)} /> {m.toUpperCase()}
                    </label>
                ))}
            </div>
            <input type="range" min="100" max="400" value={tileSize} onChange={(e) => setTileSize(Number(e.target.value))} style={{ width: '60px' }} />
            <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 6, top: 8, color: '#888' }} />
                <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ paddingLeft: '24px', width: '150px' }} />
            </div>
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
                        <div key={cat.category_id} className={`category-item ${selectedCategory === cat.category_id ? 'active' : ''}`} onClick={() => setSelectedCategory(cat.category_id)} style={{ paddingLeft: '32px' }}>
                            {cat.category_name}
                        </div>
                    ))}
                </div>
            ))}
          </div>
        </div>

        <div className="content-area">
          <div className="sidebar-header">Streams ({visibleStreams.length})</div>
          <div className="stream-list" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, 1fr))` }}>
            {visibleStreams.map((s) => {
                const id = s.stream_id || s.series_id;
                const logo = s.stream_icon || s.cover;
                return (
                    <div key={id} className="stream-card" onDoubleClick={() => playStream(s)} onContextMenu={(e) => handleContextMenu(e, s)}>
                        <CachedImage src={logo} alt={s.name} className="stream-logo" profileId={currentProfile?.id} />
                        <div className="stream-name">{s.name}</div>
                    </div>
                );
            })}
          </div>
        </div>
      </div>

      {currentStream && <VideoPlayer url={currentStream.url} title={currentStream.name} onClose={() => setCurrentStream(null)} />}
      <div className="status-bar">{status}</div>

      {contextMenu && (() => {
          const finalUrl = getXcUrl(contextMenu.stream);
          const info = contextMenu.info;
          return (
              <div className="context-menu" style={{ top: contextMenu.mouseY, left: contextMenu.mouseX }} onClick={e => e.stopPropagation()}>
                  <div className="context-menu-item" onClick={() => copyToClipboard(finalUrl)}>
                      <Copy size={14} /> <span>Copy URL</span>
                  </div>
                  <div className="context-menu-separator" />
                  
                  {contextMenu.isLoading ? (
                      <div className="context-menu-info" style={{ textAlign: 'center', opacity: 0.6 }}>Loading metadata...</div>
                  ) : info ? (
                      <div className="context-menu-metadata">
                          {info.plot && <div className="metadata-row"><strong>Plot:</strong> <div className="metadata-text">{info.plot}</div></div>}
                          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                            {info.director && <div className="metadata-row"><strong>Dir:</strong> {info.director}</div>}
                            {info.releasedate && <div className="metadata-row"><strong>Year:</strong> {info.releasedate.split('-')[0]}</div>}
                          </div>
                          {info.cast && <div className="metadata-row" style={{ marginTop: '8px' }}><strong>Cast:</strong> <div className="metadata-text" style={{ maxHeight: '40px' }}>{info.cast}</div></div>}
                          <div className="context-menu-separator" />
                      </div>
                  ) : null}

                  <div className="context-menu-info"><strong>ID:</strong> {contextMenu.stream.stream_id || contextMenu.stream.series_id}</div>
                  <div className="context-menu-info"><strong>URL:</strong> <div className="url-text">{finalUrl || 'N/A'}</div></div>
              </div>
          );
      })()}
    </div>
  );
}

export default App;