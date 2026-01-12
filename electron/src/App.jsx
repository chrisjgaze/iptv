import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Settings, User, ArrowDown, Search, RefreshCw } from 'lucide-react';

// Components - Ensure these files exist in /src/components/
import VideoPlayer from './components/VideoPlayer';
import StreamCard from './components/StreamCard';
import ProfileManager from './components/ProfileManager';
import Sidebar from './components/Sidebar';
import DownloadManager from './components/DownloadManager';

function App() {
  // --- Core State ---
  const [currentProfile, setCurrentProfile] = useState(null);
  const [selectedServer, setSelectedServer] = useState('');
  const [showProfiles, setShowProfiles] = useState(false);
  const [status, setStatus] = useState('Ready');

  // --- Content State ---
  const [selectedSection, setSelectedSection] = useState('live');
  const [allCategories, setAllCategories] = useState({ live: [], vod: [], series: [] });
  const [streams, setStreams] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);

  // --- UI & Filter State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(100);
  const [gridColumns, setGridColumns] = useState(6);
  const [englishOnly, setEnglishOnly] = useState(false); //

  // --- Player State (Ref-Sync for Logic Verification) ---
  const [playerMode, setPlayerMode] = useState('vlc');
  const playerModeRef = useRef('vlc'); //
  const [castDevices, setCastDevices] = useState([]);
  const [selectedCastDevice, setSelectedCastDevice] = useState('None Found');
  const [currentStream, setCurrentStream] = useState(null);
  const [showDownloadManager, setShowDownloadManager] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const [imageCacheMap, setImageCacheMap] = useState({});

  // Synchronize Ref with State to bypass async lag
  useEffect(() => {
    playerModeRef.current = playerMode;
  }, [playerMode]);

  // --- 1. Boot Logic ---
  useEffect(() => {
    const init = async () => {
      try {
        const config = await window.api.config.load(); //
        if (config?.profiles?.length > 0) {
          const active = config.profiles.find(p => p.id === config.activeProfileId) || config.profiles[0];
          setCurrentProfile(active);
          setFavorites(active.favorites || []);
          if (active.servers?.length > 0) setSelectedServer(active.servers[0]);
          const mode = active.playerMode || 'vlc';
          setPlayerMode(mode);
          playerModeRef.current = mode;
        } else {
          setShowProfiles(true);
        }
      } catch (err) {
        console.error("Failed to load config:", err);
        setStatus("Error loading configuration.");
      }
    };
    init();
  }, []);

  // --- 2. Chromecast Discovery Listener ---
  useEffect(() => {
    // Register the callback defined in your preload/backend
    const unsubscribe = window.api.onCastDeviceFound((deviceName) => {
      console.log('New Cast device discovered:', deviceName);
      setCastDevices(prev => {
        if (prev.includes(deviceName)) return prev;
        const updated = [...prev, deviceName];
        if (selectedCastDevice === 'None Found') setSelectedCastDevice(deviceName);
        return updated;
      });
    });

    // Initial scan trigger
    window.api.castScan().then(devices => {
      if (devices?.length > 0) {
        setCastDevices(devices);
        setSelectedCastDevice(devices[0]);
      }
    });

    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  // --- 3. Data Management ---
  useEffect(() => {
    if (currentProfile && selectedServer) {
      ['live', 'vod', 'series'].forEach(section => fetchCategories(section));
    }
  }, [currentProfile?.id, selectedServer]);

  useEffect(() => {
    if (selectedCategory) fetchStreams(selectedCategory);
  }, [selectedCategory, selectedSection]);

  const fetchCategories = async (section, bypassCache = false) => {
    if (!currentProfile || !selectedServer) return;
    const actionMap = { live: 'get_live_categories', vod: 'get_vod_categories', series: 'get_series_categories' };
    const result = await window.api.xcApi({
      server: selectedServer, username: currentProfile.username, password: currentProfile.password,
      action: actionMap[section], bypassCache //
    });
    if (result.success) setAllCategories(prev => ({ ...prev, [section]: result.data }));
  };

  const fetchStreams = async (catId) => {
    if (!currentProfile) return;
    const actionMap = { live: 'get_live_streams', vod: 'get_vod_streams', series: 'get_series' };
    const result = await window.api.xcApi({
      server: selectedServer, username: currentProfile.username, password: currentProfile.password,
      action: actionMap[selectedSection], extraParams: { category_id: catId }
    });

    if (result.success) {
      const data = Array.isArray(result.data) ? result.data : [];
      setStreams(data);
      // Batch check cache for local icons
      const urls = data.map(s => s.stream_icon || s.cover).filter(u => !!u);
      if (urls.length > 0) {
        window.api.checkImageCacheBatch({ urls, profileId: currentProfile.id })
          .then(res => setImageCacheMap(prev => ({ ...prev, ...res })));
      }
    }
  };

  // --- 4. Actions: Playback & Refresh ---
  const playStream = async (stream) => {
    if (!currentProfile || !selectedServer) return;
    const base = selectedServer.replace(/\/$/, "");
    const id = stream.stream_id || stream.id;
    let url = "";

    if (selectedSection === 'live') {
      url = `${base}/${currentProfile.username}/${currentProfile.password}/${id}.ts`;
    } else {
      const ext = stream.container_extension || 'mp4';
      const path = selectedSection === 'series' ? 'series' : 'movie';
      url = `${base}/${path}/${currentProfile.username}/${currentProfile.password}/${id}.${ext}`;
    }

    const mode = playerModeRef.current; // Synchronous check
    if (mode === 'internal') {
      setCurrentStream({ ...stream, url });
    } else if (mode === 'cast') {
      window.api.castPlay(selectedCastDevice, url); //
    } else {
      window.api.launchVLC(url, null, stream.name || stream.title); //
    }
  };

  const handleRefresh = async () => { //
    setStatus('Refreshing...');
    setImageCacheMap({});
    setStreams([]);
    await window.api.cleanupProfileImages({ profileId: currentProfile.id, validUrls: [] }); //
    ['live', 'vod', 'series'].forEach(s => fetchCategories(s, true));
    setStatus('Ready');
  };

  // --- 5. Filtering Logic ---
  const visibleStreams = useMemo(() => {
    return streams.filter(s => {
      const name = (s.name || s.title || "").toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase());
      if (englishOnly) { //
        const isEnglish = name.includes('|en|') || name.includes('(en)') || name.includes('english') || name.includes('uk |');
        return matchesSearch && isEnglish;
      }
      return matchesSearch;
    }).slice(0, displayCount);
  }, [streams, searchQuery, displayCount, englishOnly]);

  return (
    <div className="container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#101113', color: 'white' }}>
      <header className="header" style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '10px 20px', backgroundColor: '#1a1b1e', borderBottom: '1px solid #2c2e33' }}>
        <div onClick={() => setShowProfiles(true)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <User size={20} /> <strong>{currentProfile?.name || 'Guest'}</strong>
        </div>

        <div className="controls" style={{ display: 'flex', alignItems: 'center', gap: '15px', flex: 1 }}>
          <div className="section-tabs" style={{ display: 'flex', gap: '4px' }}>
            {['live', 'vod', 'series'].map(s => (
              <button key={s}
                style={{ padding: '6px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer', backgroundColor: selectedSection === s ? '#339af0' : '#2c2e33', color: 'white' }}
                onClick={() => setSelectedSection(s)}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="player-radio-group" style={{ display: 'flex', gap: '10px', background: '#2c2e33', padding: '6px 12px', borderRadius: '4px' }}>
            {['vlc', 'internal', 'cast'].map((mode) => (
              <label key={mode} style={{ fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <input type="radio" name="pMode" value={mode} checked={playerMode === mode} onChange={(e) => {
                  setPlayerMode(e.target.value);
                  if (e.target.value !== 'internal') setCurrentStream(null);
                }} />
                {mode.toUpperCase()}
              </label>
            ))}
            {playerMode === 'cast' && (
              <select value={selectedCastDevice} onChange={(e) => setSelectedCastDevice(e.target.value)} style={{ background: '#1a1b1e', color: '#339af0', border: '1px solid #339af0', fontSize: '0.75rem' }}>
                {castDevices.length > 0 ? castDevices.map(d => <option key={d} value={d}>{d}</option>) : <option>Scanning...</option>}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
              <input type="checkbox" checked={englishOnly} onChange={(e) => setEnglishOnly(e.target.checked)} /> English
            </label>
            <button onClick={handleRefresh} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}><RefreshCw size={16} /></button>
            <span>Grid: {gridColumns}</span>
            <input type="range" min="2" max="10" value={gridColumns} onChange={(e) => setGridColumns(parseInt(e.target.value))} />
          </div>

          <button onClick={() => setShowDownloadManager(true)} style={{ background: 'none', border: 'none', color: 'white' }}><ArrowDown size={20} /></button>

          <div style={{ position: 'relative', flex: 1 }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#909296' }} />
            <input type="text" placeholder="Search streams..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 32px', background: '#2c2e33', border: 'none', color: 'white', borderRadius: '4px' }} />
          </div>
        </div>
      </header>

      <main style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar allCategories={allCategories} selectedSection={selectedSection} searchQuery={searchQuery} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} onViewReset={() => { }} />
        <div className="content-area" style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns}, 1fr)`, gap: '15px' }}>
            {visibleStreams.map(s => (
              <StreamCard key={s.stream_id || s.series_id} stream={s} profileId={currentProfile?.id} cacheMap={imageCacheMap} onDoubleClick={() => playStream(s)} sectionType={selectedSection} />
            ))}
          </div>
        </div>
      </main>

      {currentStream && playerMode === 'internal' && <VideoPlayer url={currentStream.url} title={currentStream.name || currentStream.title} onClose={() => setCurrentStream(null)} />}
      {showDownloadManager && <DownloadManager onClose={() => setShowDownloadManager(false)} />}
      {showProfiles && <ProfileManager onProfileChanged={setCurrentProfile} onClose={() => setShowProfiles(false)} />}
      <div className="status-bar" style={{ padding: '4px 10px', background: '#1a1b1e', fontSize: '0.75rem' }}>{status}</div>
    </div>
  );
}

export default App;