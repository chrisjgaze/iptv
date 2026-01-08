import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

const CachedImage = ({ src, alt, className, style }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [error, setError] = useState(false);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    if (!src) return;

    const load = async () => {
      try {
        // 1. Check local cache
        if (window.api && window.api.checkImageCache) {
            const cachedPath = await window.api.checkImageCache(src);
            if (cachedPath && isMounted.current) {
                setImageSrc(cachedPath);
                return;
            }
        }

        // 2. If not cached, use remote URL immediately (for speed)
        if (isMounted.current) {
            setImageSrc(src);
        }

        // 3. Trigger background cache for next time
        if (window.api && window.api.cacheImage) {
            window.api.cacheImage(src).catch(e => {}); // Fire and forget
        }

      } catch (e) {
        if (isMounted.current) setImageSrc(src);
      }
    };

    load();

    return () => {
      isMounted.current = false;
    };
  }, [src]);

  if (error || !imageSrc) {
    // Placeholder while loading or on error
    return (
        <div className={className} style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111'}}>
            <ImageIcon size={20} color="#333" />
        </div>
    );
  }

  return (
    <img 
        src={imageSrc} 
        alt={alt} 
        className={className} 
        style={style}
        onError={() => setError(true)}
    />
  );
};

export default CachedImage;
