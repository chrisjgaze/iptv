import React, { useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

const Sidebar = ({
  allCategories,
  selectedSection,
  searchQuery,
  englishOnly,
  selectedCategory,
  setSelectedCategory,
  onViewReset
}) => {
  const [expandedGroups, setExpandedGroups] = React.useState({});

const groupedCategories = useMemo(() => {
    const currentCats = allCategories[selectedSection] || [];
    
    const groups = { 
        " Favorites": [{ category_id: 'favorites', category_name: '★ Favorites' }] 
    };

    currentCats.forEach(cat => {
        // 1. Clean up the name by removing leading special characters and whitespace
        const rawName = cat.category_name || "";
        const cleanName = rawName.replace(/^[|\s]+/, "").trim(); // Removes leading | and spaces
        
        if (!cleanName) return;

        let prefix = "General";

        // 2. Logic for Live TV Folders
        if (selectedSection === 'live') {
            if (cleanName.includes('|')) {
                prefix = cleanName.split('|')[0].trim();
            } else if (cleanName.includes(' ')) {
                prefix = cleanName.split(' ')[0].trim();
            } else {
                prefix = cleanName;
            }
        } 
        // 3. Logic for VOD and Series (Movie groupings)
        else {
            // For Movie/Series, check for the |EN| style or similar tags
            if (rawName.startsWith('|')) {
                // Extracts "EN" from "|EN| MOVIES"
                const parts = rawName.split('|').filter(p => p.trim().length > 0);
                prefix = parts[0] || "Movies";
            } else {
                // Default grouping for standard movie categories
                prefix = "Categories";
            }
        }

        if (!groups[prefix]) groups[prefix] = [];
        groups[prefix].push({
            ...cat,
            category_name: cleanName // Update the UI to show the sanitized name
        });
    });

    return groups;
}, [allCategories, selectedSection, searchQuery]);

  return (
    <div className="sidebar">
      <div className="sidebar-header">Categories</div>
      <div className="sidebar-list">
        {Object.entries(groupedCategories).sort().map(([prefix, cats]) => (
          <div key={prefix}>
            <div className="group-header" onClick={() => setExpandedGroups(p => ({ ...p, [prefix]: !p[prefix] }))}>
              {expandedGroups[prefix] ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {prefix}
            </div>
            {expandedGroups[prefix] && cats.map(cat => (
              <div
                key={cat.category_id}
                className={`category-item ${selectedCategory === cat.category_id ? 'active' : ''}`}
                onClick={() => { setSelectedCategory(cat.category_id); onViewReset(); }}
              >
                {cat.category_name}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Sidebar;