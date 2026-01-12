import React, { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';

const DownloadManager = ({ onClose }) => {
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    // Listen for 'download-progress' events from download-manager.js
    const unsubscribe = window.api.onDownloadProgress((data) => {
      setDownloads(prev => {
        const index = prev.findIndex(d => d.id === data.id);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = { ...updated[index], ...data };
          return updated;
        }
        return [...prev, data];
      });
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="download-manager-panel">
      <div className="panel-header">
        <h3><Download size={16} /> Downloads</h3>
        <button onClick={onClose}><X size={16} /></button>
      </div>
      <div className="panel-body">
        {downloads.map(dl => (
          <div key={dl.id} className="dl-row">
            <div className="dl-name">{dl.name}</div>
            <div className="progress-container">
               <div className="progress-bar" style={{ width: `${dl.progress}%` }} />
            </div>
            <div className="dl-meta">
              <span>{dl.status}</span>
              <span>{dl.speed}</span>
              <button onClick={() => window.api.cancelDownload(dl.id)}>Cancel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DownloadManager;