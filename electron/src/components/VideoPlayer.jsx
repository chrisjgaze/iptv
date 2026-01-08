import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import mpegts from 'mpegts.js';
import { X, AlertCircle } from 'lucide-react';

const VideoPlayer = ({ url, onClose, title }) => {
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({ res: '', speed: '', fps: '' });
  const playerRef = useRef(null); 

  console.log("VideoPlayer Rendering for:", url);

  // Close on ESC key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!url || !videoRef.current) return;

    const video = videoRef.current;
    let hls = null;
    let tsPlayer = null;
    let statsInterval = null;

    const updateStats = () => {
        if (!video) return;
        
        // Resolution
        const width = video.videoWidth;
        const height = video.videoHeight;
        const res = width && height ? `${width}x${height}` : '';

        let speedStr = '';
        let fpsStr = '';

        if (tsPlayer && tsPlayer.statisticsInfo) {
            const info = tsPlayer.statisticsInfo;
            // speed is in KB/s
            if (info.speed > 0) {
                speedStr = `${(info.speed * 8 / 1000).toFixed(2)} Mbps`; 
            }
            if (info.decodedFrames > 0) {
                // mpegts doesn't give instant FPS easily, but we can try estimating or just show dropped
                // info.fps might be available in some versions/forks, check for it
                if (info.fps) fpsStr = `${info.fps.toFixed(1)} fps`;
            }
        } else if (hls) {
            // HLS stats
            if (hls.bandwidthEstimate) {
                 speedStr = `${(hls.bandwidthEstimate / 1000 / 1000).toFixed(2)} Mbps (Est)`;
            }
            // Get current level info for bitrate
            const level = hls.levels ? hls.levels[hls.currentLevel] : null;
            if (level && level.bitrate) {
                 // override with actual variant bitrate if available
                 speedStr = `${(level.bitrate / 1000 / 1000).toFixed(2)} Mbps`;
            }
        }

        setStats({ res, speed: speedStr, fps: fpsStr });
    };

    const initPlayer = async () => {
        try {
            setError(null);
            const isM3U8 = url.toLowerCase().includes('.m3u8');
            const isTS = url.toLowerCase().includes('.ts') || url.includes('output=ts');

            if (isM3U8) {
                if (Hls.isSupported()) {
                    hls = new Hls({ enableWorker: false });
                    hls.loadSource(url);
                    hls.attachMedia(video);
                    playerRef.current = hls;
                } else {
                    video.src = url;
                }
            } else if (isTS) {
                const mpegtsLib = mpegts.default || mpegts;
                if (mpegtsLib && mpegtsLib.isSupported()) {
                    tsPlayer = mpegtsLib.createPlayer({
                        type: 'mpegts',
                        isLive: true,
                        url: url
                    }, {
                        enableWorker: false,
                        stashInitialSize: 128 // Reduce latency
                    });
                    tsPlayer.attachMediaElement(video);
                    tsPlayer.load();
                    playerRef.current = tsPlayer;

                    tsPlayer.on('error', (type, details) => {
                        console.error("MpegTS Error:", type, details);
                        if (details === 'FormatUnsupported' || type === 'MediaError') {
                             setError(`Format Not Supported (Likely Audio Codec). Use VLC.`);
                        }
                    });
                }
            } else {
                video.src = url;
            }

            video.play().catch(err => {
                console.warn("Autoplay blocked or failed:", err);
            });
            
            // Start stats loop
            statsInterval = setInterval(updateStats, 1000);

        } catch (e) {
            console.error("Player initialization error:", e);
            setError(`Failed to initialize player: ${e.message}`);
        }
    };

    initPlayer();

    return () => {
      if (statsInterval) clearInterval(statsInterval);
      if (hls) { hls.destroy(); }
      if (tsPlayer) {
          try {
            tsPlayer.pause();
            tsPlayer.unload();
            tsPlayer.detachMediaElement();
            tsPlayer.destroy();
          } catch (e) { console.error("Cleanup error:", e); }
      }
      playerRef.current = null;
    };
  }, [url]);

  return (
    <div className="video-overlay" style={{ zIndex: 99999 }}>
      {/* Absolute Close Button - Always on top */}
      <button 
        onClick={onClose} 
        style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            zIndex: 100000,
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: 'white',
            borderRadius: '50%',
            width: '50px',
            height: '50px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(0,0,0,0.5)'
        }}
        title="Close (Esc)"
      >
        <X size={32} />
      </button>

      <div className="video-container" onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        <div className="video-header">
            <span style={{ fontWeight: 'bold' }}>{title || "Now Playing"}</span>
            <div style={{ fontSize: '0.85rem', color: '#ccc', display: 'flex', gap: '15px' }}>
                {stats.res && <span>{stats.res}</span>}
                {stats.fps && <span>{stats.fps}</span>}
                {stats.speed && <span style={{ color: '#4dabf7' }}>{stats.speed}</span>}
            </div>
        </div>
        
        <div style={{ position: 'relative', flex: 1, backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0, overflow: 'hidden' }}>
            {error && (
                <div className="video-error" style={{ position: 'absolute', zIndex: 20 }}>
                    <AlertCircle size={48} style={{ marginBottom: '15px' }} />
                    <p style={{ fontSize: '1.1rem', maxWidth: '80%' }}>{error}</p>
                    <button className="btn btn-primary" onClick={onClose} style={{ marginTop: '20px' }}>
                        Close and switch to VLC
                    </button>
                </div>
            )}
            
            <video 
                ref={videoRef} 
                controls 
                style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: error ? 'none' : 'block' 
                }} 
            />
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;