import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen,
  MessageSquare,
  ChevronRight,
  Menu,
  X,
  Info,
  Search,
  Send,
  Loader2,
  ArrowLeft,
  LogIn,
  UserPlus,
  Phone,
  Settings,
  Shield,
  Video,
  Sliders,
  User as UserIcon,
  Trash,
  Plus,
  Check,
  Upload
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';

// Interfaces mapping database entities
interface User {
  id: number;
  name: string;
  email: string;
  role: 'Livestock Manager' | 'Farmer' | 'Veterinarian' | 'Extension Worker' | 'Admin';
  organization: string;
  status: 'Active' | 'Inactive';
  modulesCompleted: number;
  seminarsAttended: number;
  dssAssessmentsRun: number;
}

interface LearningModule {
  id: number;
  title: string;
  description: string;
  content: string;
  imageUrl?: string;
}

interface Meeting {
  id: number;
  title: string;
  host: string;
  dateTime: string;
  status: 'Live' | 'Upcoming' | 'Ended';
  registrants: number;
  videoLink: string;
}

interface Assessment {
  id: number;
  cattleId: string;
  age: number;
  bcs: number;
  daysSinceCalving?: number;
  estrusIndicators: string;
  history: string;
  healthStatus: string;
  isReady: boolean;
  recommendation: string;
  guidance: string;
  createdAt: string;
}

interface SystemSettings {
  portalName: string;
  aiProvider: string;
  videoProvider: string;
  dssVersion: string;
}

function isValidImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || /[\s{}();]/.test(trimmed)) return false;
  return /^(https?:\/\/|\/uploads\/|data:image\/)/.test(trimmed);
}

function parseLessons(content: string): { title: string; content: string }[] {
  if (!content) return [];
  
  // Split by "## " to get sections
  const parts = content.split(/\n##\s+/);
  const lessons: { title: string; content: string }[] = [];
  
  // The first part is the introduction.
  const introPart = parts[0];
  const firstLine = introPart.split('\n')[0];
  const introTitle = firstLine.startsWith('# ') 
    ? firstLine.replace('# ', '').trim() 
    : 'Introduction';
  
  const introContent = firstLine.startsWith('# ') 
    ? introPart.substring(firstLine.length).trim() 
    : introPart.trim();
    
  lessons.push({
    title: 'Introduction',
    content: `# ${introTitle}\n\n${introContent}`
  });
  
  // The rest of the parts are the sections
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    const lines = part.split('\n');
    const title = lines[0].trim();
    const sectionContent = lines.slice(1).join('\n').trim();
    
    lessons.push({
      title: title,
      content: `## ${title}\n\n${sectionContent}`
    });
  }
  
  return lessons;
}

type Tab = 'dashboard' | 'learning' | 'chatbot' | 'dss' | 'meetings' | 'profile' | 'admin';
const VALID_TABS: Tab[] = ['dashboard', 'learning', 'chatbot', 'dss', 'meetings', 'profile', 'admin'];

function tabFromPath(pathname: string): Tab {
  const path = pathname.replace(/^\//, '');
  return (VALID_TABS as string[]).includes(path) ? (path as Tab) : 'dashboard';
}

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'modules' | 'meetings' | 'settings'>('users');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState<number>(0);
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<number, number[]>>({});
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Dynamic Data States
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<LearningModule | null>(null);
  const [editingModule, setEditingModule] = useState<LearningModule | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    portalName: 'PHILSAR — Cattle Reproductive Management Portal',
    aiProvider: 'Gemini API (Google)',
    videoProvider: 'Jitsi Meet (Open Source)',
    dssVersion: 'v2.1 — AI-Assisted Rule-Based'
  });

  // Auth Forms State
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isRegisterForm, setIsRegisterForm] = useState(false);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    organization: '',
    role: 'Farmer',
    password: '',
    currentPassword: ''
  });

  // Chat State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: 'Hello! I am **PHILSARBot**, your AI assistant for cattle reproductive management. I can help you understand estrus cycles, AI procedures, breeding techniques, and more. What would you like to know today?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // DSS State
  const [dssForm, setDssForm] = useState({
    cattleId: '',
    age: '',
    bcs: '5 — Moderate',
    daysSinceCalving: '',
    estrusIndicators: 'Standing Heat',
    history: 'Successful Previous Calving',
    healthStatus: 'Healthy — no issues'
  });
  const [dssResult, setDssResult] = useState<Assessment | null>(null);

  // Admin Operations State
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
  const [newModuleForm, setNewModuleForm] = useState({ title: '', description: '', content: '', imageUrl: '' });
  const [newMeetingForm, setNewMeetingForm] = useState({ title: '', host: '', dateTime: '', status: 'Upcoming' as any, videoLink: '' });

  // Image Uploading States for Admin Panel Modules
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Content Image Upload States
  const [uploadingContentImage, setUploadingContentImage] = useState(false);
  const contentFileInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Loaders
  const [dataLoading, setDataLoading] = useState(false);

  const API_BASE = 'http://localhost:5000/api';

  // Core Hooks & Effects
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  // Jitsi Meet External API reference
  const jitsiApiRef = useRef<any>(null);

  useEffect(() => {
    if (meetingModalOpen && activeMeeting && activeMeeting.status !== 'Ended') {
      const timer = setTimeout(() => {
        const JitsiMeet = (window as any).JitsiMeetExternalAPI;
        if (JitsiMeet) {
          const sanitizedRoomName = activeMeeting.title.replace(/[^a-zA-Z0-9]/g, '') || 'Seminar';
          const roomName = `vpaas-magic-cookie-53e5d675a0894588a3bd511e6f7dd935/${sanitizedRoomName}`;
          
          jitsiApiRef.current = new JitsiMeet("8x8.vc", {
            roomName: roomName,
            parentNode: document.getElementById('jaas-container'),
            userInfo: {
              displayName: currentUser?.name || 'Guest User',
              email: currentUser?.email || ''
            },
            configOverwrite: {
              startWithAudioMuted: true,
              startWithVideoMuted: true
            }
          });
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        }
      };
    }
  }, [meetingModalOpen, activeMeeting]);

  useEffect(() => {
    // Check locally stored user on mount
    const storedUser = localStorage.getItem('philsar_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      setCurrentUser(parsedUser);
      setIsAuthenticated(true);
      setProfileForm({
        name: parsedUser.name,
        email: parsedUser.email,
        organization: parsedUser.organization || '',
        role: parsedUser.role,
        password: '',
        currentPassword: ''
      });
    }
    const storedLessons = localStorage.getItem('philsar_completed_lessons');
    if (storedLessons) {
      setCompletedLessonsMap(JSON.parse(storedLessons));
    }
    fetchGlobalData();

    // Normalize the landing URL so it always reflects the active tab
    window.history.replaceState({}, '', `/${tabFromPath(window.location.pathname)}`);
  }, []);

  // Keep activeTab in sync with browser back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(tabFromPath(window.location.pathname));
      setSelectedModule(null);
      setSelectedLessonIndex(0);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch all necessary data from the backend APIs
  const fetchGlobalData = async () => {
    try {
      setDataLoading(true);
      const [modulesRes, meetingsRes, assessmentsRes, settingsRes] = await Promise.all([
        axios.get(`${API_BASE}/modules`),
        axios.get(`${API_BASE}/meetings`),
        axios.get(`${API_BASE}/assessments`),
        axios.get(`${API_BASE}/settings`)
      ]);

      setModules(modulesRes.data);
      setMeetings(meetingsRes.data);
      setAssessments(assessmentsRes.data);
      setSettings(settingsRes.data);
    } catch (error) {
      console.error('Error fetching global database data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  const fetchUsersList = async () => {
    try {
      const usersRes = await axios.get(`${API_BASE}/auth/users`);
      setAllUsers(usersRes.data);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin' && currentUser?.role === 'Admin') {
      fetchUsersList();
    }
  }, [activeTab]);

  // Auth Operations
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/auth/login`, {
        email: authForm.email,
        password: authForm.password
      });
      const user = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify(user));
      setCurrentUser(user);
      setIsAuthenticated(true);
      setAuthForm({ name: '', email: '', password: '', role: 'Farmer', organization: '' });

      // Prepopulate profile form
      setProfileForm({
        name: user.name,
        email: user.email,
        organization: user.organization || '',
        role: user.role,
        password: '',
        currentPassword: ''
      });

      // Refetch stats and activity logs
      fetchGlobalData();
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Invalid email or password.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/auth/register`, {
        name: authForm.name,
        email: authForm.email,
        password: authForm.password,
        role: authForm.role,
        organization: authForm.organization
      });
      const user = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify(user));
      setCurrentUser(user);
      setIsAuthenticated(true);
      setAuthForm({ name: '', email: '', password: '', role: 'Farmer', organization: '' });

      // Prepopulate profile form
      setProfileForm({
        name: user.name,
        email: user.email,
        organization: user.organization || '',
        role: user.role,
        password: '',
        currentPassword: ''
      });

      fetchGlobalData();
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Registration failed. Email may already be in use.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('philsar_user');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setActiveTab('dashboard');
  };

  // Profile Updates
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    try {
      const response = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
        name: profileForm.name,
        email: profileForm.email,
        role: profileForm.role,
        organization: profileForm.organization,
        password: profileForm.password || undefined,
        currentPassword: profileForm.password ? profileForm.currentPassword : undefined
      });
      const updated = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify(updated));
      setCurrentUser(updated);
      alert('Profile updated successfully!');
      setProfileForm(prev => ({ ...prev, password: '', currentPassword: '' }));
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to update profile.');
    }
  };

  // Chat Operations
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage.trim();
    if (!text) return;

    if (!textToSend) setInputMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
    setIsChatLoading(true);

    try {
      const response = await axios.post(`${API_BASE}/chat/ask`, {
        message: text,
        user: currentUser ? {
          name: currentUser.name,
          role: currentUser.role,
          organization: currentUser.organization
        } : null
      });
      const reply = response.data?.response || "I couldn't process that query.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (error) {
      console.error(error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error connecting to the server. Please check your connection." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // DSS Insemination Assessment
  const handleDSSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dssForm.cattleId || !dssForm.age || !dssForm.daysSinceCalving) {
      alert('Please fill out all required cattle data fields.');
      return;
    }
    try {
      const response = await axios.post(`${API_BASE}/assessments`, {
        cattleId: dssForm.cattleId,
        age: dssForm.age,
        bcs: dssForm.bcs.split(' ')[0], // Parse first character (number)
        daysSinceCalving: dssForm.daysSinceCalving,
        estrusIndicators: dssForm.estrusIndicators,
        history: dssForm.history,
        healthStatus: dssForm.healthStatus,
        userId: currentUser?.id
      });

      setDssResult(response.data.assessment);

      // Reload assessments feed & refresh user stats in state
      fetchGlobalData();
      if (currentUser) {
        setCurrentUser({ ...currentUser, dssAssessmentsRun: currentUser.dssAssessmentsRun + 1 });
        const stored = localStorage.getItem('philsar_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.dssAssessmentsRun += 1;
          localStorage.setItem('philsar_user', JSON.stringify(parsed));
        }
      }
    } catch (error) {
      console.error(error);
      alert('Error running DSS assessment.');
    }
  };

  // Virtual Meetings RSVPs
  const handleRSVP = async (meetingId: number) => {
    try {
      const response = await axios.post(`${API_BASE}/meetings/${meetingId}/rsvp`, {
        userId: currentUser?.id
      });
      const updated = response.data.meeting;

      // Update in state list
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));

      // Refresh stats
      if (currentUser) {
        setCurrentUser({ ...currentUser, seminarsAttended: currentUser.seminarsAttended + 1 });
        const stored = localStorage.getItem('philsar_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.seminarsAttended += 1;
          localStorage.setItem('philsar_user', JSON.stringify(parsed));
        }
      }

      alert('RSVP registered successfully! We added this meeting to your schedule.');
    } catch (error) {
      console.error(error);
      alert('Error registering RSVP.');
    }
  };

  const handleJoinMeeting = (meeting: Meeting) => {
    setActiveMeeting(meeting);
    setMeetingModalOpen(true);
  };

  // Admin Dashboard CRUD Operations
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/auth/register`, newUserForm);
      alert('User added successfully!');
      setNewUserForm({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
      fetchUsersList();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Error adding user.');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to remove this user?')) return;
    try {
      await axios.delete(`${API_BASE}/auth/users/${userId}`);
      setAllUsers(prev => prev.filter(u => u.id !== userId));
    } catch (error) {
      console.error(error);
      alert('Error deleting user.');
    }
  };

  const handleImageFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('Image size exceeds 5MB limit. Please choose a smaller image.');
      return;
    }

    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const response = await axios.post(`${API_BASE}/modules/upload`, {
            base64Data,
            fileName: file.name
          });
          const uploadedUrl = response.data.url;
          setNewModuleForm(prev => ({ ...prev, imageUrl: uploadedUrl }));
        } catch (uploadError: any) {
          console.error('Upload error:', uploadError);
          alert(uploadError.response?.data?.message || 'Failed to upload image to the server.');
        } finally {
          setUploadingImage(false);
        }
      };
      reader.onerror = () => {
        alert('Error reading the image file.');
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('FileReader error:', error);
      alert('Error processing the file.');
      setUploadingImage(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleImageFileUpload(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleImageFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleContentImageUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('Image size exceeds 5MB limit. Please choose a smaller image.');
      return;
    }

    setUploadingContentImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const response = await axios.post(`${API_BASE}/modules/upload`, {
            base64Data,
            fileName: file.name
          });
          const uploadedUrl = response.data.url;

          // Insert markdown image at cursor position in textarea
          const textarea = contentTextareaRef.current;
          const currentContent = newModuleForm.content;
          const altText = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
          const markdownImg = `\n\n![${altText}](${uploadedUrl})\n\n`;

          if (textarea) {
            const cursorPos = textarea.selectionStart || currentContent.length;
            const before = currentContent.substring(0, cursorPos);
            const after = currentContent.substring(cursorPos);
            const newContent = before + markdownImg + after;
            setNewModuleForm(prev => ({ ...prev, content: newContent }));

            // Restore focus and move cursor after inserted text
            setTimeout(() => {
              textarea.focus();
              const newCursorPos = cursorPos + markdownImg.length;
              textarea.setSelectionRange(newCursorPos, newCursorPos);
            }, 100);
          } else {
            setNewModuleForm(prev => ({ ...prev, content: currentContent + markdownImg }));
          }
        } catch (uploadError: any) {
          console.error('Content image upload error:', uploadError);
          alert(uploadError.response?.data?.message || 'Failed to upload image.');
        } finally {
          setUploadingContentImage(false);
        }
      };
      reader.onerror = () => {
        alert('Error reading the image file.');
        setUploadingContentImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Content FileReader error:', error);
      alert('Error processing the file.');
      setUploadingContentImage(false);
    }
  };

  const handleContentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleContentImageUpload(e.target.files[0]);
      e.target.value = ''; // reset so same file can be re-selected
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingModule) {
        await axios.put(`${API_BASE}/modules/${editingModule.id}`, newModuleForm);
        alert('Module updated successfully!');
        setEditingModule(null);
      } else {
        await axios.post(`${API_BASE}/modules`, newModuleForm);
        alert('Module created successfully!');
      }
      setNewModuleForm({ title: '', description: '', content: '', imageUrl: '' });
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      alert('Error saving module.');
    }
  };

  const handleDeleteModule = async (moduleId: number) => {
    if (!confirm('Are you sure you want to delete this module? This will remove all its lessons.')) return;
    try {
      await axios.delete(`${API_BASE}/modules/${moduleId}`);
      alert('Module deleted successfully!');
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      alert('Error deleting module.');
    }
  };

  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post(`${API_BASE}/meetings`, newMeetingForm);
      alert('Seminar scheduled successfully!');
      setNewMeetingForm({ title: '', host: '', dateTime: '', status: 'Upcoming', videoLink: '' });
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      alert('Error scheduling meeting.');
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!confirm('Are you sure you want to cancel this meeting?')) return;
    try {
      await axios.delete(`${API_BASE}/meetings/${meetingId}`);
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
    } catch (error) {
      console.error(error);
      alert('Error deleting meeting.');
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_BASE}/settings`, settings);
      setSettings(response.data.settings);
      alert('System configurations saved successfully!');
    } catch (error) {
      console.error(error);
      alert('Error saving system settings.');
    }
  };

  const handleMarkModuleComplete = async (mod: LearningModule) => {
    if (!currentUser) return;
    try {
      const updatedStats = currentUser.modulesCompleted + 1;
      const response = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
        modulesCompleted: updatedStats
      });
      const updated = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify(updated));
      setCurrentUser(updated);
      alert(`Congratulations! You've marked "${mod.title}" as complete.`);
    } catch (error) {
      console.error(error);
      alert('Error updating completion progress.');
    }
  };

  const handleMarkLessonComplete = async (mod: LearningModule) => {
    if (!mod) return;
    const currentCompleted = completedLessonsMap[mod.id] || [];
    if (currentCompleted.includes(selectedLessonIndex)) {
      alert('This lesson is already marked complete!');
      return;
    }
    
    const updatedCompleted = [...currentCompleted, selectedLessonIndex];
    const newMap = { ...completedLessonsMap, [mod.id]: updatedCompleted };
    setCompletedLessonsMap(newMap);
    localStorage.setItem('philsar_completed_lessons', JSON.stringify(newMap));
    
    const parsedLessons = parseLessons(mod.content);
    if (updatedCompleted.length === parsedLessons.length) {
      if (currentUser) {
        try {
          const updatedStats = currentUser.modulesCompleted + 1;
          const response = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
            modulesCompleted: updatedStats
          });
          const updatedUser = response.data.user;
          localStorage.setItem('philsar_user', JSON.stringify(updatedUser));
          setCurrentUser(updatedUser);
          alert(`Congratulations! You've fully completed the "${mod.title}" module!`);
        } catch (error) {
          console.error(error);
        }
      } else {
        alert(`Congratulations! You've fully completed the "${mod.title}" module!`);
      }
    } else {
      alert(`Lesson "${parsedLessons[selectedLessonIndex]?.title}" marked as complete!`);
    }
  };

  const handleUnmarkLessonComplete = async (mod: LearningModule) => {
    if (!mod) return;
    const currentCompleted = completedLessonsMap[mod.id] || [];
    if (!currentCompleted.includes(selectedLessonIndex)) {
      return;
    }

    const updatedCompleted = currentCompleted.filter(idx => idx !== selectedLessonIndex);
    const newMap = { ...completedLessonsMap, [mod.id]: updatedCompleted };
    setCompletedLessonsMap(newMap);
    localStorage.setItem('philsar_completed_lessons', JSON.stringify(newMap));

    const parsedLessons = parseLessons(mod.content);
    if (currentCompleted.length === parsedLessons.length && updatedCompleted.length < parsedLessons.length) {
      if (currentUser) {
        try {
          const updatedStats = Math.max(0, currentUser.modulesCompleted - 1);
          const response = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
            modulesCompleted: updatedStats
          });
          const updatedUser = response.data.user;
          localStorage.setItem('philsar_user', JSON.stringify(updatedUser));
          setCurrentUser(updatedUser);
        } catch (error) {
          console.error('Error decrementing completed modules:', error);
        }
      }
    }
    alert(`Lesson "${parsedLessons[selectedLessonIndex]?.title}" unmarked.`);
  };

  // Navigations
  const handleTabNavigate = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setSelectedModule(null);
    setSelectedLessonIndex(0);
    setSidebarOpen(false);
    window.history.pushState({}, '', `/${tab}`);
  };

  // Password visibility toggle
  const [showPassword, setShowPassword] = useState(false);

  // Render Auth Screen (Gatekeeper)
  if (!isAuthenticated) {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">

          {/* LEFT PANEL — Branding */}
          <div className="auth-left">
            <div className="auth-left-content">
              <div className="auth-brand">
                <div className="auth-brand-icon">🐄</div>
                <span className="auth-brand-name">PHILSAR</span>
              </div>

              <div className="auth-left-hero">
                <h1 className="auth-left-title">Cattle Reproductive Portal</h1>
                <p className="auth-left-desc">
                  A professional, data-driven management system supporting artificial insemination, estrus tracking, and herd productivity for local cattle farms.
                </p>
              </div>

              <div className="auth-features">
                <div className="auth-feature-item">
                  <div className="auth-feature-icon">🧬</div>
                  <div>
                    <div className="auth-feature-title">AI Breeding Assessment</div>
                    <div className="auth-feature-desc">Decision support using body condition score (BCS) &amp; estrus sign metrics.</div>
                  </div>
                </div>
                <div className="auth-feature-item">
                  <div className="auth-feature-icon">📚</div>
                  <div>
                    <div className="auth-feature-title">Structured e-Learning</div>
                    <div className="auth-feature-desc">Expert-curated modules on reproductive anatomy, protocols, and practices.</div>
                  </div>
                </div>
                <div className="auth-feature-item">
                  <div className="auth-feature-icon">🎥</div>
                  <div>
                    <div className="auth-feature-title">Seminars &amp; Collaboration</div>
                    <div className="auth-feature-desc">Attend virtual classrooms and connect with veterinary extension workers.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="auth-left-footer">
              © 2026 PHILSAR Portal. All rights reserved.
            </div>
          </div>

          {/* RIGHT PANEL — Form */}
          <div className="auth-right">
            <div className="auth-right-inner">

              {!isRegisterForm ? (
                <>
                  <div className="auth-form-header">
                    <h2 className="auth-form-title">Welcome back</h2>
                    <p className="auth-form-subtitle">Sign in to access your dashboard</p>
                  </div>

                  {authError && (
                    <div className="auth-error-box">{authError}</div>
                  )}

                  <form onSubmit={handleLoginSubmit} className="auth-form">
                    <div className="auth-field">
                      <label className="auth-label">Email Address</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">✉️</span>
                        <input
                          className="auth-input"
                          type="email"
                          placeholder="juan@gmail.com"
                          value={authForm.email}
                          onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="auth-field">
                      <div className="auth-label-row">
                        <label className="auth-label">Password</label>
                        <span className="auth-forgot">Forgot password?</span>
                      </div>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">🔒</span>
                        <input
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="••••••••••"
                          value={authForm.password}
                          onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                          required
                        />
                        <button
                          type="button"
                          className="auth-eye-btn"
                          onClick={() => setShowPassword(p => !p)}
                          tabIndex={-1}
                        >
                          {showPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <button className="auth-submit-btn" type="submit" disabled={authLoading}>
                      <span>→</span>
                      {authLoading ? 'Signing In…' : 'Sign In'}
                    </button>
                  </form>

                  <p className="auth-switch-text">
                    Don't have an account?{' '}
                    <a className="auth-switch-link" onClick={() => { setIsRegisterForm(true); setAuthError(''); }}>
                      Create one here
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <div className="auth-form-header">
                    <h2 className="auth-form-title">Create Account</h2>
                    <p className="auth-form-subtitle">Join the PHILSAR portal today</p>
                  </div>

                  {authError && (
                    <div className="auth-error-box">{authError}</div>
                  )}

                  <form onSubmit={handleRegisterSubmit} className="auth-form">
                    <div className="auth-field">
                      <label className="auth-label">Full Name</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">👤</span>
                        <input
                          className="auth-input"
                          type="text"
                          placeholder="James Kevin Santos"
                          value={authForm.name}
                          onChange={e => setAuthForm({ ...authForm, name: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="auth-field">
                      <label className="auth-label">Email Address</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">✉️</span>
                        <input
                          className="auth-input"
                          type="email"
                          placeholder="you@example.com"
                          value={authForm.email}
                          onChange={e => setAuthForm({ ...authForm, email: e.target.value })}
                          required
                        />
                      </div>
                    </div>

                    <div className="auth-field">
                      <label className="auth-label">Password</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">🔒</span>
                        <input
                          className="auth-input"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Create a strong password"
                          value={authForm.password}
                          onChange={e => setAuthForm({ ...authForm, password: e.target.value })}
                          required
                        />
                        <button
                          type="button"
                          className="auth-eye-btn"
                          onClick={() => setShowPassword(p => !p)}
                          tabIndex={-1}
                        >
                          {showPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <div className="auth-field">
                      <label className="auth-label">Role</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">🏷️</span>
                        <select
                          className="auth-input auth-select"
                          value={authForm.role}
                          onChange={e => setAuthForm({ ...authForm, role: e.target.value })}
                        >
                          <option>Livestock Manager</option>
                          <option>Farmer</option>
                          <option>Veterinarian</option>
                          <option>Extension Worker</option>
                        </select>
                      </div>
                    </div>

                    <div className="auth-field">
                      <label className="auth-label">Organization / Farm</label>
                      <div className="auth-input-wrap">
                        <span className="auth-input-icon">🏡</span>
                        <input
                          className="auth-input"
                          type="text"
                          placeholder="Santos Cattle Farm"
                          value={authForm.organization}
                          onChange={e => setAuthForm({ ...authForm, organization: e.target.value })}
                        />
                      </div>
                    </div>

                    <button className="auth-submit-btn" type="submit" disabled={authLoading}>
                      <span>→</span>
                      {authLoading ? 'Creating Account…' : 'Create Account'}
                    </button>
                  </form>

                  <p className="auth-switch-text">
                    Already have an account?{' '}
                    <a className="auth-switch-link" onClick={() => { setIsRegisterForm(false); setAuthError(''); }}>
                      Sign in here
                    </a>
                  </p>
                </>
              )}

            </div>
          </div>

        </div>
      </div>
    );
  }


  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* SIDEBAR NAVIGATION */}
      <nav className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="logo-badge">
            <div className="logo-icon">🐄</div>
            <div>
              <div className="logo-text">PHILSAR</div>
              <span className="logo-sub">Portal</span>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">
            {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'JD'}
          </div>
          <div className="user-info">
            <div className="user-name">{currentUser?.name}</div>
            <div className="user-role">{currentUser?.role}</div>
          </div>
          <div className="online-dot"></div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Main</div>

          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('dashboard')}
          >
            <div className="nav-icon">📊</div>
            Dashboard
          </button>

          <button
            className={`nav-item ${activeTab === 'learning' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('learning')}
          >
            <div className="nav-icon">📚</div>
            Learning Modules
            <span className="nav-badge">{modules.length}</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'chatbot' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('chatbot')}
          >
            <div className="nav-icon">🤖</div>
            AI Assistant
          </button>

          <button
            className={`nav-item ${activeTab === 'dss' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('dss')}
          >
            <div className="nav-icon">🧬</div>
            Decision Support
          </button>

          <button
            className={`nav-item ${activeTab === 'meetings' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('meetings')}
          >
            <div className="nav-icon">🎥</div>
            Virtual Meetings
            <span className="nav-badge" style={{ background: '#52c41a', color: '#fff' }}>Live</span>
          </button>

          <div className="nav-section-label">Account</div>

          <button
            className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('profile')}
          >
            <div className="nav-icon">👤</div>
            My Profile
          </button>

          {currentUser?.role === 'Admin' && (
            <button
              className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
              onClick={() => handleTabNavigate('admin')}
            >
              <div className="nav-icon">⚙️</div>
              Admin Panel
            </button>
          )}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <span>🚪</span> Sign Out
          </button>
        </div>
      </nav>

      {/* MAIN CONTENT REGION */}
      <div className="main">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="md:hidden mr-3 p-2 bg-warm-white border border-border rounded-lg text-text-primary"
              style={{ display: 'none' /* Handled dynamically by CSS but React can declare */ }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu size={20} />
            </button>
            <div className="page-breadcrumb">
              Portal / <span id="breadcrumb" style={{ textTransform: 'capitalize' }}>{activeTab}</span>
            </div>
          </div>
          <div className="topbar-right">
            <div className="search-bar">
              <span>🔍</span>
              <input type="text" placeholder="Search modules, topics…" />
            </div>
            <div className="topbar-btn">
              🔔
              <div className="notif-dot"></div>
            </div>
            <div className="topbar-btn" onClick={() => handleTabNavigate('profile')}>👤</div>
          </div>
        </div>

        {/* VIEW CONDITIONAL RENDERING */}
        <div className="page-content">

          {/* ── VIEW: DASHBOARD ── */}
          {activeTab === 'dashboard' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">Good morning, {currentUser?.name?.split(' ')[0]} 👋</div>
                <div className="page-subtitle">
                  Here's what's happening with your herd today — {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>

              {/* STATS CARDS */}
              <div className="stats-grid">
                <div className="stat-card amber">
                  <div className="stat-icon">🐄</div>
                  <div className="stat-value">48</div>
                  <div className="stat-label">Total Cattle</div>
                  <div className="stat-change up">↑ 3 this month</div>
                </div>
                <div className="stat-card green">
                  <div className="stat-icon">🌿</div>
                  <div className="stat-value">12</div>
                  <div className="stat-label">Ready for Breeding</div>
                  <div className="stat-change up">↑ 2 from last week</div>
                </div>
                <div className="stat-card brown">
                  <div className="stat-icon">📖</div>
                  <div className="stat-value">{currentUser?.modulesCompleted || 0}</div>
                  <div className="stat-label">Modules Completed</div>
                  <div className="stat-change neutral">Active learner</div>
                </div>
                <div className="stat-card sage">
                  <div className="stat-icon">🎓</div>
                  <div className="stat-value">{currentUser?.seminarsAttended || 0}</div>
                  <div className="stat-label">Seminars Attended</div>
                  <div className="stat-change up">↑ {currentUser?.seminarsAttended || 0} registered</div>
                </div>
              </div>

              {/* RECENT ACTIVITY & UPCOMING SEMINARS */}
              <div className="grid-2">
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Recent DSS Assessments</div>
                    <button className="card-action" onClick={() => handleTabNavigate('dss')}>Run new</button>
                  </div>
                  <div className="card-body">
                    {assessments.length === 0 ? (
                      <div style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '20px' }}>
                        No breeding evaluations recorded yet. Run a DSS evaluation to populate this log.
                      </div>
                    ) : (
                      assessments.slice(0, 5).map(item => (
                        <div key={item.id} className="activity-item">
                          <div
                            className="activity-dot"
                            style={{ background: item.isReady ? 'var(--green-light)' : 'var(--amber)' }}
                          ></div>
                          <div>
                            <div className="activity-text">
                              DSS evaluated Cattle <strong>#{item.cattleId}</strong> (Age {item.age}, BCS {item.bcs}) as{' '}
                              <strong>{item.isReady ? 'Ready' : 'Not Ready'}</strong>. Recommended:{' '}
                              <strong>{item.recommendation}</strong>
                            </div>
                            <div className="activity-time">
                              {new Date(item.createdAt).toLocaleDateString('en-US')} @{' '}
                              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Upcoming Seminars</div>
                    <button className="card-action" onClick={() => handleTabNavigate('meetings')}>See all</button>
                  </div>
                  <div className="card-body">
                    {meetings.filter(m => m.status !== 'Ended').slice(0, 3).map(session => (
                      <div key={session.id} className="session-item" onClick={() => handleJoinMeeting(session)}>
                        <div className="session-time-block">
                          <div className="session-time">{session.dateTime.split(', ')[1] || '10:00'}</div>
                          <div className="session-date" style={{ textTransform: 'uppercase' }}>
                            {session.dateTime.split(', ')[0] || 'TODAY'}
                          </div>
                        </div>
                        <div className="session-info">
                          <div className="session-title">{session.title}</div>
                          <div className="session-host">{session.host}</div>
                        </div>
                        {session.status === 'Live' ? (
                          <div className="session-join">LIVE</div>
                        ) : (
                          <button
                            className="session-join"
                            style={{ color: 'var(--amber)', background: 'rgba(200,131,42,0.08)', border: '1px solid rgba(200,131,42,0.2)' }}
                            onClick={(e) => { e.stopPropagation(); handleRSVP(session.id); }}
                          >
                            RSVP
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* PROGRESS BAR & QUICK ACTIONS */}
              <div className="grid-3">
                <div className="card" style={{ gridColumn: 'span 2' }}>
                  <div className="card-header">
                    <div className="card-title">Learning Center Overview</div>
                    <button className="card-action" onClick={() => handleTabNavigate('learning')}>Enter Center →</button>
                  </div>
                  <div className="card-body">
                    {modules.slice(0, 4).map((mod) => {
                      const parsedLessonsList = parseLessons(mod.content);
                      const totalL = parsedLessonsList.length || 1;
                      const completedL = (completedLessonsMap[mod.id] || []).length;
                      const pct = Math.round((completedL / totalL) * 100);
                      return (
                        <div key={mod.id} className="progress-item">
                          <div className="progress-label">
                            <span className="progress-name">🐄 {mod.title}</span>
                            <span className="progress-pct">{pct}%</span>
                          </div>
                          <div className="progress-bar">
                            <div
                              className="progress-fill"
                              style={{
                                width: `${pct}%`,
                                background: pct === 100 ? 'var(--green-light)' : pct > 0 ? 'var(--amber)' : 'var(--sage)'
                              }}
                            ></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Quick Actions</div>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <button className="submit-btn" style={{ margin: 0 }} onClick={() => handleTabNavigate('dss')}>
                      🧬 Run Breeding Assessment
                    </button>
                    <button className="submit-btn" style={{ margin: 0, background: 'var(--green-mid)' }} onClick={() => handleTabNavigate('chatbot')}>
                      🤖 Ask AI Assistant
                    </button>
                    <button className="submit-btn" style={{ margin: 0, background: 'var(--amber)' }} onClick={() => handleTabNavigate('meetings')}>
                      🎥 Join Live Seminar
                    </button>
                    <button className="submit-btn" style={{ margin: 0, background: 'var(--brown-mid)' }} onClick={() => handleTabNavigate('learning')}>
                      📚 Continue Learning
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW: LEARNING CENTER ── */}
          {activeTab === 'learning' && (
            <div className="view active">
              {!selectedModule ? (
                <div id="moduleList">
                  <div className="page-header">
                    <div className="page-title">Learning Center</div>
                    <div className="page-subtitle">Structured visual courses on cattle reproductive anatomy, estrus sync protocols, and breeding techniques</div>
                  </div>

                  <div className="module-filter">
                    <div className="filter-chip active">All Topics</div>
                    <div className="filter-chip">Anatomy</div>
                    <div className="filter-chip">Physiology</div>
                    <div className="filter-chip">Breeding</div>
                    <div className="filter-chip">Pregnancy</div>
                  </div>

                  <div className="modules-grid">
                    {modules.map((mod, idx) => {
                      const icons = ['🦴', '🔄', '🧬', '🐂', '🤰', '❤️'];
                      const icon = icons[idx % icons.length];
                      const backgrounds = [
                        'linear-gradient(135deg, #E8F5E8, #B7E4C7)',
                        'linear-gradient(135deg, #FFF3E0, #FFD78A)',
                        'linear-gradient(135deg, #EDE7F6, #D1C4E9)',
                        'linear-gradient(135deg, #FBE9E7, #FFCCBC)',
                        'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
                        'linear-gradient(135deg, #FCE4EC, #F8BBD9)'
                      ];
                      const bg = backgrounds[idx % backgrounds.length];
                      const categories = ['Anatomy', 'Physiology', 'Breeding', 'Natural Mating', 'Pregnancy', 'Health'];
                      const cat = categories[idx % categories.length];

                      return (
                        <div key={mod.id} className="module-card" onClick={() => { setSelectedModule(mod); setSelectedLessonIndex(0); }}>
                          <div
                            className="module-thumb"
                            style={isValidImageUrl(mod.imageUrl) ? { backgroundImage: `url(${mod.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: bg }}
                          >
                            {!isValidImageUrl(mod.imageUrl) && icon}
                          </div>
                          <div className="module-body">
                            <div className="module-category" style={{ color: 'var(--amber)' }}>{cat}</div>
                            <div className="module-title">{mod.title}</div>
                            <div className="module-desc">{mod.description}</div>
                            <div className="module-meta">
                              {(() => {
                                const parsedLessonsList = parseLessons(mod.content);
                                const totalL = parsedLessonsList.length || 1;
                                const completedL = (completedLessonsMap[mod.id] || []).length;
                                const pct = Math.round((completedL / totalL) * 100);
                                return (
                                  <>
                                    <span className="module-lessons">{parsedLessonsList.length} lessons · {parsedLessonsList.length * 10} min</span>
                                    <div className="module-progress-mini">
                                      <div className="mini-bar">
                                        <div className="mini-fill" style={{ width: `${pct}%`, background: pct === 100 ? 'var(--green-light)' : 'var(--amber)' }}></div>
                                      </div>
                                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 700 }}>{pct}%</span>
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div id="lessonViewer" className="lesson-viewer" style={{ display: 'block' }}>
                  {(() => {
                    const parsedLessons = parseLessons(selectedModule.content);
                    const currentCompleted = completedLessonsMap[selectedModule.id] || [];
                    return (
                      <>
                        <div className="lesson-header">
                          <button className="back-btn" onClick={() => setSelectedModule(null)}>
                            ← Back to Modules
                          </button>
                        </div>
                        <div className="lesson-content-area">
                          <div className="lesson-main">
                            <div className="lesson-tag" style={{ background: 'rgba(200,131,42,0.1)', color: 'var(--amber)' }}>
                              {selectedModule.title} · Lesson {selectedLessonIndex + 1} of {parsedLessons.length}
                            </div>
                            <div className="lesson-title">{parsedLessons[selectedLessonIndex]?.title}</div>
                            <div className="lesson-text prose" style={{ marginTop: '20px' }}>
                              <ReactMarkdown>{parsedLessons[selectedLessonIndex]?.content}</ReactMarkdown>
                            </div>
                          </div>
                          <div className="lesson-sidebar">
                            <div className="lesson-toc">
                              <div className="toc-title">Module Structure</div>
                              {parsedLessons.map((lesson, idx) => {
                                const isDone = currentCompleted.includes(idx);
                                const isActive = selectedLessonIndex === idx;
                                return (
                                  <button
                                    key={idx}
                                    className={`toc-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}
                                    onClick={() => setSelectedLessonIndex(idx)}
                                  >
                                    <div className="toc-check" style={isActive ? { borderColor: 'var(--amber)' } : {}}>
                                      {isDone && '✓'}
                                    </div>
                                    <span style={{ marginLeft: '8px' }}>{lesson.title}</span>
                                  </button>
                                );
                              })}
                            </div>
                            {currentCompleted.includes(selectedLessonIndex) ? (
                              <button
                                className="submit-btn"
                                style={{ background: '#cf1322', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                onClick={() => handleUnmarkLessonComplete(selectedModule)}
                              >
                                ✕ Unmark Lesson
                              </button>
                            ) : (
                              <button
                                className="submit-btn"
                                style={{ background: 'var(--green-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                onClick={() => handleMarkLessonComplete(selectedModule)}
                              >
                                ✓ Mark Lesson as Complete
                              </button>
                            )}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── VIEW: AI ASSISTANT ── */}
          {activeTab === 'chatbot' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">AI Assistant</div>
                <div className="page-subtitle">Ask anything about cattle reproduction, AI timing, semen viability, and herd management</div>
              </div>

              <div className="chat-layout">
                <div className="chat-window">
                  <div className="chat-header">
                    <div className="ai-avatar">🤖</div>
                    <div>
                      <div className="ai-name">PHILSARBot</div>
                      <div className="ai-status">● Online — powered by Gemini 2.5</div>
                    </div>
                  </div>

                  <div className="chat-messages" id="chatMessages">
                    {chatMessages.map((msg, i) => (
                      <div key={i} className={`msg ${msg.role === 'user' ? 'user' : 'bot'}`}>
                        <div className="msg-avatar">{msg.role === 'user' ? '🧑' : '🤖'}</div>
                        <div className="msg-bubble">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    ))}

                    {isChatLoading && (
                      <div className="typing-bubble show" id="typingBubble">
                        <div className="msg-avatar" style={{ background: 'var(--green-pale)' }}>🤖</div>
                        <div className="typing-dots">
                          <div className="dot"></div><div className="dot"></div><div className="dot"></div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="chat-input-area">
                    <div className="chat-suggestions">
                      <div className="suggestion-chip" onClick={() => handleSendMessage('What are the signs of estrus in cattle?')}>Signs of estrus</div>
                      <div className="suggestion-chip" onClick={() => handleSendMessage('When is the best time to perform AI?')}>Best time for AI</div>
                      <div className="suggestion-chip" onClick={() => handleSendMessage('How do I handle and store semen?')}>Semen handling</div>
                      <div className="suggestion-chip" onClick={() => handleSendMessage('What is the average gestation period?')}>Gestation period</div>
                    </div>
                    <div className="chat-input-row">
                      <textarea
                        className="chat-input"
                        placeholder="Ask about cattle reproduction…"
                        rows={1}
                        value={inputMessage}
                        onChange={e => setInputMessage(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                      ></textarea>
                      <button className="send-btn" onClick={() => handleSendMessage()}>➤</button>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="chat-tips">
                    <div className="tips-title">Topics I Can Help With</div>
                    <div className="tip-item"><div className="tip-icon">🔄</div>Estrus cycle stages and duration</div>
                    <div className="tip-item"><div className="tip-icon">🧬</div>Artificial insemination procedures</div>
                    <div className="tip-item"><div className="tip-icon">🐂</div>Natural mating and bull management</div>
                    <div className="tip-item"><div className="tip-icon">🐄</div>Pregnancy detection and gestation</div>
                    <div className="tip-item"><div className="tip-icon">💊</div>Reproductive health and disorders</div>
                    <div className="tip-item"><div className="tip-icon">🌿</div>Nutrition for breeding cattle</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW: DECISION SUPPORT SYSTEM (DSS) ── */}
          {activeTab === 'dss' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">Decision Support System</div>
                <div className="page-subtitle">Input your cow's physiological data to receive a rule-based and AI-guided breeding recommendation</div>
              </div>

              <div className="dss-layout">
                <div className="card">
                  <div className="card-header"><div className="card-title">Cattle Breeding Data Input</div></div>
                  <div className="card-body">
                    <form onSubmit={handleDSSSubmit}>
                      <div className="form-group">
                        <label className="form-label">Cattle ID / Tag Number <span>*</span></label>
                        <input
                          className="form-control"
                          type="text"
                          placeholder="e.g., B-041"
                          value={dssForm.cattleId}
                          onChange={e => setDssForm({ ...dssForm, cattleId: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Age (years) <span>*</span></label>
                        <input
                          className="form-control"
                          type="number"
                          placeholder="e.g., 3"
                          value={dssForm.age}
                          onChange={e => setDssForm({ ...dssForm, age: e.target.value })}
                          min="1"
                          max="15"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Body Condition Score (1–9) <span>*</span></label>
                        <select
                          className="form-control"
                          value={dssForm.bcs}
                          onChange={e => setDssForm({ ...dssForm, bcs: e.target.value })}
                        >
                          <option>1 — Emaciated</option>
                          <option>2 — Very thin</option>
                          <option>3 — Thin</option>
                          <option>4 — Borderline</option>
                          <option>5 — Moderate</option>
                          <option>6 — Good</option>
                          <option>7 — Very good</option>
                          <option>8 — Fat</option>
                          <option>9 — Obese</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Days Since Last Calving <span>*</span></label>
                        <input
                          className="form-control"
                          type="number"
                          placeholder="e.g., 60"
                          value={dssForm.daysSinceCalving}
                          onChange={e => setDssForm({ ...dssForm, daysSinceCalving: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Estrus Indicators <span>*</span></label>
                        <div className="radio-group">
                          {['Standing Heat', 'Mounting Others', 'Clear Discharge', 'Swollen Vulva', 'None Observed'].map(indicator => (
                            <div
                              key={indicator}
                              className={`radio-btn ${dssForm.estrusIndicators === indicator ? 'selected' : ''}`}
                              onClick={() => setDssForm({ ...dssForm, estrusIndicators: indicator })}
                            >
                              {indicator}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Reproductive History <span>*</span></label>
                        <div className="radio-group">
                          {['Successful Previous Calving', 'First Breeding', 'History of Infertility'].map(hist => (
                            <div
                              key={hist}
                              className={`radio-btn ${dssForm.history === hist ? 'selected' : ''}`}
                              onClick={() => setDssForm({ ...dssForm, history: hist })}
                            >
                              {hist}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Current Health Status <span>*</span></label>
                        <select
                          className="form-control"
                          value={dssForm.healthStatus}
                          onChange={e => setDssForm({ ...dssForm, healthStatus: e.target.value })}
                        >
                          <option>Healthy — no issues</option>
                          <option>Minor health issue — treated</option>
                          <option>Recovering from illness</option>
                          <option>Ongoing medical condition — untreated</option>
                        </select>
                      </div>
                      <button className="submit-btn" type="submit">🧬 Evaluate Breeding Readiness</button>
                    </form>
                  </div>
                </div>

                <div className="result-panel">
                  {!dssResult ? (
                    <div id="resultEmpty" className="result-empty">
                      <div className="result-empty-icon">🔬</div>
                      <div className="result-empty-text">
                        Fill in the cattle data on the left and click <strong>Evaluate</strong> to receive a breeding readiness assessment.
                      </div>
                    </div>
                  ) : (
                    <div id="resultVerdict" className="result-verdict show">
                      <div className="card-title" style={{ marginBottom: '16px' }}>Assessment Results</div>

                      <div className={`verdict-badge ${dssResult.isReady ? 'ready' : 'not-ready'}`}>
                        {dssResult.isReady ? '✅ Ready for Breeding' : '⚠️ Postpone Breeding Recommended'}
                      </div>

                      <div className="verdict-method">
                        <div className="verdict-method-label">Recommended Technique</div>
                        <div className="verdict-method-name">{dssResult.recommendation}</div>
                        <div className="verdict-method-desc">
                          Computed using standard voluntary waiting period (VWP) and physiological readiness constraints.
                        </div>
                      </div>

                      <div style={{ marginBottom: '16px' }}>
                        <div className="toc-title" style={{ marginBottom: '12px' }}>Evaluation Checklist</div>
                        <ul className="criteria-list">
                          <li className="criteria-item">
                            <div className="criteria-icon">{parseInt(dssForm.age) >= 2 && parseInt(dssForm.age) <= 8 ? '✅' : '❌'}</div>
                            Age is within optimal breeding parameters (2–8 years)
                          </li>
                          <li className="criteria-item">
                            <div className="criteria-icon">{parseInt(dssForm.bcs.split(' ')[0]) >= 4 && parseInt(dssForm.bcs.split(' ')[0]) <= 7 ? '✅' : '❌'}</div>
                            Body condition score (BCS) indicates reproductive readiness (BCS 4-7)
                          </li>
                          <li className="criteria-item">
                            <div className="criteria-icon">{dssForm.estrusIndicators !== 'None Observed' ? '✅' : '❌'}</div>
                            Estrus / heat signs successfully observed
                          </li>
                          <li className="criteria-item">
                            <div className="criteria-icon">{parseInt(dssForm.daysSinceCalving) >= 45 ? '✅' : '❌'}</div>
                            Voluntary waiting period (VWP) is sufficient ( &gt;= 45 days)
                          </li>
                          <li className="criteria-item">
                            <div className="criteria-icon">{!dssForm.healthStatus.includes('Ongoing') ? '✅' : '❌'}</div>
                            Clear of untreated ongoing reproductive or general health conditions
                          </li>
                        </ul>
                      </div>

                      <div style={{ background: 'rgba(200,131,42,0.07)', border: '1px solid rgba(200,131,42,0.2)', borderRadius: '8px', padding: '14px' }}>
                        <div className="toc-title" style={{ marginBottom: '8px' }}>AI-Generated Breeding Guidance</div>
                        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                          {dssResult.guidance}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW: VIRTUAL MEETINGS ── */}
          {activeTab === 'meetings' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">Virtual Meetings & Seminars</div>
                <div className="page-subtitle">Join live webcasts and interactive lessons hosted by PHILSAR reproduction experts</div>
              </div>

              <div className="meetings-layout">
                <div>
                  {meetings.find(m => m.status === 'Live') ? (
                    meetings.filter(m => m.status === 'Live').map(liveMeeting => (
                      <div key={liveMeeting.id} className="meeting-hero">
                        <div className="meeting-hero-label">🔴 Live Now</div>
                        <div className="meeting-hero-title">{liveMeeting.title}</div>
                        <div className="meeting-hero-desc">
                          Hosted by <strong>{liveMeeting.host}</strong>. Join the live stream via our embedded video modal powered by Jitsi.
                        </div>
                        <button className="join-hero-btn" onClick={() => handleJoinMeeting(liveMeeting)}>
                          🎥 Join Live Stream
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="meeting-hero" style={{ background: 'linear-gradient(135deg, var(--brown-dark), var(--brown-mid))' }}>
                      <div className="meeting-hero-label">Seminars</div>
                      <div className="meeting-hero-title">No Seminars Live Right Now</div>
                      <div className="meeting-hero-desc">
                        Register for the upcoming synchronization and thawing seminars listed below.
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <div className="card-title">All Sessions</div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div className="filter-chip active" style={{ fontSize: '12px', padding: '5px 12px' }}>All</div>
                      <div className="filter-chip" style={{ fontSize: '12px', padding: '5px 12px' }}>Upcoming</div>
                      <div className="filter-chip" style={{ fontSize: '12px', padding: '5px 12px' }}>Recorded</div>
                    </div>
                  </div>

                  {meetings.map(session => (
                    <div key={session.id} className="meeting-card" onClick={() => handleJoinMeeting(session)}>
                      <div className={`meeting-status-dot ${session.status.toLowerCase()}`}></div>
                      <div className="meeting-info">
                        <div className="meeting-name">{session.title}</div>
                        <div className="meeting-meta">
                          {session.host} · {session.dateTime} · {session.registrants} registered
                        </div>
                      </div>
                      {session.status === 'Live' ? (
                        <button className="meeting-action live">Join Live</button>
                      ) : session.status === 'Upcoming' ? (
                        <button
                          className="meeting-action upcoming"
                          onClick={(e) => { e.stopPropagation(); handleRSVP(session.id); }}
                        >
                          RSVP
                        </button>
                      ) : (
                        <button className="meeting-action ended">Watch Replay</button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card">
                    <div className="card-header"><div className="card-title">Meeting Info</div></div>
                    <div className="card-body">
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '16px' }}>
                        All webinars are hosted via <strong>Jitsi Meet</strong>, a secure open-source conferencing system. No downloads or accounts are necessary to join.
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
                        <div>📷 High-definition audio/video</div>
                        <div>💬 Real-time chat & Q&A boards</div>
                        <div>📱 Accessible on phone, tablet & PC</div>
                        <div>🔒 Completely encrypted streams</div>
                      </div>
                    </div>
                  </div>

                  <div className="card">
                    <div className="card-header"><div className="card-title">My Registered Sessions</div></div>
                    <div className="card-body">
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '10px 0' }}>
                        You are registered for <strong style={{ color: 'var(--text-primary)' }}>{meetings.filter(m => m.status === 'Upcoming').length} upcoming</strong> webinars this period.
                      </div>
                      {meetings.filter(m => m.status === 'Upcoming').map(upcoming => (
                        <div
                          key={upcoming.id}
                          style={{
                            background: 'var(--cream)',
                            borderRadius: '8px',
                            padding: '12px',
                            marginBottom: '8px'
                          }}
                        >
                          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--amber)' }}>
                            {upcoming.dateTime}
                          </div>
                          <div style={{ fontSize: '13px', color: 'var(--text-primary)', marginTop: '2px', fontWeight: 600 }}>
                            {upcoming.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW: MY PROFILE ── */}
          {activeTab === 'profile' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">My Profile</div>
              </div>

              <div className="profile-hero">
                <div className="profile-avatar-lg">
                  {currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'JD'}
                </div>
                <div>
                  <div className="profile-name">{currentUser?.name}</div>
                  <div className="profile-email">{currentUser?.email}</div>
                  <div className="profile-role-badge">{currentUser?.role}</div>
                </div>
              </div>

              <div className="grid-2">
                <div className="card">
                  <div className="card-header"><div className="card-title">Profile Information</div></div>
                  <div className="card-body">
                    <form onSubmit={handleProfileSubmit}>
                      <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                          className="form-control"
                          type="text"
                          value={profileForm.name}
                          onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <input
                          className="form-control"
                          type="email"
                          value={profileForm.email}
                          onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Organization / Farm Address</label>
                        <input
                          className="form-control"
                          type="text"
                          value={profileForm.organization}
                          onChange={e => setProfileForm({ ...profileForm, organization: e.target.value })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <select
                          className="form-control"
                          value={profileForm.role}
                          onChange={e => setProfileForm({ ...profileForm, role: e.target.value as any })}
                        >
                          <option>Livestock Manager</option>
                          <option>Farmer</option>
                          <option>Veterinarian</option>
                          <option>Extension Worker</option>
                          {currentUser?.role === 'Admin' && <option>Admin</option>}
                        </select>
                      </div>

                      <div style={{ borderTop: '1px solid var(--border)', marginTop: '24px', paddingTop: '20px' }}>
                        <div className="toc-title" style={{ marginBottom: '14px' }}>Change Password</div>
                        <div className="form-group">
                          <label className="form-label">Current Password</label>
                          <input
                            className="form-control"
                            type="password"
                            placeholder="••••••••"
                            value={profileForm.currentPassword}
                            onChange={e => setProfileForm({ ...profileForm, currentPassword: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">New Password</label>
                          <input
                            className="form-control"
                            type="password"
                            placeholder="••••••••"
                            value={profileForm.password}
                            onChange={e => setProfileForm({ ...profileForm, password: e.target.value })}
                          />
                        </div>
                      </div>

                      <button className="submit-btn" style={{ width: 'auto', padding: '12px 28px' }} type="submit">
                        Save Changes
                      </button>
                    </form>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="card">
                    <div className="card-header"><div className="card-title">Learning Summary</div></div>
                    <div className="card-body">
                      <div className="progress-item">
                        <div className="progress-label">
                          <span className="progress-name">Modules Completed</span>
                          <span className="progress-pct">{currentUser?.modulesCompleted || 0} / {modules.length}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${((currentUser?.modulesCompleted || 0) / Math.max(modules.length, 1)) * 100}%`,
                              background: 'var(--green-light)'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div className="progress-item">
                        <div className="progress-label">
                          <span className="progress-name">Seminars Attended</span>
                          <span className="progress-pct">{currentUser?.seminarsAttended || 0}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min((currentUser?.seminarsAttended || 0) * 10, 100)}%`,
                              background: 'var(--amber)'
                            }}
                          ></div>
                        </div>
                      </div>
                      <div className="progress-item">
                        <div className="progress-label">
                          <span className="progress-name">DSS Assessments Run</span>
                          <span className="progress-pct">{currentUser?.dssAssessmentsRun || 0}</span>
                        </div>
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{
                              width: `${Math.min((currentUser?.dssAssessmentsRun || 0) * 8, 100)}%`,
                              background: 'var(--sage)'
                            }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── VIEW: ADMIN PANEL ── */}
          {activeTab === 'admin' && currentUser?.role === 'Admin' && (
            <div className="view active">
              <div className="page-header">
                <div className="page-title">Administrator Panel</div>
                <div className="page-subtitle">Manage portal users, educational modules, scheduled webcasts, and system parameters</div>
              </div>

              {/* ADMIN INTERNAL TABS */}
              <div className="admin-tabs">
                <button
                  className={`admin-tab ${activeAdminTab === 'users' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('users')}
                >
                  👥 Users
                </button>
                <button
                  className={`admin-tab ${activeAdminTab === 'modules' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('modules')}
                >
                  📚 Modules
                </button>
                <button
                  className={`admin-tab ${activeAdminTab === 'meetings' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('meetings')}
                >
                  🎥 Meetings
                </button>
                <button
                  className={`admin-tab ${activeAdminTab === 'settings' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('settings')}
                >
                  ⚙️ Settings
                </button>
              </div>

              {/* TAB CONTENT: USERS */}
              {activeAdminTab === 'users' && (
                <div id="admin-users">
                  <div className="admin-header-row">
                    <div className="card-title">Registered Portal Accounts</div>
                  </div>
                  <div className="grid-2">
                    <div className="card" style={{ height: 'fit-content' }}>
                      <div className="card-header"><div className="card-title">Add New User Account</div></div>
                      <div className="card-body">
                        <form onSubmit={handleAddUser}>
                          <div className="form-group">
                            <label className="form-label">Full Name</label>
                            <input
                              className="form-control"
                              type="text"
                              value={newUserForm.name}
                              onChange={e => setNewUserForm({ ...newUserForm, name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Email Address</label>
                            <input
                              className="form-control"
                              type="email"
                              value={newUserForm.email}
                              onChange={e => setNewUserForm({ ...newUserForm, email: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Password</label>
                            <input
                              className="form-control"
                              type="password"
                              value={newUserForm.password}
                              onChange={e => setNewUserForm({ ...newUserForm, password: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Role</label>
                            <select
                              className="form-control"
                              value={newUserForm.role}
                              onChange={e => setNewUserForm({ ...newUserForm, role: e.target.value })}
                            >
                              <option>Livestock Manager</option>
                              <option>Farmer</option>
                              <option>Veterinarian</option>
                              <option>Extension Worker</option>
                              <option>Admin</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="form-label">Farm / Organization</label>
                            <input
                              className="form-control"
                              type="text"
                              value={newUserForm.organization}
                              onChange={e => setNewUserForm({ ...newUserForm, organization: e.target.value })}
                            />
                          </div>
                          <button className="submit-btn" type="submit">+ Save Account</button>
                        </form>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-body data-table-wrapper">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>User</th>
                              <th>Role</th>
                              <th>Vials Run</th>
                              <th>Status</th>
                              <th>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {allUsers.map(u => (
                              <tr key={u.id}>
                                <td>
                                  <div className="user-chip">
                                    <div className="chip-avatar" style={{ background: 'var(--green-mid)' }}>
                                      {u.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()}
                                    </div>
                                    <div>
                                      <div style={{ fontWeight: 600 }}>{u.name}</div>
                                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{u.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td>{u.role}</td>
                                <td>{u.dssAssessmentsRun} run</td>
                                <td>
                                  <span className={`status-pill ${u.status === 'Active' ? 'active' : 'inactive'}`}>
                                    {u.status}
                                  </span>
                                </td>
                                <td>
                                  <button className="table-action" onClick={() => handleDeleteUser(u.id)}>
                                    <Trash size={14} style={{ color: '#cf1322' }} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: MODULES */}
              {activeAdminTab === 'modules' && (
                <div id="admin-modules">
                  <div className="grid-2">
                    <div className="card" style={{ height: 'fit-content' }}>
                      <div className="card-header">
                        <div className="card-title">
                          {editingModule ? `Edit Module: ${editingModule.title}` : 'Add Educational Module'}
                        </div>
                      </div>
                      <div className="card-body">
                        <form onSubmit={handleAddModule}>
                          <div className="form-group">
                            <label className="form-label">Module Title</label>
                            <input
                              className="form-control"
                              type="text"
                              value={newModuleForm.title}
                              onChange={e => setNewModuleForm({ ...newModuleForm, title: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Description</label>
                            <input
                              className="form-control"
                              type="text"
                              value={newModuleForm.description}
                              onChange={e => setNewModuleForm({ ...newModuleForm, description: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Cover Image</label>

                            {/* Hidden file input */}
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={handleFileChange}
                            />

                            {/* Drag & Drop / Click Zone */}
                            {!newModuleForm.imageUrl && !uploadingImage && (
                              <div
                                className={`upload-zone ${isDragOver ? 'dragover' : ''}`}
                                onClick={() => fileInputRef.current?.click()}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                              >
                                <div className="upload-zone-icon">
                                  <Upload size={28} />
                                </div>
                                <div className="upload-zone-text">
                                  Drag & drop an image, or <span style={{ color: 'var(--amber)', textDecoration: 'underline', cursor: 'pointer' }}>browse files</span>
                                </div>
                                <div className="upload-zone-subtext">PNG, JPG, JPEG, WEBP, GIF — max 5 MB</div>
                              </div>
                            )}

                            {/* Loading Spinner */}
                            {uploadingImage && (
                              <div className="upload-zone" style={{ cursor: 'default', pointerEvents: 'none' }}>
                                <Loader2 size={28} className="animate-spin" style={{ color: 'var(--amber)' }} />
                                <div className="upload-zone-text">Uploading image…</div>
                              </div>
                            )}

                            {/* Preview after upload */}
                            {newModuleForm.imageUrl && !uploadingImage && (
                              <div className="upload-preview-container">
                                <img
                                  src={newModuleForm.imageUrl}
                                  alt="Cover preview"
                                  className="upload-preview-img"
                                  onError={e => { (e.target as HTMLImageElement).src = 'https://placehold.co/60x60/F5F0E8/8B5E3C?text=IMG'; }}
                                />
                                <div className="upload-preview-info">
                                  <div className="upload-preview-name">
                                    {newModuleForm.imageUrl.startsWith('http://localhost')
                                      ? newModuleForm.imageUrl.split('/').pop()
                                      : newModuleForm.imageUrl.length > 50
                                        ? newModuleForm.imageUrl.substring(0, 47) + '…'
                                        : newModuleForm.imageUrl}
                                  </div>
                                  <div className="upload-preview-size" style={{ color: 'var(--green-mid)', fontWeight: 600 }}>✓ Image ready</div>
                                </div>
                                <button
                                  type="button"
                                  className="upload-preview-remove"
                                  title="Remove image"
                                  onClick={() => {
                                    setNewModuleForm(prev => ({ ...prev, imageUrl: '' }));
                                    if (fileInputRef.current) fileInputRef.current.value = '';
                                  }}
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            )}

                          </div>
                          <div className="form-group">
                            <label className="form-label">Content (Markdown format supported)</label>

                            {/* Hidden file input for content images */}
                            <input
                              ref={contentFileInputRef}
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={handleContentFileChange}
                            />

                            {/* Content Editor Toolbar */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '8px 12px',
                              background: 'var(--cream)',
                              border: '1px solid var(--border)',
                              borderBottom: 'none',
                              borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0',
                              marginTop: '6px'
                            }}>
                              <button
                                type="button"
                                disabled={uploadingContentImage}
                                onClick={() => contentFileInputRef.current?.click()}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  padding: '5px 12px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  fontFamily: 'inherit',
                                  color: uploadingContentImage ? 'var(--text-muted)' : 'var(--brown-mid)',
                                  background: uploadingContentImage ? 'rgba(0,0,0,0.04)' : 'var(--warm-white)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '6px',
                                  cursor: uploadingContentImage ? 'not-allowed' : 'pointer',
                                  transition: 'all 0.2s'
                                }}
                              >
                                {uploadingContentImage ? (
                                  <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                                ) : (
                                  <><Upload size={14} /> Insert Image</>
                                )}
                              </button>
                              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Images appear as Markdown in content
                              </span>
                            </div>

                            <textarea
                              ref={contentTextareaRef}
                              className="form-control"
                              style={{
                                minHeight: '180px',
                                borderTopLeftRadius: 0,
                                borderTopRightRadius: 0,
                                borderTop: 'none'
                              }}
                              value={newModuleForm.content}
                              onChange={e => setNewModuleForm({ ...newModuleForm, content: e.target.value })}
                              required
                            ></textarea>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="submit-btn" style={{ flex: 1 }} type="submit">
                              {editingModule ? 'Save Changes' : '+ Create Module'}
                            </button>
                            {editingModule && (
                              <button
                                className="submit-btn"
                                style={{ flex: 1, background: 'var(--text-muted)' }}
                                type="button"
                                onClick={() => {
                                  setEditingModule(null);
                                  setNewModuleForm({ title: '', description: '', content: '', imageUrl: '' });
                                }}
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </form>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-body data-table-wrapper">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Module Name</th>
                              <th>Description</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {modules.map(m => (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 600 }}>{m.title}</td>
                                <td style={{ fontSize: '13px' }}>{m.description}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      className="table-action"
                                      onClick={() => {
                                        setEditingModule(m);
                                        setNewModuleForm({
                                          title: m.title,
                                          description: m.description || '',
                                          content: m.content,
                                          imageUrl: m.imageUrl || ''
                                        });
                                      }}
                                    >
                                      Edit
                                    </button>
                                    <button
                                      className="table-action"
                                      onClick={() => handleDeleteModule(m.id)}
                                    >
                                      <Trash size={14} style={{ color: '#cf1322' }} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: MEETINGS */}
              {activeAdminTab === 'meetings' && (
                <div id="admin-meetings">
                  <div className="grid-2">
                    <div className="card" style={{ height: 'fit-content' }}>
                      <div className="card-header"><div className="card-title">Schedule Virtual Seminar</div></div>
                      <div className="card-body">
                        <form onSubmit={handleAddMeeting}>
                          <div className="form-group">
                            <label className="form-label">Seminar Title</label>
                            <input
                              className="form-control"
                              type="text"
                              value={newMeetingForm.title}
                              onChange={e => setNewMeetingForm({ ...newMeetingForm, title: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Expert Host Name</label>
                            <input
                              className="form-control"
                              type="text"
                              placeholder="e.g., Dr. Reyes"
                              value={newMeetingForm.host}
                              onChange={e => setNewMeetingForm({ ...newMeetingForm, host: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Date & Time</label>
                            <input
                              className="form-control"
                              type="text"
                              placeholder="e.g., May 28, 2:00 PM"
                              value={newMeetingForm.dateTime}
                              onChange={e => setNewMeetingForm({ ...newMeetingForm, dateTime: e.target.value })}
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Video Conference Link</label>
                            <input
                              className="form-control"
                              type="text"
                              placeholder="https://meet.jit.si/..."
                              value={newMeetingForm.videoLink}
                              onChange={e => setNewMeetingForm({ ...newMeetingForm, videoLink: e.target.value })}
                            />
                          </div>
                          <button className="submit-btn" type="submit">+ Schedule Seminar</button>
                        </form>
                      </div>
                    </div>

                    <div className="card">
                      <div className="card-body data-table-wrapper">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Meeting Title</th>
                              <th>Host</th>
                              <th>Scheduled</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {meetings.map(m => (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 600 }}>{m.title}</td>
                                <td>{m.host.split(' · ')[0]}</td>
                                <td>{m.dateTime}</td>
                                <td>
                                  <span className={`status-pill ${m.status === 'Live' ? 'active' : 'inactive'}`}>
                                    {m.status}
                                  </span>
                                </td>
                                <td>
                                  <button className="table-action" onClick={() => handleDeleteMeeting(m.id)}>
                                    <Trash size={14} style={{ color: '#cf1322' }} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT: SETTINGS */}
              {activeAdminTab === 'settings' && (
                <div id="admin-settings">
                  <div className="card">
                    <div className="card-header"><div className="card-title">System Settings</div></div>
                    <div className="card-body">
                      <form onSubmit={handleUpdateSettings}>
                        <div className="form-group">
                          <label className="form-label">Portal Application Title</label>
                          <input
                            className="form-control"
                            type="text"
                            value={settings.portalName}
                            onChange={e => setSettings({ ...settings, portalName: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">AI Service Integration Provider</label>
                          <select
                            className="form-control"
                            value={settings.aiProvider}
                            onChange={e => setSettings({ ...settings, aiProvider: e.target.value })}
                          >
                            <option>Gemini API (Google)</option>
                            <option>Claude API (Anthropic)</option>
                            <option>OpenAI GPT Integration</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Video Teleconference Service</label>
                          <select
                            className="form-control"
                            value={settings.videoProvider}
                            onChange={e => setSettings({ ...settings, videoProvider: e.target.value })}
                          >
                            <option>Jitsi Meet (Open Source)</option>
                            <option>Zoom Video SDK</option>
                            <option>Google Meet Integration</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">DSS Algorithm Revision Version</label>
                          <select
                            className="form-control"
                            value={settings.dssVersion}
                            onChange={e => setSettings({ ...settings, dssVersion: e.target.value })}
                          >
                            <option>v2.1 — AI-Assisted Rule-Based</option>
                            <option>v1.0 — Rule-Based Only</option>
                          </select>
                        </div>
                        <button type="submit" className="btn btn-primary" style={{ marginTop: '8px' }}>Save Settings</button>
                      </form>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

      {/* 🎥 JITSI MEET MODAL PLAYER */}
      {meetingModalOpen && activeMeeting && (
        <div
          id="meetingModal"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            boxSizing: 'border-box'
          }}
          onClick={() => setMeetingModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--brown-dark, #2b1d16)',
              width: '900px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 10px 10px -5px rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              flexDirection: 'column'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.15)' }}>
              <div style={{ color: 'var(--cream, #f5f0e8)', fontWeight: 600, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#ff4d4f', fontSize: '12px' }}>🔴</span> {activeMeeting.title}
              </div>
              <button
                onClick={() => setMeetingModalOpen(false)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: 'none',
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: '18px',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                }}
              >
                ×
              </button>
            </div>
            <div style={{ background: '#111', height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              {activeMeeting.status === 'Ended' ? (
                <>
                  <div style={{ fontSize: '60px' }}>📼</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: 500, textAlign: 'center', maxWidth: '380px' }}>
                    No recording file is stored for this session yet.
                    <br />You can reopen the session room to review it — camera &amp; mic start muted.
                  </div>
                  <a
                    href={`${activeMeeting.videoLink}#config.startWithAudioMuted=true&config.startWithVideoMuted=true`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: '10px 24px',
                      background: 'var(--amber)',
                      borderRadius: '8px',
                      color: 'var(--brown-dark)',
                      textDecoration: 'none',
                      fontWeight: 700,
                      fontSize: '14px'
                    }}
                  >
                    Reopen Session Room (Muted)
                  </a>
                </>
              ) : (
                <div id="jaas-container" style={{ width: '100%', height: '100%' }}></div>
              )}
            </div>
            {activeMeeting.status !== 'Ended' && (
              <div style={{ padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.1)' }}>
                <button
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleAudio')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  🎙️ Toggle Mic
                </button>
                <button
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleVideo')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  📷 Toggle Camera
                </button>
                <button
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleChat')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  💬 Toggle Chat
                </button>
                <button
                  onClick={() => setMeetingModalOpen(false)}
                  style={{ padding: '8px 20px', background: '#cf1322', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                >
                  Leave Meeting
                </button>
              </div>
            )}
            {activeMeeting.status === 'Ended' && (
              <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'center', background: 'rgba(0,0,0,0.1)' }}>
                <button
                  onClick={() => setMeetingModalOpen(false)}
                  style={{ padding: '8px 20px', background: '#cf1322', border: 'none', borderRadius: '8px', color: 'white', cursor: 'pointer', fontWeight: 700, fontSize: '13px' }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  </div>
</div>
  );
}
