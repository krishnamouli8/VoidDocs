'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Lock, Unlock, Plus, FileText, CheckSquare, Trash2, KeyRound, Search, X, Archive, Upload, Calendar, Bookmark, BookmarkCheck, MoreVertical } from 'lucide-react';
import { encryptData, decryptData } from '@/lib/crypto';

type NoteType = 'note' | 'tasks';
type ViewState = 'all_notes' | 'task_board' | 'editor' | 'trash' | 'archive' | 'settings' | 'secure_notes' | 'profile';
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

interface SubTask {
  id: string;
  text: string;
  completed: boolean;
}

interface TaskItem {
  id: string;
  text: string;
  completed: boolean;
  dueDate?: string;
  priority: TaskPriority;
  tags: string[];
  subtasks: SubTask[];
  recurring?: 'daily' | 'weekly' | 'monthly';
  createdAt: number;
  completedAt?: number;
}

interface StoredNote {
  id: string;
  title: string;
  isLocked: boolean;
  type: NoteType;
  payload: string;
  updatedAt: number;
  createdAt: number;
  tags: string[];
  folder?: string;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt?: number;
}

const PRIORITY_COLORS: Record<TaskPriority, { border: string; text: string; bg: string }> = {
  low: { border: '#E8823A', text: '#E8823A', bg: 'rgba(145,202,207,0.1)' },
  medium: { border: '#F5C842', text: '#F5C842', bg: 'rgba(203,132,37,0.1)' },
  high: { border: '#3D3833', text: '#3D3833', bg: 'rgba(224,186,252,0.1)' },
  critical: { border: '#EF4444', text: '#EF4444', bg: 'rgba(239,68,68,0.1)' },
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  critical: 'CRIT',
};

export default function CipherNotesApp() {
  const [notes, setNotes] = useState<StoredNote[]>([]);
  
  useEffect(() => {
    const stored = localStorage.getItem('cipher_notes_data');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setNotes(parsed.map((n: Record<string, unknown>) => ({
          ...n,
          createdAt: (n.createdAt as number) || (n.updatedAt as number) || Date.now(),
          tags: (n.tags as string[]) || [],
          isPinned: (n.isPinned as boolean) || false,
          isArchived: (n.isArchived as boolean) || false,
          isDeleted: (n.isDeleted as boolean) || false,
        })));
      } catch (e) { console.error(e); }
    } else {
      setNotes([{
        id: crypto.randomUUID(),
        title: 'WELCOME TO VOID',
        isLocked: false,
        type: 'note' as NoteType,
        payload: 'Welcome to Void Docs.\n\nEncrypted notes. Local storage. Zero network.\n\n- Click + NEW NOTE to create a document\n- Click + NEW TASK to create a task board\n- Use SETTINGS to set a secret key\n\nPrivacy is not a crime. It is a necessity.',
        updatedAt: Date.now(),
        createdAt: Date.now(),
        tags: ['welcome', 'guide'],
        isPinned: true,
        isArchived: false,
        isDeleted: false,
      }]);
    }
  }, []);
  const [currentView, setCurrentView] = useState<ViewState>('all_notes');
  
  // Active Note State
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeTitle, setActiveTitle] = useState('');
  const [activeContent, setActiveContent] = useState('');
  const [activeTasks, setActiveTasks] = useState<TaskItem[]>([]);
  const [activeIsLocked, setActiveIsLocked] = useState(false);
  const [activeType, setActiveType] = useState<NoteType>('note');
  
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const [splashPhase, setSplashPhase] = useState(0);
  
  // Security State
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [secretKey, setSecretKey] = useState('');
  const [editingSecretKey, setEditingSecretKey] = useState(false);
  const [showSecureNav, setShowSecureNav] = useState(false);
  const [activeCardMenu, setActiveCardMenu] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [passwordPrompt, setPasswordPrompt] = useState<{ isOpen: boolean; action: 'unlock_vault' | 'lock_note' | 'unlock_note'; targetId?: string }>({ isOpen: false, action: 'unlock_vault' });
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const saveToStorage = (updated: StoredNote[]) => {
    setNotes(updated);
    localStorage.setItem('cipher_notes_data', JSON.stringify(updated));
  };

  const handleCreateNote = (type: NoteType) => {
    /* eslint-disable-next-line react-hooks/purity */
    const ts = Date.now();
    const newNote: StoredNote = {
      id: crypto.randomUUID(),
      title: 'UNTITLED ' + (type === 'tasks' ? 'TASKS' : 'DOC'),
      isLocked: false,
      type: type,
      payload: type === 'tasks' ? '[]' : '',
      updatedAt: ts,
      createdAt: ts,
      tags: [],
      isPinned: false,
      isArchived: false,
      isDeleted: false,
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

  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'pending'>('saved');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const saveActiveNote = useCallback(async (forceLock?: boolean, pwd?: string) => {
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
    setSaveStatus('saved');
  }, [activeNoteId, activeIsLocked, activeType, activeTasks, activeContent, sessionPassword, notes, activeTitle]);

  const triggerAutoSave = useCallback(() => {
    if (!activeNoteId) return;
    setSaveStatus('pending');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveActiveNote();
    }, 1500);
  }, [activeNoteId, saveActiveNote]);

  useEffect(() => {
    setMounted(true);
    setShowSplash(true);
    setSecretKey(localStorage.getItem('cipher_secret_key') || '');
    const t1 = setTimeout(() => setSplashPhase(1), 400);
    const t2 = setTimeout(() => setSplashPhase(2), 1200);
    const t3 = setTimeout(() => setSplashPhase(3), 2200);
    const t4 = setTimeout(() => setShowSplash(false), 3000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  const closeEditor = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveActiveNote();
    setActiveNoteId(null);
    setCurrentView(activeIsLocked ? 'secure_notes' : (activeType === 'tasks' ? 'task_board' : 'all_notes'));
  };

  const softDeleteNote = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, isDeleted: true, deletedAt: Date.now(), updatedAt: Date.now() } : n);
    saveToStorage(updated);
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setCurrentView('all_notes');
    }
  };

  const restoreNote = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, isDeleted: false, deletedAt: undefined, updatedAt: Date.now() } : n);
    saveToStorage(updated);
  };

  const permanentDeleteNote = (id: string) => {
    saveToStorage(notes.filter(n => n.id !== id));
    if (activeNoteId === id) {
      setActiveNoteId(null);
      setCurrentView('all_notes');
    }
  };

  const togglePin = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, isPinned: !n.isPinned, updatedAt: Date.now() } : n);
    saveToStorage(updated);
  };

  const toggleArchive = (id: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, isArchived: !n.isArchived, updatedAt: Date.now() } : n);
    saveToStorage(updated);
  };

  const addTagToNote = (id: string, tag: string) => {
    const note = notes.find(n => n.id === id);
    if (!note || note.tags.includes(tag)) return;
    const updated = notes.map(n => n.id === id ? { ...n, tags: [...n.tags, tag], updatedAt: Date.now() } : n);
    saveToStorage(updated);
  };

  const removeTagFromNote = (id: string, tag: string) => {
    const updated = notes.map(n => n.id === id ? { ...n, tags: n.tags.filter(t => t !== tag), updatedAt: Date.now() } : n);
    saveToStorage(updated);
  };

  // Password / Vault Logic
  const handlePasswordSubmit = async () => {
    if (!passwordInput) { setPasswordError('EMPTY PAYLOAD'); return; }

    if (passwordPrompt.action === 'unlock_vault') {
      setSessionPassword(passwordInput);
      setSecretKey(passwordInput);
      localStorage.setItem('cipher_secret_key', passwordInput);
      setVaultUnlocked(true);
      setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
    }
    else if (passwordPrompt.action === 'unlock_note') {
      const note = notes.find(n => n.id === passwordPrompt.targetId);
      if (!note) return;
      try {
        const decrypted = await decryptData(note.payload, passwordInput);
        setSessionPassword(passwordInput);
        setSecretKey(passwordInput);
        localStorage.setItem('cipher_secret_key', passwordInput);
        setVaultUnlocked(true);
        openEditor(note, decrypted);
        setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
      } catch (e) {
        setPasswordError('DECRYPTION FAILED - INVALID KEY');
      }
    }
    else if (passwordPrompt.action === 'lock_note') {
      setSessionPassword(passwordInput);
      setSecretKey(passwordInput);
      localStorage.setItem('cipher_secret_key', passwordInput);
      setVaultUnlocked(true);
      await saveActiveNote(true, passwordInput);
      setPasswordPrompt({ isOpen: false, action: 'unlock_vault' });
    }
  };

  const lockVault = () => {
    setSessionPassword(null);
    setVaultUnlocked(false);
    setShowSecureNav(false);
    if (currentView === 'secure_notes' || currentView === 'profile' || (currentView === 'editor' && activeIsLocked)) {
      setActiveNoteId(null);
      setCurrentView('all_notes');
    }
  };

  const handleNoteSelect = (note: StoredNote) => {
    if (note.isLocked) {
      if (sessionPassword) {
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
    setActiveTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const newCompleted = !t.completed;
      return { 
        ...t, 
        completed: newCompleted, 
        completedAt: newCompleted ? Date.now() : undefined 
      };
    }));
    triggerAutoSave();
  };

  const handleSubTaskToggle = (taskId: string, subTaskId: string) => {
    setActiveTasks(prev => prev.map(t => 
      t.id === taskId ? { 
        ...t, 
        subtasks: t.subtasks.map(st => st.id === subTaskId ? { ...st, completed: !st.completed } : st)
      } : t
    ));
    triggerAutoSave();
  };

  const handleTaskAdd = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
      const newTask: TaskItem = {
        id: crypto.randomUUID(),
        text: e.currentTarget.value.trim(),
        completed: false,
        priority: 'medium',
        tags: [],
        subtasks: [],
        createdAt: Date.now(),
      };
      setActiveTasks([...activeTasks, newTask]);
      e.currentTarget.value = '';
      triggerAutoSave();
    }
  };

  const handleTaskDelete = (taskId: string) => {
    setActiveTasks(prev => prev.filter(t => t.id !== taskId));
    triggerAutoSave();
  };

  const updateTaskPriority = (taskId: string, priority: TaskPriority) => {
    setActiveTasks(prev => prev.map(t => t.id === taskId ? { ...t, priority } : t));
    triggerAutoSave();
  };

  const updateTaskDueDate = (taskId: string, dueDate: string) => {
    setActiveTasks(prev => prev.map(t => t.id === taskId ? { ...t, dueDate } : t));
    triggerAutoSave();
  };

  const addTaskTag = (taskId: string, tag: string) => {
    setActiveTasks(prev => prev.map(t => {
      if (t.id !== taskId || t.tags.includes(tag)) return t;
      return { ...t, tags: [...t.tags, tag] };
    }));
    triggerAutoSave();
  };

  const removeTaskTag = (taskId: string, tag: string) => {
    setActiveTasks(prev => prev.map(t => t.id === taskId ? { ...t, tags: t.tags.filter(tg => tg !== tag) } : t));
    triggerAutoSave();
  };

  const addSubTask = (taskId: string, text: string) => {
    if (!text.trim()) return;
    setActiveTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, subtasks: [...t.subtasks, { id: crypto.randomUUID(), text: text.trim(), completed: false }] } : t
    ));
    triggerAutoSave();
  };

  const deleteSubTask = (taskId: string, subTaskId: string) => {
    setActiveTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, subtasks: t.subtasks.filter(st => st.id !== subTaskId) } : t
    ));
    triggerAutoSave();
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
      const updatedList = tList.map(t => t.id === taskId ? {...t, completed: !t.completed, completedAt: !t.completed ? Date.now() : undefined} : t);
      const updatedNotes = notes.map(n => n.id === noteId ? {...n, payload: JSON.stringify(updatedList), updatedAt: Date.now()} : n);
      saveToStorage(updatedNotes);
    } catch(e) {}
  };

  // Filtering
  const getFilteredNotes = () => {
    let result = notes;

    if (currentView === 'trash') {
      result = result.filter(n => n.isDeleted);
    } else if (currentView === 'archive') {
      result = result.filter(n => n.isArchived && !n.isDeleted);
    } else if (currentView === 'secure_notes') {
      result = result.filter(n => n.isLocked && !n.isDeleted && !n.isArchived);
    } else if (currentView === 'task_board') {
      result = result.filter(n => n.type === 'tasks' && !n.isLocked && !n.isDeleted && !n.isArchived);
    } else if (currentView === 'settings') {
      return [];
    } else {
      result = result.filter(n => !n.isLocked && !n.isDeleted && !n.isArchived);
    }

    if (searchQuery && currentView !== 'secure_notes') {
      const query = searchQuery.toLowerCase();
      result = result.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.payload.toLowerCase().includes(query) ||
        n.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.updatedAt - a.updatedAt;
    });

    return result;
  };

  // Detect secret key in search to show secure nav
  const isSecretKeyMatch = secretKey.length > 0 && searchQuery.trim() === secretKey;

  useEffect(() => {
    if (isSecretKeyMatch) {
      setSessionPassword(secretKey);
      setShowSecureNav(true);
      setCurrentView('secure_notes');
      setSearchQuery('');
    }
  }, [isSecretKeyMatch]);

  useEffect(() => {
    if (showSecureNav && currentView !== 'secure_notes') {
      setShowSecureNav(false);
    }
  }, [currentView, showSecureNav]);

  const filteredNotes = getFilteredNotes();
  const unlockedNotes = filteredNotes.filter(n => !n.isLocked);
  const globalTasksNotes = notes.filter(n => !n.isLocked && n.type === 'tasks' && !n.isDeleted && !n.isArchived);

  // Render Helpers
  const renderNoteCard = (note: StoredNote) => (
    <div 
      key={note.id} 
      onClick={() => { setActiveCardMenu(null); handleNoteSelect(note); }}
      className={`border-4 bg-[#F2EFEB] p-4 font-mono cursor-pointer hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors group flex flex-col justify-between min-h-[120px] relative ${
        note.isPinned ? 'border-[#E8823A] ring-2 ring-[#E8823A]/50' : 'border-[#F5C842]'
      }`}
    >
      {note.isPinned && (
        <div className="absolute -top-2 -right-2">
          <BookmarkCheck className="w-5 h-5 text-[#E8823A] bg-[#F2EFEB] p-1" />
        </div>
      )}
      <div>
        <div className="flex justify-between items-start mb-2">
          <span className="text-xs font-bold opacity-60 group-hover:opacity-100">
            {new Date(note.updatedAt).toLocaleDateString()}
          </span>
          <div className="flex items-center gap-1">
            {note.isLocked && <Lock className="w-4 h-4 text-[#E8823A]" />}
            {!note.isLocked && note.type === 'tasks' && <CheckSquare className="w-4 h-4" />}
            {!note.isLocked && note.type === 'note' && <FileText className="w-4 h-4" />}
          </div>
        </div>
        <h3 className="font-black text-sm uppercase break-words leading-tight mt-2 line-clamp-3">{note.title}</h3>
        {note.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {note.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[10px] bg-[#F5C842]/20 border border-[#F5C842]/50 px-1.5 py-0.5 font-bold uppercase">
                #{tag}
              </span>
            ))}
            {note.tags.length > 3 && (
              <span className="text-[10px] opacity-50 font-bold uppercase">+{note.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs opacity-50 font-bold truncate">
          ID: {note.id.slice(0,8)}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              if (note.isLocked) {
                const updated = notes.map(n => n.id === note.id ? { ...n, isLocked: false, updatedAt: Date.now() } : n);
                saveToStorage(updated);
              } else {
                const updated = notes.map(n => n.id === note.id ? { ...n, isLocked: true, updatedAt: Date.now() } : n);
                saveToStorage(updated);
              }
            }}
            className={`px-2 py-1 text-[10px] font-black uppercase border-2 transition-colors ${
              note.isLocked
                ? 'border-[#E8823A] text-[#E8823A] hover:bg-[#E8823A] hover:text-white'
                : 'border-[#F5C842] text-[#3D3833] hover:bg-[#F5C842]'
            }`}
          >
            {note.isLocked ? 'UNLOCK' : 'LOCK'}
          </button>
          <div className="relative">
            <button
              onClick={() => setActiveCardMenu(activeCardMenu === note.id ? null : note.id)}
              className="p-1 hover:bg-[#3D3833]/10 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {activeCardMenu === note.id && (
              <div className="absolute right-0 bottom-full mb-1 z-50 bg-[#F2EFEB] border-4 border-[#F5C842] shadow-[4px_4px_0px_0px_rgba(61,56,51,0.3)] min-w-[140px]">
                <button
                  onClick={() => { setActiveCardMenu(null); togglePin(note.id); }}
                  className="w-full px-3 py-2 text-left text-xs font-bold uppercase hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors border-b-2 border-[#F5C842]/30 flex items-center gap-2"
                >
                  {note.isPinned ? <BookmarkCheck className="w-3 h-3" /> : <Bookmark className="w-3 h-3" />}
                  {note.isPinned ? 'UNPIN' : 'PIN'}
                </button>
                <button
                  onClick={() => { setActiveCardMenu(null); toggleArchive(note.id); }}
                  className="w-full px-3 py-2 text-left text-xs font-bold uppercase hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors border-b-2 border-[#F5C842]/30 flex items-center gap-2"
                >
                  <Archive className="w-3 h-3" /> {note.isArchived ? 'UNARCHIVE' : 'ARCHIVE'}
                </button>
                <button
                  onClick={() => { setActiveCardMenu(null); setDeleteConfirmId(note.id); }}
                  className="w-full px-3 py-2 text-left text-xs font-bold uppercase hover:bg-[#E8823A] hover:text-white transition-colors text-[#E8823A] flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> DELETE
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-[#E8E4DE] text-[#3D3833] font-sans px-6 py-3 flex flex-col overflow-hidden selection:bg-[#E8823A] selection:text-white">
      
      {/* SPLASH SCREEN */}
      {mounted && showSplash && (
        <div className={`fixed inset-0 z-[100] bg-[#E8E4DE] flex items-center justify-center transition-opacity duration-700 ${splashPhase >= 3 ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
            {/* Doodle lines */}
            <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <line x1="10%" y1="20%" x2="30%" y2="20%" stroke="#F5C842" strokeWidth="2" opacity={splashPhase >= 1 ? 0.3 : 0} className="transition-all duration-700" />
              <line x1="70%" y1="15%" x2="90%" y2="15%" stroke="#E8823A" strokeWidth="2" opacity={splashPhase >= 1 ? 0.2 : 0} className="transition-all duration-700" />
              <line x1="5%" y1="80%" x2="25%" y2="80%" stroke="#3D3833" strokeWidth="1" opacity={splashPhase >= 1 ? 0.2 : 0} className="transition-all duration-700" />
              <line x1="75%" y1="85%" x2="95%" y2="85%" stroke="#F5C842" strokeWidth="1" opacity={splashPhase >= 1 ? 0.15 : 0} className="transition-all duration-700" />
              <rect x="15%" y="30%" width="60" height="4" fill="#E8823A" opacity={splashPhase >= 1 ? 0.15 : 0} className="transition-all duration-700" />
              <rect x="70%" y="60%" width="80" height="3" fill="#F5C842" opacity={splashPhase >= 1 ? 0.1 : 0} className="transition-all duration-700" />
              <circle cx="8%" cy="45%" r="3" fill="#3D3833" opacity={splashPhase >= 1 ? 0.25 : 0} className="transition-all duration-700" />
              <circle cx="92%" cy="35%" r="4" fill="#F5C842" opacity={splashPhase >= 1 ? 0.2 : 0} className="transition-all duration-700" />
              <circle cx="50%" cy="90%" r="2" fill="#E8823A" opacity={splashPhase >= 1 ? 0.3 : 0} className="transition-all duration-700" />
              <rect x="35%" y="8%" width="4" height="30" fill="#3D3833" opacity={splashPhase >= 2 ? 0.1 : 0} className="transition-all duration-700" />
              <rect x="60%" y="70%" width="4" height="25" fill="#F5C842" opacity={splashPhase >= 2 ? 0.08 : 0} className="transition-all duration-700" />
              <line x1="20%" y1="55%" x2="40%" y2="55%" stroke="#3D3833" strokeWidth="1" strokeDasharray="4 4" opacity={splashPhase >= 2 ? 0.15 : 0} className="transition-all duration-700" />
              <line x1="60%" y1="45%" x2="80%" y2="45%" stroke="#E8823A" strokeWidth="1" strokeDasharray="4 4" opacity={splashPhase >= 2 ? 0.15 : 0} className="transition-all duration-700" />
            </svg>
            
            {/* Logo center */}
            <div className={`relative z-10 text-center transition-all duration-700 ${splashPhase >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <h1 className={`text-7xl lg:text-9xl font-black uppercase tracking-tighter transition-all duration-700 ${splashPhase >= 2 ? 'text-[#F5C842]' : 'text-[#3D3833]'}`}>
                VOID
              </h1>
              <div className={`transition-all duration-500 delay-200 ${splashPhase >= 1 ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-7xl lg:text-9xl font-black uppercase tracking-tighter text-[#E8823A]">DOCS</span>
              </div>
              <div className={`mt-6 transition-all duration-700 delay-300 ${splashPhase >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#3D3833]/50">
                  &gt; initializing encrypted enclave...
                </p>
              </div>
              <div className={`mt-3 transition-all duration-500 ${splashPhase >= 2 ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-[#F5C842] animate-pulse"></div>
                  <div className="w-2 h-2 bg-[#E8823A] animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-[#3D3833] animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* HEADER */}
      <header className="flex items-center gap-4 border-b-4 border-[#F5C842] pb-3 mb-4 shrink-0">
        <h1 className="text-3xl lg:text-4xl font-black uppercase tracking-tighter leading-none cursor-pointer shrink-0" onClick={() => { setActiveNoteId(null); setCurrentView('all_notes'); }}>
          VOID <span className="text-[#E8823A]">DOCS</span>
        </h1>
        <div className="flex-1" />
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[10px] font-mono uppercase font-bold opacity-50 hidden md:inline">ENCRYPTED</span>
          <div
            onClick={() => { setActiveNoteId(null); setCurrentView('profile'); }}
            className="w-10 h-10 bg-[#E8823A] border-2 border-[#3D3833] flex items-center justify-center shadow-[4px_4px_0px_0px_rgba(245,200,66,1)] cursor-pointer hover:border-[#F5C842] transition-colors"
          >
            <div className="text-[#3D3833] font-black text-xl">?</div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 grid grid-cols-12 gap-6 overflow-hidden min-h-0">
        
        {/* LEFT SIDEBAR */}
        <aside className="col-span-2 flex flex-col gap-4 border-r-4 border-[#F5C842]/30 pr-4 overflow-y-auto">
          <nav className="flex flex-col gap-2">
            <div
              onClick={() => { if (activeNoteId) saveActiveNote(); setActiveNoteId(null); setCurrentView('all_notes'); }}
              className={`p-3 font-black text-lg cursor-pointer transition-all border-4 ${currentView === 'all_notes' || currentView === 'editor' ? 'bg-[#F5C842] text-[#3D3833] border-[#F5C842]' : 'border-[#F5C842] text-[#3D3833] hover:bg-[#3D3833] hover:text-[#F5C842] hover:border-[#3D3833]'}`}
            >
              NOTES
            </div>
            <div
              onClick={() => { if (activeNoteId) saveActiveNote(); setActiveNoteId(null); setCurrentView('task_board'); }}
              className={`p-3 font-black text-lg cursor-pointer transition-all border-4 ${currentView === 'task_board' ? 'bg-[#E8823A] text-white border-[#E8823A]' : 'border-[#F5C842] text-[#3D3833] hover:bg-[#E8823A] hover:text-white hover:border-[#E8823A]'}`}
            >
              TASKS
            </div>
            {showSecureNav && (
              <div
                onClick={() => { if (activeNoteId) saveActiveNote(); setActiveNoteId(null); setCurrentView('secure_notes'); setSearchQuery(''); }}
                className={`p-3 font-black text-lg cursor-pointer transition-all border-4 border-[#E8823A] ${currentView === 'secure_notes' ? 'bg-[#E8823A] text-white' : 'text-[#E8823A] hover:bg-[#E8823A] hover:text-white'}`}
              >
                LOCKED
              </div>
            )}
          </nav>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3D3833]/50" />
            <input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border-4 border-[#F5C842] focus:outline-none focus:border-[#E8823A] text-xs uppercase font-bold text-[#3D3833]"
            />
          </div>
        </aside>

        {/* CENTER SECTION */}
        <section className="col-span-8 flex flex-col gap-6 overflow-hidden">
          
          {currentView === 'all_notes' && (
            <>
              <div className="flex items-center justify-between border-l-8 border-[#F5C842] pl-4">
                <h2 className="text-3xl font-black uppercase leading-none">NOTES</h2>
                <div className="flex items-center gap-2">
                  {vaultUnlocked && (
                    <button onClick={lockVault} className="px-4 py-2 bg-[#E8823A] text-white font-black text-sm border-4 border-[#E8823A] hover:bg-transparent hover:text-[#E8823A] transition-colors uppercase">
                      LOCK
                    </button>
                  )}
                  <button onClick={() => handleCreateNote('note')} className="px-4 py-2 bg-[#F5C842] text-[#3D3833] font-black text-sm border-4 border-[#F5C842] hover:bg-[#3D3833] hover:text-[#F5C842] transition-colors uppercase">
                    + NEW
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-8">
                {unlockedNotes.map(renderNoteCard)}
                {unlockedNotes.length === 0 && (
                  <div className="col-span-full text-center p-12 border-4 border-[#F5C842] bg-[#F2EFEB]">
                    <div className="font-mono font-bold">&gt; NO PUBLIC FILES DETECTED.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'secure_notes' && (
            <>
              <h2 className="text-3xl font-black uppercase leading-none border-l-8 border-[#E8823A] pl-4">
                SECURE NOTES
              </h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-8">
                {filteredNotes.map(renderNoteCard)}
                {filteredNotes.length === 0 && (
                  <div className="col-span-full text-center p-12 border-4 border-[#E8823A] bg-[#F2EFEB]">
                    <div className="font-mono font-bold text-[#E8823A]">&gt; NO SECURE FILES.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'task_board' && (
            <>
              <div className="flex items-center justify-between border-l-8 border-[#E8823A] pl-4">
                <h2 className="text-3xl font-black uppercase leading-none">TASKS</h2>
                <button onClick={() => handleCreateNote('tasks')} className="px-4 py-2 bg-[#E8823A] text-white font-black text-sm border-4 border-[#E8823A] hover:bg-transparent hover:text-[#E8823A] transition-colors uppercase">
                  + NEW
                </button>
              </div>
              <div className="flex-1 overflow-y-auto pr-2 pb-8 flex flex-col gap-8">
                <div>
                  <h3 className="font-mono text-xl font-bold uppercase mb-4 text-[#3D3833] flex items-center gap-2 border-b-2 border-[#F5C842]/30 pb-2">
                    <FileText className="w-5 h-5"/> Task Lists
                  </h3>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {globalTasksNotes.map(renderNoteCard)}
                    {globalTasksNotes.length === 0 && <p className="font-mono opacity-50 text-sm">&gt; NO TASK LISTS FOUND.</p>}
                  </div>
                </div>

                <div>
                  <h3 className="font-mono text-xl font-bold uppercase mb-4 text-[#E8823A] flex items-center gap-2 border-b-2 border-[#E8823A]/30 pb-2">
                    <CheckSquare className="w-5 h-5"/> Global Overview
                  </h3>
                  <div className="flex flex-col gap-2">
                    {globalTasksNotes.flatMap(note => {
                      try {
                        const tasks: TaskItem[] = JSON.parse(note.payload);
                        return tasks.filter(t => !t.completed).map(t => (
                          <div key={t.id} className="flex items-center gap-4 bg-[#F2EFEB] border-l-4 p-3 font-mono" style={{ borderLeftColor: PRIORITY_COLORS[t.priority].border }}>
                            <button
                              onClick={() => toggleGlobalTask(note.id, t.id)}
                              className={`w-6 h-6 border-2 flex items-center justify-center shrink-0 ${t.completed ? 'border-[#E8823A] text-[#E8823A]' : 'border-[#F5C842] text-[#3D3833]'}`}
                            >
                              <div className="font-black">{t.completed ? 'X' : ''}</div>
                            </button>
                            <span className={`flex-1 font-bold uppercase text-sm ${t.completed ? 'line-through opacity-50' : 'text-[#3D3833]'}`}>
                              {t.text}
                            </span>
                            {t.dueDate && (
                              <span className="text-[10px] font-mono text-[#3D3833]/60 flex items-center gap-1">
                                <Calendar className="w-3 h-3"/>{t.dueDate}
                              </span>
                            )}
                            <span className="text-[10px] font-black px-1.5 py-0.5 border" style={{ borderColor: PRIORITY_COLORS[t.priority].border, color: PRIORITY_COLORS[t.priority].text }}>
                              {PRIORITY_LABELS[t.priority]}
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

          {currentView === 'archive' && (
            <>
              <h2 className="text-3xl font-black uppercase leading-none border-l-8 border-[#F5C842] pl-4">
                ARCHIVE
              </h2>
              <div className="flex-1 overflow-y-auto grid grid-cols-2 lg:grid-cols-3 gap-4 pr-2 pb-8">
                {unlockedNotes.map(renderNoteCard)}
                {unlockedNotes.length === 0 && (
                  <div className="col-span-full text-center p-12 border-4 border-[#F5C842] bg-[#F2EFEB]">
                    <div className="font-mono font-bold">&gt; ARCHIVE IS EMPTY.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'trash' && (
            <>
              <div className="flex items-center justify-between border-l-8 border-[#E8823A] pl-4">
                <h2 className="text-3xl font-black uppercase leading-none">
                  TRASH
                </h2>
                {unlockedNotes.length > 0 && (
                  <button
                    onClick={() => { if (confirm('PERMANENTLY PURGE ALL FILES?')) { unlockedNotes.forEach(n => permanentDeleteNote(n.id)); } }}
                    className="px-4 py-2 border-4 border-[#E8823A] text-[#E8823A] font-black text-sm uppercase hover:bg-[#E8823A] hover:text-white transition-colors"
                  >
                    <div>PURGE ALL</div>
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2 pb-8">
                {unlockedNotes.map(note => (
                  <div key={note.id} className="flex items-center gap-4 bg-[#F2EFEB] border-l-4 border-[#E8823A] p-3 font-mono group">
                    <span className={`flex-1 font-bold uppercase text-sm ${note.isPinned ? 'text-[#E8823A]' : 'text-[#3D3833]'}`}>
                      {note.title}
                    </span>
                    <span className="text-[10px] opacity-40 uppercase">{new Date(note.deletedAt || note.updatedAt).toLocaleDateString()}</span>
                    <button onClick={() => restoreNote(note.id)} className="px-2 py-1 text-xs font-bold border-2 border-[#F5C842] text-[#3D3833] hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors uppercase">
                      RESTORE
                    </button>
                    <button onClick={() => permanentDeleteNote(note.id)} className="px-2 py-1 text-xs font-bold border-2 border-[#E8823A] text-[#E8823A] hover:bg-[#E8823A] hover:text-white transition-colors uppercase">
                      PURGE
                    </button>
                  </div>
                ))}
                {unlockedNotes.length === 0 && (
                  <div className="text-center p-12 border-4 border-[#E8823A] bg-[#F2EFEB]">
                    <div className="font-mono font-bold text-[#E8823A]">&gt; TRASH IS EMPTY.</div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'editor' && (
            <>
              <div className="relative">
                <h2 className="text-3xl font-black uppercase leading-none border-l-8 border-[#E8823A] pl-4 flex flex-col">
                  <input
                    type="text"
                    value={activeTitle}
                    onChange={(e) => { setActiveTitle(e.target.value); triggerAutoSave(); }}
                    className="bg-[#F5C842] text-[#3D3833] px-2 py-1 focus:outline-none w-full max-w-lg mt-1 placeholder:text-[#3D3833]/40 font-black text-xl uppercase"
                    placeholder="UNTITLED"
                    style={{ caretColor: '#3D3833' }}
                  />
                </h2>
              </div>
              <div className="flex-1 overflow-hidden border-4 border-[#F5C842] bg-[#F2EFEB] p-6 font-mono text-lg leading-relaxed relative flex flex-col">
                <div className="absolute top-2 right-2 flex gap-1 z-10">
                  <div className={`w-2 h-2 ${saveStatus === 'pending' ? 'bg-yellow-400 animate-pulse' : saveStatus === 'saving' ? 'bg-orange-400 animate-pulse' : 'bg-[#F5C842]'}`}></div>
                  <div className="w-2 h-2 bg-[#E8823A]"></div>
                </div>
                <div className="absolute top-1 right-8 z-10 font-mono text-[10px] uppercase font-bold opacity-60">
                  {saveStatus === 'saved' ? 'SAVED' : saveStatus === 'saving' ? 'SAVING...' : 'PENDING'}
                </div>

                {activeType === 'note' ? (
                  <textarea
                    value={activeContent}
                    onChange={(e) => { setActiveContent(e.target.value); triggerAutoSave(); }}
                    placeholder="> Initializing protocol..."
                    className="w-full flex-1 resize-none bg-transparent focus:outline-none placeholder:text-[#3D3833]/30 font-medium text-[#3D3833] font-mono text-base leading-relaxed"
                  />
                ) : (
                  <div className="flex flex-col h-full overflow-hidden">
                    <ul className="flex-1 overflow-y-auto space-y-2 list-none pr-4">
                      {activeTasks.map(task => (
                        <li key={task.id} className="border-2 border-[#F5C842]/20 p-3 group" style={{ borderLeftColor: PRIORITY_COLORS[task.priority].border, borderLeftWidth: 4 }}>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleTaskToggle(task.id)}
                              className={`w-7 h-7 border-4 flex items-center justify-center shrink-0 ${task.completed ? 'border-[#E8823A] text-[#E8823A]' : 'border-[#F5C842] text-[#3D3833] hover:bg-[#F5C842]/20'}`}
                            >
                              <div className="font-black text-lg">{task.completed ? 'X' : ''}</div>
                            </button>
                            <span className={`flex-1 font-bold uppercase text-sm ${task.completed ? 'line-through opacity-50' : 'text-[#3D3833]'}`}>
                              {task.text}
                            </span>
                            <span className="text-[10px] font-black px-1.5 py-0.5 border uppercase" style={{ borderColor: PRIORITY_COLORS[task.priority].border, color: PRIORITY_COLORS[task.priority].text }}>
                              {PRIORITY_LABELS[task.priority]}
                            </span>
                            {task.dueDate && (
                              <span className="text-[10px] font-mono text-[#3D3833]/60 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />{task.dueDate}
                              </span>
                            )}
                            {task.subtasks.length > 0 && (
                              <span className="text-[10px] font-mono text-[#3D3833]/40">
                                [{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}]
                              </span>
                            )}
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <select
                                value={task.priority}
                                onChange={(e) => { e.stopPropagation(); updateTaskPriority(task.id, e.target.value as TaskPriority); }}
                                className="text-[10px] bg-[#F2EFEB] border border-[#F5C842]/30 text-[#3D3833] px-1 py-0.5 font-bold uppercase cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <option value="low">LOW</option>
                                <option value="medium">MED</option>
                                <option value="high">HIGH</option>
                                <option value="critical">CRIT</option>
                              </select>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleTaskDelete(task.id); }}
                                className="p-1 hover:text-[#E8823A] transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          {task.subtasks.length > 0 && (
                            <div className="mt-2 ml-10 space-y-1">
                              {task.subtasks.map(st => (
                                <div key={st.id} className="flex items-center gap-2">
                                  <button onClick={() => handleSubTaskToggle(task.id, st.id)} className={`w-4 h-4 border flex items-center justify-center shrink-0 text-[8px] font-black ${st.completed ? 'border-[#E8823A] text-[#E8823A]' : 'border-[#F5C842]/50 text-[#3D3833]/50'}`}>
                                    {st.completed ? 'X' : ''}
                                  </button>
                                  <span className={`text-xs font-mono ${st.completed ? 'line-through opacity-40' : 'text-[#3D3833]/70'}`}>{st.text}</span>
                                  <button onClick={() => deleteSubTask(task.id, st.id)} className="opacity-0 group-hover:opacity-100 text-[#E8823A] text-[10px]">x</button>
                                </div>
                              ))}
                            </div>
                          )}
                          {task.tags.length > 0 && (
                            <div className="mt-2 ml-10 flex gap-1 flex-wrap">
                              {task.tags.map(tag => (
                                <span key={tag} className="text-[9px] bg-[#E8823A]/10 border border-[#E8823A]/30 px-1 font-bold text-[#E8823A] uppercase">#{tag}</span>
                              ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="pt-4 mt-4 border-t-2 border-[#F5C842]/30 border-dashed">
                      <div className="relative">
                        <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-[#3D3833]/50" />
                        <input
                          type="text"
                          placeholder="ADD NEW TASK..."
                          onKeyDown={handleTaskAdd}
                          className="w-full pl-12 pr-4 py-4 bg-transparent border-4 border-[#F5C842] focus:outline-none focus:border-[#E8823A] text-lg uppercase placeholder:text-[#3D3833]/40 font-bold text-[#3D3833]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {currentView === 'settings' && (
            <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-8">
              <h2 className="text-3xl font-black uppercase leading-none border-l-8 border-[#F5C842] pl-4">
                SETTINGS
              </h2>

              {/* Secret Key */}
              <div className="border-4 border-[#F5C842] p-6 space-y-4">
                <h3 className="font-black text-xl uppercase border-b-2 border-[#F5C842]/30 pb-2">Secret Key</h3>
                <p className="font-mono text-xs opacity-60 uppercase">Type it in the search bar to reveal secure notes.</p>
                {editingSecretKey ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={secretKey}
                      onChange={(e) => setSecretKey(e.target.value)}
                      placeholder="ENTER SECRET KEY..."
                      className="flex-1 px-4 py-3 bg-transparent border-4 border-[#E8823A] focus:outline-none text-sm uppercase font-bold text-[#3D3833]"
                    />
                    <button
                      onClick={() => {
                        localStorage.setItem('cipher_secret_key', secretKey);
                        setEditingSecretKey(false);
                      }}
                      className="px-6 py-3 bg-[#F5C842] text-[#3D3833] font-black text-sm border-4 border-[#F5C842] hover:bg-[#E8823A] hover:text-white transition-colors uppercase"
                    >
                      SAVE
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <div className="flex-1 px-4 py-3 border-4 border-[#F5C842]/50 text-sm uppercase font-bold text-[#3D3833] font-mono">
                      {secretKey ? '•'.repeat(secretKey.length) : 'NOT SET'}
                    </div>
                    <button
                      onClick={() => setEditingSecretKey(true)}
                      className="px-6 py-3 border-4 border-[#F5C842] text-[#3D3833] font-black text-sm uppercase hover:bg-[#F5C842] transition-colors"
                    >
                      {secretKey ? 'EDIT' : 'SET'}
                    </button>
                  </div>
                )}
                {secretKey && (
                  <div className="font-mono text-xs text-[#E8823A] uppercase">
                    &gt; Active.
                  </div>
                )}
              </div>

              {/* Export / Import */}
              <div className="border-4 border-[#F5C842] p-6 space-y-4">
                <h3 className="font-black text-xl uppercase border-b-2 border-[#F5C842]/30 pb-2">Data Management</h3>
                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      const data = JSON.stringify(notes, null, 2);
                      const blob = new Blob([data], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'void_docs_export.json'; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="flex-1 py-3 border-4 border-[#F5C842] text-[#3D3833] font-black text-sm uppercase hover:bg-[#F5C842] transition-colors"
                  >
                    EXPORT ALL
                  </button>
                  <label className="flex-1 py-3 border-4 border-dashed border-[#E8823A]/50 text-[#E8823A] font-black text-sm text-center uppercase cursor-pointer hover:bg-[#E8823A]/10 transition-colors">
                    IMPORT
                    <input
                      type="file"
                      accept=".json"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          try {
                            const imported = JSON.parse(ev.target?.result as string);
                            if (Array.isArray(imported)) {
                              const migrated = imported.map((n: Record<string, unknown>) => ({
                                ...n,
                                createdAt: (n.createdAt as number) || (n.updatedAt as number) || Date.now(),
                                tags: (n.tags as string[]) || [],
                                isPinned: (n.isPinned as boolean) || false,
                                isArchived: (n.isArchived as boolean) || false,
                                isDeleted: (n.isDeleted as boolean) || false,
                              })) as StoredNote[];
                              saveToStorage([...notes, ...migrated]);
                            }
                          } catch (err) { console.error('Import failed', err); }
                        };
                        reader.readAsText(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Stats */}
              <div className="border-4 border-[#F5C842] p-6 space-y-4">
                <h3 className="font-black text-xl uppercase border-b-2 border-[#F5C842]/30 pb-2">Stats</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 border-2 border-[#F5C842]/30">
                    <div className="text-3xl font-black text-[#E8823A]">{notes.filter(n => !n.isDeleted).length}</div>
                    <div className="font-mono text-[10px] uppercase opacity-60 mt-1">Total Files</div>
                  </div>
                  <div className="text-center p-4 border-2 border-[#E8823A]/30">
                    <div className="text-3xl font-black text-[#E8823A]">{notes.filter(n => n.isLocked && !n.isDeleted).length}</div>
                    <div className="font-mono text-[10px] uppercase opacity-60 mt-1">Encrypted</div>
                  </div>
                  <div className="text-center p-4 border-2 border-[#F5C842]/30">
                    <div className="text-3xl font-black text-[#E8823A]">{notes.filter(n => n.isDeleted).length}</div>
                    <div className="font-mono text-[10px] uppercase opacity-60 mt-1">In Trash</div>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="border-4 border-red-400 p-6 space-y-4">
                <h3 className="font-black text-xl uppercase border-b-2 border-red-400/30 pb-2 text-red-600">Danger Zone</h3>
                <button
                  onClick={() => {
                    if (confirm('PERMANENTLY DELETE ALL FILES? THIS CANNOT BE UNDONE.')) {
                      localStorage.removeItem('cipher_notes_data');
                      setNotes([]);
                    }
                  }}
                  className="px-6 py-3 border-4 border-red-400 text-red-600 font-black text-sm uppercase hover:bg-red-400 hover:text-white transition-colors"
                >
                  PURGE ALL DATA
                </button>
              </div>
            </div>
          )}

          {currentView === 'profile' && (
            <div className="flex-1 overflow-y-auto pr-2 pb-8 space-y-6">
              <div className="flex items-center gap-4 border-l-8 border-[#E8823A] pl-4">
                <button
                  onClick={() => setCurrentView('all_notes')}
                  className="px-3 py-2 border-4 border-[#F5C842] text-[#3D3833] font-black text-sm uppercase hover:bg-[#F5C842] transition-colors"
                >
                  BACK
                </button>
                <h2 className="text-3xl font-black uppercase leading-none">PROFILE</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 max-w-lg">
                <div
                  onClick={() => { setActiveNoteId(null); setCurrentView('archive'); }}
                  className="p-6 border-4 border-[#F5C842] cursor-pointer hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors flex items-center gap-4"
                >
                  <Archive className="w-8 h-8" />
                  <div>
                    <h3 className="font-black text-2xl uppercase">Archive</h3>
                    <p className="font-mono text-xs opacity-60 uppercase mt-1">Archived files</p>
                  </div>
                </div>
                <div
                  onClick={() => { setActiveNoteId(null); setCurrentView('trash'); }}
                  className="p-6 border-4 border-[#E8823A]/40 cursor-pointer hover:bg-[#E8823A] hover:text-white transition-colors flex items-center gap-4"
                >
                  <Trash2 className="w-8 h-8" />
                  <div>
                    <h3 className="font-black text-2xl uppercase">Trash</h3>
                    <p className="font-mono text-xs opacity-60 uppercase mt-1">Deleted files</p>
                  </div>
                </div>
                <div
                  onClick={() => { setActiveNoteId(null); setCurrentView('settings'); }}
                  className="p-6 border-4 border-[#F5C842]/40 cursor-pointer hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors flex items-center gap-4"
                >
                  <KeyRound className="w-8 h-8" />
                  <div>
                    <h3 className="font-black text-2xl uppercase">Settings</h3>
                    <p className="font-mono text-xs opacity-60 uppercase mt-1">Secret key and data management</p>
                  </div>
                </div>
              </div>
            </div>
          )}

        </section>

        {/* RIGHT SIDEBAR */}
        <aside className="col-span-2 flex flex-col gap-4 overflow-y-auto pr-2 pb-8">
          <div className="bg-[#F5C842] p-4 text-[#3D3833]">
            <h3 className="font-black text-lg mb-2 uppercase">Info</h3>
            <div className="font-mono text-xs space-y-1 font-bold uppercase">
              {activeNoteId ? (
                <>
                  <p>ID: {activeNoteId.slice(0,8)}</p>
                  <p>TYPE: {activeType === 'note' ? 'DOCUMENT' : 'TASK LIST'}</p>
                  <p>STATUS: {activeIsLocked ? 'ENCRYPTED' : 'PLAINTEXT'}</p>
                  <p>UPDATED: {new Date(notes.find(n => n.id === activeNoteId)?.updatedAt || 0).toLocaleDateString()}</p>
                  {currentView === 'editor' && activeType === 'note' && (
                    <>
                      <p>WORDS: {activeContent.split(/\s+/).filter(Boolean).length}</p>
                      <p>CHARS: {activeContent.length}</p>
                      <p>LINES: {activeContent.split('\n').length}</p>
                    </>
                  )}
                  {currentView === 'editor' && activeType === 'tasks' && (
                    <>
                      <p>TASKS: {activeTasks.length}</p>
                      <p>DONE: {activeTasks.filter(t => t.completed).length}</p>
                      <p>PENDING: {activeTasks.filter(t => !t.completed).length}</p>
                    </>
                  )}
                </>
              ) : (
                <>
                  <p>FILES: {notes.filter(n => !n.isDeleted).length}</p>
                  <p>NOTES: {notes.filter(n => n.type === 'note' && !n.isDeleted).length}</p>
                  <p>TASKS: {notes.filter(n => n.type === 'tasks' && !n.isDeleted).length}</p>
                  <p>ENCRYPTED: {notes.filter(n => n.isLocked && !n.isDeleted).length}</p>
                </>
              )}
            </div>
          </div>

          {currentView === 'editor' && activeNoteId ? (
            <>
              <div
                onClick={closeEditor}
                className="border-4 border-[#F5C842] bg-transparent p-4 group cursor-pointer hover:bg-[#F5C842] transition-colors text-[#3D3833] hover:text-[#3D3833] flex items-center justify-center"
              >
                <h3 className="font-black text-2xl uppercase">SAVE & CLOSE</h3>
              </div>

              <div
                onClick={toggleLockState}
                className={`border-4 p-4 group cursor-pointer transition-colors flex items-center justify-center ${activeIsLocked ? 'border-[#E8823A] bg-[#E8823A] text-white hover:bg-transparent hover:text-[#E8823A]' : 'border-[#E8823A] bg-transparent text-[#E8823A] hover:bg-[#E8823A] hover:text-white'}`}
              >
                <h3 className="font-black text-xl uppercase flex items-center gap-2">
                  {activeIsLocked ? <Unlock className="w-5 h-5"/> : <Lock className="w-5 h-5"/>}
                  {activeIsLocked ? 'DECRYPT FILE' : 'ENCRYPT FILE'}
                </h3>
              </div>

              <div
                onClick={() => {
                  const activeNote = notes.find(n => n.id === activeNoteId);
                  if (activeNote) togglePin(activeNote.id);
                }}
                className={`border-4 p-3 cursor-pointer transition-colors flex items-center justify-center ${notes.find(n => n.id === activeNoteId)?.isPinned ? 'bg-[#E8823A] text-white border-[#E8823A]' : 'bg-transparent text-[#E8823A] border-[#E8823A] hover:bg-[#E8823A] hover:text-white'}`}
              >
                <h3 className="font-black text-lg uppercase flex items-center gap-2">
                  {notes.find(n => n.id === activeNoteId)?.isPinned ? <BookmarkCheck className="w-5 h-5"/> : <Bookmark className="w-5 h-5"/>}
                  {notes.find(n => n.id === activeNoteId)?.isPinned ? 'UNPIN' : 'PIN'}
                </h3>
              </div>

              <div
                onClick={() => {
                  const activeNote = notes.find(n => n.id === activeNoteId);
                  if (activeNote) toggleArchive(activeNote.id);
                }}
                className="border-4 border-[#F5C842] bg-transparent p-3 cursor-pointer hover:bg-[#F5C842] transition-colors text-[#3D3833] hover:text-[#3D3833] flex items-center justify-center"
              >
                <h3 className="font-black text-lg uppercase flex items-center gap-2">
                  <Archive className="w-5 h-5"/>
                  {notes.find(n => n.id === activeNoteId)?.isArchived ? 'UNARCHIVE' : 'ARCHIVE'}
                </h3>
              </div>

              <div className="border-4 border-[#F5C842]/30 p-3 space-y-2">
                <p className="font-mono text-[10px] uppercase font-bold opacity-50">TAGS</p>
                <div className="flex flex-wrap gap-1">
                  {(notes.find(n => n.id === activeNoteId)?.tags || []).map(tag => (
                    <span key={tag} className="text-[10px] bg-[#E8823A]/20 border border-[#E8823A]/50 px-1.5 py-0.5 font-bold text-[#E8823A] uppercase flex items-center gap-1">
                      #{tag}
                      <button onClick={(e) => { e.stopPropagation(); removeTagFromNote(activeNoteId!, tag); }} className="text-[8px] hover:text-[#E8E4DE]">×</button>
                    </span>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="+ ADD TAG"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      addTagToNote(activeNoteId!, e.currentTarget.value.trim().toLowerCase());
                      e.currentTarget.value = '';
                    }
                  }}
                  className="w-full px-2 py-1 bg-transparent border border-[#F5C842]/30 text-[10px] uppercase font-bold focus:outline-none focus:border-[#F5C842] text-[#3D3833] placeholder:text-[#3D3833]/30"
                />
              </div>

              <div className="border-4 border-[#F5C842]/30 p-3 space-y-2">
                <p className="font-mono text-[10px] uppercase font-bold opacity-50">FOLDER</p>
                <input
                  type="text"
                  value={notes.find(n => n.id === activeNoteId)?.folder || ''}
                  onChange={(e) => {
                    const updated = notes.map(n => n.id === activeNoteId ? { ...n, folder: e.target.value || undefined, updatedAt: Date.now() } : n);
                    saveToStorage(updated);
                  }}
                  placeholder="NO FOLDER"
                  className="w-full px-2 py-1 bg-transparent border border-[#F5C842]/30 text-[10px] uppercase font-bold focus:outline-none focus:border-[#F5C842] text-[#3D3833] placeholder:text-[#3D3833]/30"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const activeNote = notes.find(n => n.id === activeNoteId);
                    if (!activeNote) return;
                    const data = JSON.stringify(activeNote, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = `${activeNote.title}.json`; a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 py-2 border-2 border-[#F5C842]/50 text-[#3D3833] text-[10px] font-bold uppercase hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors"
                >
                  <div>EXPORT .JSON</div>
                </button>
              </div>

              <div
                onClick={() => softDeleteNote(activeNoteId)}
                className="mt-auto border-4 border-[#E8823A] bg-transparent p-4 text-[#E8823A] hover:bg-[#E8823A] hover:text-white font-black text-lg text-center cursor-pointer uppercase transition-colors"
              >
                <div>DELETE FILE</div>
              </div>
            </>
          ) : (
            <div className="border-4 border-[#F5C842]/30 p-3">
              <p className="font-mono text-[10px] uppercase font-bold opacity-50 mb-2">IMPORT DATA</p>
              <label className="flex items-center justify-center w-full py-3 border-2 border-dashed border-[#F5C842]/40 text-[#3D3833]/60 hover:text-[#3D3833] hover:border-[#F5C842] cursor-pointer transition-colors text-xs font-bold uppercase">
                <Upload className="w-4 h-4 mr-2" /> SELECT FILE
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      try {
                        const imported = JSON.parse(ev.target?.result as string);
                        if (Array.isArray(imported)) {
                          const migrated = imported.map((n: Record<string, unknown>) => ({
                            ...n,
                            createdAt: (n.createdAt as number) || (n.updatedAt as number) || Date.now(),
                            tags: (n.tags as string[]) || [],
                            isPinned: (n.isPinned as boolean) || false,
                            isArchived: (n.isArchived as boolean) || false,
                            isDeleted: (n.isDeleted as boolean) || false,
                          })) as StoredNote[];
                          saveToStorage([...notes, ...migrated]);
                        }
                      } catch (err) { console.error('Import failed', err); }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          )}
        </aside>
      </main>

      {/* PASSWORD MODAL */}
      {passwordPrompt.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#E8E4DE]/90 backdrop-blur-md">
          <div className="bg-[#F2EFEB] border-4 border-[#E8823A] w-full max-w-md flex flex-col p-8 shadow-[10px_10px_0px_0px_rgba(232,130,58,1)]">
            <div>
              <div className="flex items-center gap-4 mb-6">
                <KeyRound className="w-10 h-10 text-[#E8823A]" />
                <h2 className="font-black text-4xl uppercase text-[#E8823A]">
                  {passwordPrompt.action === 'lock_note' ? 'ENCRYPT' : 'DECRYPT'}
                </h2>
              </div>
              
              <p className="font-mono text-sm font-bold mb-8 uppercase text-[#3D3833]/80">
                {passwordPrompt.action === 'lock_note' 
                  ? '> Set master password to encrypt this file.' 
                  : '> Enter master password to access secure enclave.'}
              </p>
              
              <input 
                type="password" 
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
                placeholder="ENTER KEY..."
                className="w-full px-6 py-4 bg-transparent border-4 border-[#F5C842] focus:outline-none focus:border-[#E8823A] text-xl font-bold mb-6 text-[#3D3833] placeholder:text-[#3D3833]/30"
                autoFocus
              />
              
              {passwordError && (
                <div className="text-[#E8E4DE] text-xs font-bold uppercase mb-6 bg-[#E8823A] p-3 border-2 border-[#E8E4DE] animate-pulse">
                  ERROR: {passwordError}
                </div>
              )}
              
              <div className="flex gap-4">
                <button 
                  onClick={() => setPasswordPrompt({ isOpen: false, action: 'unlock_vault' })}
                  className="flex-1 py-4 bg-transparent text-[#3D3833] border-4 border-[#F5C842] font-black uppercase hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors"
                >
                  ABORT
                </button>
                <button 
                  onClick={handlePasswordSubmit}
                  className="flex-1 py-4 bg-[#E8823A] text-white border-4 border-[#E8823A] font-black uppercase hover:bg-[#E8E4DE] hover:text-[#E8823A] hover:border-[#E8823A] transition-colors"
                >
                  EXECUTE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#E8E4DE]/90 backdrop-blur-md">
          <div className="bg-[#F2EFEB] border-4 border-[#E8823A] w-full max-w-sm flex flex-col p-8 shadow-[10px_10px_0px_0px_rgba(232,130,58,1)]">
            <h2 className="font-black text-3xl uppercase text-[#E8823A] mb-4">DELETE FILE?</h2>
            <p className="font-mono text-sm font-bold mb-8 uppercase text-[#3D3833]/80">
              &gt; This file will be moved to trash.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-4 bg-transparent text-[#3D3833] border-4 border-[#F5C842] font-black uppercase hover:bg-[#F5C842] hover:text-[#3D3833] transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={() => { softDeleteNote(deleteConfirmId); setDeleteConfirmId(null); }}
                className="flex-1 py-4 bg-[#E8823A] text-white border-4 border-[#E8823A] font-black uppercase hover:bg-[#E8E4DE] hover:text-[#E8823A] hover:border-[#E8823A] transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
