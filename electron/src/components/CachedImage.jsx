import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

const CachedImage = ({ src, alt, className, style, profileId }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const isMounted = useRef(true);
  const observerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    isMounted.current = true;
    
    observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            setIsVisible(true);
            if (observerRef.current) observerRef.current.disconnect();
        }
    }, { rootMargin: '200px' }); // Load when within 200px of viewport

    if (containerRef.current) {
        observerRef.current.observe(containerRef.current);
    }

    return () => {
      isMounted.current = false;
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!src || !profileId || !isVisible) return;

    const load = async () => {
      try {
        // 1. Check local cache
        if (window.api && window.api.checkImageCache) {
            const cachedPath = await window.api.checkImageCache({ src, profileId });
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
            window.api.cacheImage({ src, profileId }).catch(e => {}); // Fire and forget
        }

      } catch (e) {
        if (isMounted.current) setImageSrc(src);
      }
    };

    load();
  }, [src, profileId, isVisible]);

  if (error || !imageSrc || !isVisible) {
    // Placeholder while loading, off-screen, or on error
    return (
        <div 
            ref={containerRef}
            className={className} 
            style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111'}}
        >
            <ImageIcon size={20} color="#333" />
        </div>
    );
  }

  return (
    <img 
        ref={containerRef}
        src={imageSrc} 
        alt={alt} 
        className={className} 
        style={style}
        onError={() => setError(true)}
    />
  );
};

export default CachedImage;
