export const SERVER_URLS = [
  "http://vpn.tsclean.cc",
  "http://line.tsclean.cc",
  "http://line.protv.cc:8000",
  "http://line.beetx.cc"
];

export const parseM3U = (content) => {
  const lines = content.split('\n');
  const streams = [];
  const categories = new Set();
  
  let currentStream = null;

  lines.forEach(line => {
    const l = line.trim();
    if (!l) return;

    if (l.startsWith('#EXTINF:')) {
      currentStream = { raw: l };
      
      // Extract Group Title
      const groupMatch = l.match(/group-title="([^"]*)"/i);
      const groupTitle = groupMatch ? groupMatch[1].trim() : "Uncategorized";
      currentStream.group_title = groupTitle || "Uncategorized";
      categories.add(currentStream.group_title);

      // Extract Logo
      const logoMatch = l.match(/tvg-logo="([^"]*)"/i);
      if (logoMatch) {
        currentStream.tvg_logo = logoMatch[1].trim();
      }

      // Extract Name
      const parts = l.split(',');
      currentStream.name = parts.length > 1 ? parts[parts.length - 1].trim() : "Unknown";
      
    } else if (l.startsWith('#EXTGRP:') && currentStream) {
      const groupName = l.replace('#EXTGRP:', '').trim();
      if (groupName) {
         // Update category if EXTGRP is present (overrides EXTINF sometimes)
         // Note: In Python we discarded the old one from the set, but here we just add the new one.
         // Cleaning up the set later is fine or just having both if logic demands.
         // For now let's just update the stream record.
         currentStream.group_title = groupName;
         categories.add(groupName);
      }
    } else if (!l.startsWith('#') && currentStream) {
      currentStream.url = l;
      streams.push(currentStream);
      currentStream = null;
    }
  });

  return {
    categories: Array.from(categories).sort(),
    streams
  };
};

export const getRewrittenUrl = (originalUrl, selectedServerBase) => {
  if (!originalUrl || !selectedServerBase) return originalUrl;
  
  try {
    const originalObj = new URL(originalUrl);
    const serverObj = new URL(selectedServerBase);
    
    originalObj.protocol = serverObj.protocol;
    originalObj.host = serverObj.host; // Includes port if present
    
    return originalObj.toString();
  } catch (e) {
    console.error("URL rewrite error:", e);
    return originalUrl;
  }
};
