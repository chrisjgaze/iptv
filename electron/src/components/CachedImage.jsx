import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

const CachedImage = ({ src, alt, className, style, profileId, cacheMap, apiDebug }) => {
  const [imageSrc, setImageSrc] = useState(null);
  const [error, setError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const isMounted = useRef(true);
  const observerRef = useRef(null);
  const containerRef = useRef(null);
  const loadStartTime = useRef(null);

  // Reset load start time when src changes (new category/image)
  useEffect(() => {
    loadStartTime.current = performance.now();
    setImageSrc(null);
    setError(false);
    setIsVisible(false);
  }, [src]);

  useEffect(() => {
    isMounted.current = true;
    const t0 = performance.now();

    // Check if image is already cached - if so, set it immediately
    const cachedSrc = cacheMap && cacheMap[src];
    if (cachedSrc && profileId) {
      if (apiDebug) console.log(`[IMG OBSERVER] Image already cached, setting immediately (${(t0-loadStartTime.current).toFixed(1)}ms since load start)`);
      setImageSrc(cachedSrc);
      setIsVisible(true);
      return; // Skip IntersectionObserver for cached images
    }

    if (apiDebug) console.log(`[IMG OBSERVER] Setting up IntersectionObserver for uncached image (${(t0-loadStartTime.current).toFixed(1)}ms since load start)`);

    observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            const t1 = performance.now();
            if (apiDebug) console.log(`[IMG OBSERVER] IntersectionObserver fired (${(t1-loadStartTime.current).toFixed(1)}ms since load start)`);
            setIsVisible(true);
            if (observerRef.current) observerRef.current.disconnect();
        }
    }, { rootMargin: '400px' });

    if (containerRef.current) {
        observerRef.current.observe(containerRef.current);
    }

    return () => {
      isMounted.current = false;
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [src, cacheMap, apiDebug, profileId]);

  useEffect(() => {
    // Skip if already set by first useEffect
    if (imageSrc) return;

    if (!src || !profileId || !isVisible) {
      return;
    }

    const load = async () => {
      const t0 = performance.now();
      const timeSinceStart = (t0 - loadStartTime.current).toFixed(1);
      if (apiDebug) console.log(`[IMG LOAD] Starting image load (${timeSinceStart}ms since load start)`);

      // 1. Check the local cacheMap first (Synchronous lookup)
      // This is the "fast path" that avoids IPC bottlenecks
      if (cacheMap && cacheMap[src]) {
          if (isMounted.current) {
              const t1 = performance.now();
              if (apiDebug) console.log(`[IMG CACHE] ✓ HIT: ${src.substring(src.lastIndexOf('/')+1, src.lastIndexOf('/')+20)}... (${(t1-t0).toFixed(1)}ms, ${timeSinceStart}ms since load start)`);
              setImageSrc(cacheMap[src]);
              return;
          }
      }

      // 2. If not in the pre-warmed map, we treat it as potentially missing
      // But we set the remote URL so the user sees something immediately
      const t2 = performance.now();
      if (apiDebug) console.log(`[IMG CACHE] ✗ MISS: ${src.substring(src.lastIndexOf('/')+1, src.lastIndexOf('/')+20)}... Using remote URL (${(t2-t0).toFixed(1)}ms, ${timeSinceStart}ms since load start)`);

      if (isMounted.current) {
          setImageSrc(src);
      }

      try {
        // 3. Trigger background cache for next time
        if (window.api && window.api.cacheImage) {
            const t3 = performance.now();
            if (apiDebug) console.log(`[IMG CACHE] → Queueing background download for: ${src.substring(src.lastIndexOf('/')+1, src.lastIndexOf('/')+20)}...`);
            window.api.cacheImage({ url: src, profileId }).catch(e => {});
            const t4 = performance.now();
            if (apiDebug) console.log(`[IMG CACHE] ✓ Queued (${(t4-t3).toFixed(1)}ms, ${(t4-loadStartTime.current).toFixed(1)}ms total)`);
        }
      } catch (e) {}
    };

    load();
  }, [src, profileId, isVisible, cacheMap, apiDebug, imageSrc]);

  // Show image as soon as we have imageSrc, don't wait for isVisible
  if (imageSrc && !error) {
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
  }

  // Show placeholder while waiting for image or if error
  return (
    <div
      ref={containerRef}
      className={className}
      style={{...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111'}}
    >
      <ImageIcon size={20} color="#333" />
    </div>
  );
};

export default CachedImage;
