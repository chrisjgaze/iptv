import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Check, Edit2 } from 'lucide-react';

const ProfileManager = ({ onClose, onProfileChanged }) => {
    const [profiles, setProfiles] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    
    // Form State
    const [formData, setFormData] = useState({
        name: '',
        username: '',
        password: '',
        server: ''
    });

    useEffect(() => {
        loadProfiles();
    }, []);

    const loadProfiles = async () => {
        if (window.api && window.api.config) {
            const config = await window.api.config.load();
            setProfiles(config.profiles || []);
            setActiveId(config.activeProfileId);
        }
    };

    const handleSaveConfig = async (newProfiles, newActiveId) => {
        if (window.api && window.api.config) {
            await window.api.config.save({
                profiles: newProfiles,
                activeProfileId: newActiveId
            });
            setProfiles(newProfiles);
            setActiveId(newActiveId);
            onProfileChanged(newProfiles.find(p => p.id === newActiveId));
        }
    };

    const handleAdd = () => {
        const newId = Date.now().toString();
        const newProfile = { id: newId, name: 'New Provider', username: '', password: '', server: 'http://' };
        setFormData(newProfile);
        setEditingId(newId);
        // Don't save to list yet, wait for user to save form
    };

    const handleEdit = (profile) => {
        setFormData({ ...profile });
        setEditingId(profile.id);
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this profile?")) {
            const updatedProfiles = profiles.filter(p => p.id !== id);
            let nextActive = activeId;
            if (activeId === id) {
                nextActive = updatedProfiles.length > 0 ? updatedProfiles[0].id : null;
            }
            await handleSaveConfig(updatedProfiles, nextActive);
            if (editingId === id) setEditingId(null);
        }
    };

    const handleFormSave = async () => {
        let updatedProfiles;
        const existingIndex = profiles.findIndex(p => p.id === formData.id);
        
        if (existingIndex >= 0) {
            updatedProfiles = [...profiles];
            updatedProfiles[existingIndex] = formData;
        } else {
            updatedProfiles = [...profiles, formData];
        }

        // If it's the first profile, make it active automatically
        const nextActive = activeId || formData.id;
        
        await handleSaveConfig(updatedProfiles, nextActive);
        setEditingId(null);
    };

    const handleSetActive = async (id) => {
        await handleSaveConfig(profiles, id);
    };

    const isEditing = editingId !== null;

    return (
        <div className="downloads-modal" style={{ width: '600px', height: '500px' }}>
            <div className="downloads-header">
                <span>Manage Profiles</span>
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                    <X size={16} />
                </button>
            </div>
            
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                {/* Left: List */}
                <div style={{ width: '200px', borderRight: '1px solid #373a40', display: 'flex', flexDirection: 'column', backgroundColor: '#25262b' }}>
                    <div style={{ padding: '10px', borderBottom: '1px solid #373a40' }}>
                        <button className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '5px' }} onClick={handleAdd}>
                            <Plus size={14} /> Add New
                        </button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {profiles.map(p => (
                            <div 
                                key={p.id}
                                onClick={() => handleEdit(p)}
                                style={{ 
                                    padding: '10px', 
                                    cursor: 'pointer',
                                    backgroundColor: editingId === p.id ? '#2c2e33' : 'transparent',
                                    borderLeft: activeId === p.id ? '3px solid #339af0' : '3px solid transparent',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{ fontWeight: activeId === p.id ? 'bold' : 'normal', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {p.name}
                                </span>
                                {activeId === p.id && <Check size={14} color="#339af0" />}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Right: Form */}
                <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#1a1b1e' }}>
                    {isEditing ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <h3 style={{ margin: '0 0 10px 0' }}>{profiles.find(p => p.id === formData.id) ? 'Edit Profile' : 'New Profile'}</h3>
                            
                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#909296', marginBottom: '4px' }}>Profile Name</label>
                                <input 
                                    style={{ width: '100%' }} 
                                    value={formData.name} 
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="e.g. My Provider"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#909296', marginBottom: '4px' }}>Server URL (http://...)</label>
                                <input 
                                    style={{ width: '100%' }} 
                                    value={formData.server} 
                                    onChange={e => setFormData({...formData, server: e.target.value})}
                                    placeholder="http://domain.com"
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#909296', marginBottom: '4px' }}>Username</label>
                                <input 
                                    style={{ width: '100%' }} 
                                    value={formData.username} 
                                    onChange={e => setFormData({...formData, username: e.target.value})}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: '#909296', marginBottom: '4px' }}>Password</label>
                                <input 
                                    type="password"
                                    style={{ width: '100%' }} 
                                    value={formData.password} 
                                    onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button className="btn btn-primary" onClick={handleFormSave} style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: '5px' }}>
                                    <Save size={14} /> Save
                                </button>
                                {profiles.find(p => p.id === formData.id) && (
                                    <>
                                        <button 
                                            className="btn" 
                                            onClick={() => handleSetActive(formData.id)} 
                                            disabled={activeId === formData.id}
                                            style={{ flex: 1 }}
                                        >
                                            {activeId === formData.id ? 'Active' : 'Set Active'}
                                        </button>
                                        <button className="btn" style={{ borderColor: '#ff6b6b', color: '#ff6b6b' }} onClick={() => handleDelete(formData.id)}>
                                            <Trash2 size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
                            Select a profile to edit or create new
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ProfileManager;
