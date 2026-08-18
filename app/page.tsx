'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Unlock, Plus, FileText, CheckSquare, Trash2, KeyRound, Search, X } from 'lucide-react';
import { encryptData, decryptData } from '@/lib/crypto';

type NoteType = 'note' | 'tasks';
type ViewState = 'all_notes' | 'task_board' | 'locked' | 'editor';

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
}

interface StoredNote {
  id: string;
  title: string;
  isLocked: boolean;
  type: NoteType;
  payload: string;
  updatedAt: number;
}

export default function CipherNotesApp() {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [currentView, setCurrentView] = useState<ViewState>('all_notes');
  
  // Active Note State
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('');
  const [activeContent, setActiveContent] = useState('');
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [activeIsLocked, setActiveIsLocked] = useState(false);
  const [activeType, setActiveType] = useState<NoteType>('note');
  
  const [searchQuery, setSearchQuery] = useState('');
  
  // Security State
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean; action: 'unlock_vault' | 'lock_note' | 'unlock_note'; targetId?: string }>({ isOpen: false, action: 'unlock_vault' });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('cipher_notes_data');
    if (stored) {
      try { setNotes(JSON.parse(stored)); } catch (e) { console.error(e); }
    } else {
      const initNote: StoredNote = {
        id: crypto.randomUUID(),
        title: 'WELCOME_TO_VOID',
        isLocked: false,
        type: 'note',
        payload: '> Initializing decentralized protocol...\n\nThe architecture must remain entirely serverless. Private keys are sharded across three hardware tokens. Use the internal ghost-bridge for all subsequent communications.\n\n- Create standard notes or task boards.\n- Access the hidden Secure Enclave for encrypted data.\n- Zero network footprint. All data remains local.',
        updatedAt: Date.now()
      };
      setNotes([initNote]);
      localStorage.setItem('cipher_notes_data', JSON.stringify([initNote]));
    }
  }, []);

  const saveToStorage = (updated: StoredNote[]) => {
    setNotes(updated);
    localStorage.setItem('cipher_notes_data', JSON.stringify(updated));
  };

  const handleCreateNote = (type: NoteType) => {
    const newNote: StoredNote = {
      id: crypto.randomUUID(),
      title: 'UNTITLED_' + (type === 'tasks' ? 'TASKS' : 'DOC'),
      isLocked: false,
      type: type,
      payload: type === 'tasks' ? '[]' : '',
      updatedAt: Date.now()
    };
    saveToStorage([newNote, ...notes]);
    openEditor(newNote);
  };

  const openEditor = (note: StoredNote, decryptedPayload?: string) => {
    setActiveNoteId(note.id);
    setActiveTitle(note.title);
    setActiveIsLocked(note.isLocked);
    setActiveType(note.type);
    
    let payloadToParse = (note.isLocked && decryptedPayload) ? decryptedPayload : note.payload;
    if (note.isLocked && !decryptedPayload) payloadToParse = ""; 
    
    if (note.type === 'tasks') {
      try { setActiveTasks(payloadToParse ? JSON.parse(payloadToParse) : []); setActiveContent(''); } 
      catch (e) { setActiveTasks([]); }
    } else {
      setActiveContent(payloadToParse || '');
      setActiveTasks([]);
    }
    setCurrentView('editor');
  };

  const saveActiveNote = async (forceLock?: boolean, pwd?: string) => {
    if (!activeNoteId) return;
    const isLocked = forceLock !== undefined ? forceLock : activeIsLocked;
    let payload = activeType === 'tasks' ? JSON.stringify(activeTasks) : activeContent;
    
    if (isLocked) {
      const pass = pwd || sessionPassword;
      if (!pass) return; 
      try {
         payload = await encryptData(payload, pass);
      } catch(e) { console.error("Encryption failed", e); return; }
    }

    const updated = notes.map(n => n.id === activeNoteId ? {
      ...n, title: activeTitle, payload, isLocked, updatedAt: Date.now()
    } : n);
    saveToStorage(updated);
    setActiveIsLocked(isLocked);
  };

  const closeEditor = () => {
    saveActiveNote();
    setActiveNoteId(null);
    setCurrentView(activeIsLocked ? 'locked' : (activeType === 'tasks' ? 'task_board' : 'all_notes'));
  };

  const deleteNote = (id: string) => {
    saveToStorage(notes.filter(n => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setCurrentView('all_notes');
    }
  };

  // Password / Vault Logic
  const handlePasswordSubmit = async () => {
    if (!passwordInput) { setPasswordError('EMPTY_PAYLOAD'); return; }

    if (passwordPrompt.action === 'unlock_vault') {
      // If we are unlocking the vault, we just set the session password and verify if it opens any locked notes (optional check)
      setSessionPassword(passwordInput);
      setVaultUnlocked(true);
      setCurrentView('locked');
      setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
    } 
    else if (passwordPrompt.action === 'unlock_note') {
      const note = notes.find(n => n.id === passwordPrompt.targetId);
      if (!note) return;
      try {
        const decrypted = await decryptData(note.payload, passwordInput);
        setSessionPassword(passwordInput);
        setVaultUnlocked(true);
        openEditor(note, decrypted);
        setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
      } catch (e) {
        setPasswordError('DECRYPTION_FAILED_INVALID_KEY');
      }
    }
    else if (passwordPrompt.action === 'lock_note') {
      setSessionPassword(passwordInput);
      setVaultUnlocked(true);
      await saveActiveNote(true, passwordInput);
      setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
    }
  };

  const lockVault = () => {
    setSessionPassword(null);
    setVaultUnlocked(false);
    if (currentView === 'locked' || (currentView === 'editor' && activeIsLocked)) {
      setActiveNoteId(null);
      setCurrentView('all_notes');
    }
  };

  const handleNoteSelect = (note: StoredNote) => {
    if (note.isLocked) {
      if (sessionPassword) {
        // Try background unlock
        decryptData(note.payload, sessionPassword)
          .then(dec => openEditor(note, dec))
          .catch(() => {
            setSessionPassword(null);
            setVaultUnlocked(false);
            setPasswordPrompt({ isOpen: true, action: 'unlock_note', targetId: note.id });
            setPasswordInput('');
            setPasswordError('');
          });
      } else {
        setPasswordPrompt({ isOpen: true, action: 'unlock_note', targetId: note.id });
        setPasswordInput('');
        setPasswordError('');
      }
    } else {
      openEditor(note);
    }
  };

  // Editor Actions
  const handleTaskToggle = (taskId: string) => {
    setActiveTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  };
  const handleTaskAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      setActiveTasks([...activeTasks, { id: crypto.randomUUID(), text: e.currentTarget.value.trim(), completed: false }]);
      e.currentTarget.value = '';
    }
  };
  const handleTaskDelete = (taskId: string) => {
    setActiveTasks(prev => prev.filter(t => t.id !== taskId));
  };
  const toggleLockState = () => {
    if (activeIsLocked) {
      if (sessionPassword) saveActiveNote(false); // Remove encryption
    } else {
      if (sessionPassword) saveActiveNote(true, sessionPassword);
      else {
        setPasswordPrompt({ isOpen: true, action: 'lock_note' });
        setPasswordInput('');
        setPasswordError('');
      }
    }
  };

  // Global Tasks logic
  const toggleGlobalTask = (noteId: string, taskId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note) return;
    try {
      const tList: TaskItem[] = JSON.parse(note.payload);
      const updatedList = tList.map(t => t.id === taskId ? {...t, completed: !t.completed} : t);
      const updatedNotes = notes.map(n => n.id === noteId ? {...n, payload: JSON.stringify(updatedList), updatedAt: Date.now()} : n);
      saveToStorage(updatedNotes);
    } catch(e) {}
  };

  // Filtering
  const filteredNotes = notes.filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase())).sort((a,b) => b.updatedAt - a.updatedAt);
  const unlockedNotes = filteredNotes.filter(n => !n.isLocked);
  const lockedNotes = filteredNotes.filter(n => n.isLocked);
  const globalTasksNotes = notes.filter(n => !n.isLocked && n.type === 'tasks');

  // Render Helpers
  const renderNoteCard = (note: StoredNote) => (
    <div 
      key={note.id} 
      onClick={() => handleNoteSelect(note)}
      className="border-4 border-[#CCFF00] bg-black/40 p-4 font-mono cursor-pointer hover:bg-[#CCFF00] hover:text-black transition-colors group flex flex-col justify-between aspect-square"
    >
      <div>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-bold opacity-60 group-hover:opacity-100">
            {new Date(note.updatedAt).toLocaleDateString()}
          </span>
          {note.isLocked && <Lock className="w-4 h-4" />}
          {!note.isLocked && note.type === 'tasks' && <CheckSquare className="w-4 h-4" />}
          {!note.isLocked && note.type === 'note' && <FileText className="w-4 h-4" />}
        </div>
        <h3 className="font-black text-xl uppercase italic break-words leading-tight mt-2">{note.title}</h3>
      </div>
      <div className="mt-4 text-xs opacity-50 font-bold truncate group-hover:opacity-80">
        ID: {note.id.slice(0,8)}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-[#1A0033] text-[#CCFF00] font-sans p-8 flex flex-col overflow-hidden selection:bg-[#FF0099] selection:text-white">
      
      {/* HEADER */}
      <header className="flex justify-between items-start border-b-8 border-[#CCFF00] pb-6 mb-8 shrink-0">
        <div>
          <h1 className="text-8xl lg:text-9xl font-black uppercase tracking-tighter leading-none italic cursor-pointer" onClick={() => setCurrentView('all_notes')}>
            VOID <br/> <span className="text-[#FF0099]">DOCS</span>
          </h1>
          <p className="font-mono text-sm mt-4 bg-[#CCFF00] text-black inline-block px-2 font-bold">
            END-TO-END_ENCRYPTED_ENCLAVE_V4.02
          </p>
        </div>
        <div className="flex flex-col items-end gap-4">
          <div className="w-24 h-24 lg:w-32 lg:h-32 bg-[#FF0099] border-4 border-black flex items-center justify-center rotate-3 shadow-[10px_10px_0px_0px_rgba(204,255,0,1)]">
            <div className="text-black font-black text-5xl lg:text-6xl">?</div>
          </div>
          <div className="text-right mt-2">
            <p className="text-xs font-mono uppercase opacity-70 font-bold">User_Identity</p>
            <p className="text-lg lg:text-xl font-bold">ANON_GHOST_99</p>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT GRID */}
      <main className="flex-1 grid grid-cols-12 gap-8 overflow-hidden min-h-0">
        
        {/* LEFT NAV */}
        <aside className="col-span-3 flex flex-col gap-6 border-r-4 border-[#CCFF00]/30 pr-6 overflow-y-auto">
          <nav className="flex flex-col gap-3">
            <div 
              onClick={() => { setActiveNoteId(null); setCurrentView('all_notes'); }}
              className={`p-3 font-black text-2xl skew-x-[-10deg] cursor-pointer transition-all border-4 ${currentView === 'all_notes' ? 'bg-[#CCFF00] text-black border-[#CCFF00]' : 'border-[#CCFF00] text-[#CCFF00] hover:bg-white hover:text-black hover:border-white'}`}
            >
              <div className="skew-x-[10deg]">01_ALL_NOTES</div>
            </div>
            <div 
              onClick={() => { setActiveNoteId(null); setCurrentView('task_board'); }}
              className={`p-3 font-black text-2xl skew-x-[-10deg] cursor-pointer transition-all border-4 ${currentView === 'task_board' ? 'bg-[#FF0099] text-white border-[#FF0099]' : 'border-[#CCFF00] text-[#CCFF00] hover:bg-[#FF0099] hover:text-white hover:border-[#FF0099]'}`}
            >
              <div className="skew-x-[10deg]">02_TASK_BOARD</div>
            </div>
            
            {vaultUnlocked ? (
              <div 
                onClick={() => { setActiveNoteId(null); setCurrentView('locked'); }}
                className={`p-3 font-black text-2xl skew-x-[-10deg] cursor-pointer transition-all border-4 border-[#FF0099] flex justify-between items-center ${currentView === 'locked' ? 'bg-[#FF0099] text-white' : 'text-[#FF0099] hover:bg-[#FF0099] hover:text-white'}`}
              >
                <div className="skew-x-[10deg] flex justify-between w-full items-center">
                  <span>03_LOCKED</span>
                  <span className="text-xs">[SECURE]</span>
                </div>
              </div>
            ) : (
              <div 
                onClick={() => { setPasswordPrompt({ isOpen: true, action: 'unlock_vault' }); setPasswordInput(''); setPasswordError(''); }}
                className="mt-4 text-xs font-mono opacity-40 hover:opacity-100 cursor-pointer transition-opacity border border-transparent hover:border-[#FF0099] p-2 w-fit text-[#FF0099] uppercase font-bold"
              >
                &gt; ./unlock_enclave.sh
              </div>
            )}
          </nav>

          {currentView !== 'editor' && (
            <div className="mt-8">
               <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#CCFF00]/50" />
                <input 
                  type="text" 
                  placeholder="SEARCH FILES..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-transparent border-4 border-[#CCFF00] focus:outline-none focus:border-[#FF0099] text-sm uppercase font-bold skew-x-[-5deg]"
                />
              </div>
              <div className="flex gap-2 flex-col xl:flex-row">
                <button onClick={() => handleCreateNote('note')} className="flex-1 py-2 bg-[#CCFF00] text-black font-black text-sm border-4 border-[#CCFF00] skew-x-[-5deg] hover:bg-white transition-colors">
                  <div className="skew-x-[5deg]">+ NEW NOTE</div>
                </button>
                <button onClick={() => handleCreateNote('tasks')} className="flex-1 py-2 bg-transparent text-[#CCFF00] hover:text-white font-black text-sm border-4 border-[#CCFF00] skew-x-[-5deg] hover:bg-[#FF0099] hover:border-[#FF0099] transition-colors">
                  <div className="skew-x-[5deg]">+ NEW TASK</div>
                </button>
              </div>
            </div>
          )}

          <div className="mt-auto p-4 border-4 border-dashed border-[#CCFF00]/50">
            <p className="font-mono text-[10px] leading-tight opacity-60 font-bold uppercase">
              CRYPTO_HASH: <br/> 
              {vaultUnlocked ? 'VERIFIED_A12B-990C' : 'UNVERIFIED_GUEST'} <br/><br/> 
              STATUS: {vaultUnlocked ? 'NO LEAKS DETECTED' : 'ENCLAVE_LOCKED'} <br/> 
              SIGNAL: STRENGTH 100%
            </p>
          </div>
        </aside>

        {/* CENTER SECTION */}
        <section className="col-span-6 flex flex-col gap-6 overflow-hidden">
          
          {currentView === 'all_notes' && (
            <>
              <h2 className="text-5xl font-black uppercase italic leading-none border-l-8 border-[#CCFF00] pl-4">
                INDEX: <br/> <span className="bg-[#CCFF00] text-black px-2 not-italic">ALL_FILES</span>
              </h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-8">
                {unlockedNotes.map(renderNoteCard)}
                {unlockedNotes.length === 0 && (
                  <div className="col-span-full text-center p-12 border-4 border-[#CCFF00] bg-black/40 skew-x-[-5deg]">
                    <div className="skew-x-[5deg] font-mono font-bold">&gt; NO PUBLIC FILES DETECTED.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'task_board' && (
            <>
              <h2 className="text-5xl font-black uppercase italic leading-none border-l-8 border-[#FF0099] pl-4">
                MODULE: <br/> <span className="bg-[#FF0099] text-white px-2 not-italic">TASK_BOARD</span>
              </h2>
              <div className="flex-1 overflow-y-auto pr-2 pb-8 flex flex-col gap-8">
                <div>
                  <h3 className="font-mono text-xl font-bold uppercase mb-4 text-[#CCFF00] flex items-center gap-2 border-b-2 border-[#CCFF00]/30 pb-2">
                    <FileText className="w-5 h-5"/> Task Lists
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {globalTasksNotes.map(renderNoteCard)}
                    {globalTasksNotes.length === 0 && <p className="font-mono opacity-50 text-sm">&gt; NO TASK LISTS FOUND.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="font-mono text-xl font-bold uppercase mb-4 text-[#FF0099] flex items-center gap-2 border-b-2 border-[#FF0099]/30 pb-2">
                    <CheckSquare className="w-5 h-5"/> Global Overview
                  </h3>
                  <div className="flex flex-col gap-2">
                    {globalTasksNotes.flatMap(note => {
                      try {
                        const tasks: TaskItem[] = JSON.parse(note.payload);
                        return tasks.map(t => (
                          <div key={t.id} className="flex items-center gap-4 bg-black/40 border-l-4 border-[#CCFF00] p-3 font-mono">
                            <button 
                              onClick={() => toggleGlobalTask(note.id, t.id)}
                              className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 skew-x-[-5deg] ${t.completed ? 'border-[#FF0099] text-[#FF0099]' : 'border-[#CCFF00] text-[#CCFF00]'}`}
                            >
                              <div className="skew-x-[5deg] font-black">{t.completed ? 'X' : ''}</div>
                            </button>
                            <span className={`flex-1 font-bold uppercase text-sm ${t.completed ? 'line-through opacity-50' : 'text-white'}`}>
                              {t.text}
                            </span>
                            <span className="text-[10px] opacity-40 uppercase tracking-widest">{note.title}</span>
                          </div>
                        ));
                      } catch(e) { return []; }
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {currentView === 'locked' && (
            <>
              <h2 className="text-5xl font-black uppercase italic leading-none border-l-8 border-[#FF0099] pl-4">
                ENCLAVE: <br/> <span className="bg-[#FF0099] text-white px-2 not-italic">SECURE_VAULT</span>
              </h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-8">
                {lockedNotes.map(renderNoteCard)}
                {lockedNotes.length === 0 && (
                  <div className="col-span-full text-center p-12 border-4 border-[#FF0099] bg-black/40 skew-x-[-5deg]">
                    <div className="skew-x-[5deg] font-mono font-bold text-[#FF0099]">&gt; VAULT IS EMPTY.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'editor' && (
            <>
              <div className="relative">
                <h2 className="text-5xl lg:text-6xl font-black uppercase italic leading-none border-l-8 border-[#FF0099] pl-4 flex flex-col">
                  FILE: 
                  <input 
                    type="text"
                    value={activeTitle}
                    onChange={(e) => setActiveTitle(e.target.value)}
                    onBlur={() => saveActiveNote()}
                    className="bg-[#FF0099] text-white px-2 not-italic focus:outline-none w-full max-w-lg mt-1 placeholder:text-white/50"
                    placeholder="UNTITLED"
                  />
                </h2>
              </div>
              <div className="flex-1 overflow-hidden border-4 border-[#CCFF00] bg-black/40 p-6 font-mono text-lg leading-relaxed relative flex flex-col">
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <div className="w-2 h-2 bg-[#FF0099]"></div>
                  <div className="w-2 h-2 bg-[#CCFF00]"></div>
                </div>
                
                {activeType === 'note' ? (
                  <textarea 
                    value={activeContent}
                    onChange={(e) => setActiveContent(e.target.value)}
                    onBlur={() => saveActiveNote()}
                    placeholder="> Initializing protocol... Start typing."
                    className="w-full h-full resize-none bg-transparent focus:outline-none placeholder:text-[#CCFF00]/30 font-medium text-[#CCFF00]"
                  />
                ) : (
                  <div className="flex flex-col h-full overflow-hidden">
                    <ul className="flex-1 overflow-y-auto space-y-4 list-none pr-4">
                      {activeTasks.map(task => (
                        <li key={task.id} className="flex items-center gap-4 group">
                          <button 
                            onClick={() => handleTaskToggle(task.id)}
                            className={`w-8 h-8 border-4 flex items-center justify-center shrink-0 skew-x-[-5deg] ${task.completed ? 'border-[#FF0099] text-[#FF0099]' : 'border-[#CCFF00] text-[#CCFF00] hover:bg-[#CCFF00]/20'}`}
                          >
                            <div className="skew-x-[5deg] font-black text-xl">{task.completed ? 'X' : ''}</div>
                          </button>
                          <span className={`flex-1 font-bold text-xl uppercase ${task.completed ? 'line-through opacity-50' : 'text-white'}`}>
                            {task.text}
                          </span>
                          <button 
                            onClick={() => handleTaskDelete(task.id)}
                            className="p-2 opacity-0 group-hover:opacity-100 hover:text-[#FF0099] transition-opacity"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="pt-6 mt-4 border-t-2 border-[#CCFF00]/30 border-dashed">
                      <div className="relative">
                        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#CCFF00]/50 skew-x-[10deg]" />
                        <input 
                          type="text" 
                          placeholder="ADD NEW TASK..." 
                          onKeyDown={handleTaskAdd}
                          className="w-full pl-12 pr-4 py-4 bg-transparent border-4 border-[#CCFF00] focus:outline-none focus:border-[#FF0099] text-lg uppercase placeholder:text-[#CCFF00]/40 font-bold skew-x-[-5deg] text-[#CCFF00]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

        </section>

        {/* RIGHT NAV (METADATA & ACTIONS) */}
        <aside className="col-span-3 flex flex-col gap-4 overflow-y-auto pr-2 pb-8">
          <div className="bg-[#CCFF00] p-4 text-black">
            <h3 className="font-black text-xl mb-2 italic uppercase">Metadata</h3>
            <div className="font-mono text-xs space-y-1 font-bold uppercase">
              <p>ID: {activeNoteId ? activeNoteId.slice(0,8) : 'SYS_OVERVIEW'}</p>
              <p>MODE: {activeNoteId ? activeType : 'GLOBAL_DASHBOARD'}</p>
              <p>ENTROPY: MAXIMUM</p>
              <p>ENCRYPTION: {activeNoteId && activeIsLocked ? 'AES-256-GCM' : 'PLAINTEXT'}</p>
            </div>
          </div>

          {currentView === 'editor' && activeNoteId ? (
            <>
              <div 
                onClick={closeEditor}
                className="border-4 border-[#CCFF00] bg-transparent p-4 group cursor-pointer hover:bg-[#CCFF00] transition-colors text-[#CCFF00] hover:text-black flex items-center justify-center skew-x-[-5deg]"
              >
                <h3 className="font-black text-2xl uppercase italic skew-x-[5deg]">SAVE & CLOSE</h3>
              </div>
              
              <div 
                onClick={toggleLockState}
                className={`border-4 p-4 group cursor-pointer transition-colors flex items-center justify-center skew-x-[-5deg] ${activeIsLocked ? 'border-[#FF0099] bg-[#FF0099] text-white hover:bg-transparent hover:text-[#FF0099]' : 'border-[#FF0099] bg-transparent text-[#FF0099] hover:bg-[#FF0099] hover:text-white'}`}
              >
                <h3 className="font-black text-xl uppercase italic skew-x-[5deg] flex items-center gap-2">
                  {activeIsLocked ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}
                  {activeIsLocked ? 'DECRYPT FILE' : 'ENCRYPT FILE'}
                </h3>
              </div>

              <div 
                onClick={() => deleteNote(activeNoteId)}
                className="mt-auto border-4 border-[#FF0099] bg-transparent p-4 text-[#FF0099] hover:bg-[#FF0099] hover:text-white font-black text-lg text-center cursor-pointer uppercase italic transition-colors skew-x-[-5deg]"
              >
                <div className="skew-x-[5deg]">DELETE FILE</div>
              </div>
            </>
          ) : (
            <>
              {vaultUnlocked ? (
                <div 
                  onClick={lockVault}
                  className="flex-1 border-4 border-black bg-[#FF0099] p-4 relative group cursor-pointer hover:translate-x-[-4px] hover:translate-y-[-4px] transition-transform text-black flex flex-col items-center justify-center shadow-[6px_6px_0px_0px_rgba(204,255,0,1)]"
                >
                  <h3 className="font-black text-4xl uppercase italic text-center leading-tight">LOCK<br/>THE<br/>VAULT</h3>
                </div>
              ) : (
                <div className="flex-1 border-4 border-[#FF0099] bg-transparent p-4 flex flex-col items-center justify-center opacity-30">
                  <Lock className="w-12 h-12 text-[#FF0099] mb-4" />
                  <p className="font-mono text-xs font-bold text-center text-[#FF0099] uppercase">VAULT IS SECURED</p>
                </div>
              )}
              
              <div className="h-24 bg-white border-4 border-black flex items-center justify-center p-4 mt-auto">
                <p className="text-black font-black uppercase text-center leading-none text-sm">
                  Privacy is not a crime. <br/> It is a necessity.
                </p>
              </div>
            </>
          )}
        </aside>
      </main>

      {/* FOOTER */}
      <footer className="h-12 border-t-4 border-[#CCFF00] mt-4 shrink-0 flex items-center justify-between font-mono text-[10px] uppercase font-bold tracking-widest">
        <span>© VOID_LABS // NO RIGHTS RESERVED</span>
        <div className="flex gap-8">
          <span className="text-[#FF0099]">SYSTEM: STABLE</span>
          <span>UPTIME: 142:09:44</span>
          <span className="bg-[#CCFF00] text-black px-2">LIVE_FEED_ON</span>
        </div>
      </footer>

      {/* PASSWORD MODAL */}
      {passwordPrompt.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#1A0033]/90 backdrop-blur-md">
          <div className="bg-black/80 border-4 border-[#FF0099] w-full max-w-md flex flex-col p-8 skew-x-[-5deg] shadow-[10px_10px_0px_0px_rgba(255,0,153,1)]">
            <div className="skew-x-[5deg]">
              <div className="flex items-center gap-4 mb-6">
                <KeyRound className="w-10 h-10 text-[#FF0099]" />
                <h2 className="font-black text-4xl uppercase italic text-[#FF0099]">
                  {passwordPrompt.action === 'lock_note' ? 'ENCRYPT' : 'DECRYPT'}
                </h2>
              </div>
              
              <p className="font-mono text-sm font-bold mb-8 uppercase text-[#CCFF00]/80">
                {passwordPrompt.action === 'lock_note' 
                  ? '> Set master password to encrypt this file.' 
                  : '> Enter master password to access secure enclave.'}
              </p>
              
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="ENTER_KEY..."
                className="w-full px-6 py-4 bg-transparent border-4 border-[#CCFF00] focus:outline-none focus:border-[#FF0099] text-xl font-bold mb-6 text-[#CCFF00] placeholder:text-[#CCFF00]/30"
                autoFocus
              />
              
              {passwordError && (
                <div className="text-white text-xs font-bold uppercase mb-6 bg-[#FF0099] p-3 border-2 border-white animate-pulse">
                  ERROR: {passwordError}
                </div>
              )}
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setPasswordPrompt({ isOpen: false, action: 'unlock_vault' })}
                  className="flex-1 py-4 bg-transparent text-[#CCFF00] border-4 border-[#CCFF00] font-black uppercase hover:bg-white hover:text-black transition-colors skew-x-[-10deg]"
                >
                  <div className="skew-x-[10deg]">ABORT</div>
                </button>
                <button 
                  onClick={handlePasswordSubmit}
                  className="flex-1 py-4 bg-[#FF0099] text-white border-4 border-[#FF0099] font-black uppercase hover:bg-white hover:text-[#FF0099] hover:border-white transition-colors skew-x-[-10deg]"
                >
                  <div className="skew-x-[10deg]">EXECUTE</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
