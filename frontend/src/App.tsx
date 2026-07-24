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
  Upload,
  Award,
  Pencil,
  Ban,
  UserCheck
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import Swal from 'sweetalert2';
import philsarLogo from './assets/logo-transparent.png';

// Interfaces mapping database entities
interface User {
  id: number;
  name: string;
  email: string;
  role: 'Livestock Manager' | 'Farmer' | 'Veterinarian' | 'Extension Worker' | 'Admin';
  organization: string;
  status: 'Active' | 'Inactive';
  profilePicture?: string;
  modulesCompleted: number;
  seminarsAttended: number;
  dssAssessmentsRun: number;
  token?: string;
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
  minutes: string;
  recordingUrl: string;
}

interface LandingImage {
  id: number;
  imageUrl: string;
}

interface Announcement {
  id: number;
  title: string;
  body: string;
  imageUrl: string | null;
}

interface CattleRecord {
  id: number;
  tagId: string;
  breed: string | null;
  notes: string | null;
  isReady: boolean | null;
  lastAssessedAt: string | null;
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
  certTitleText: string;
  certBodyText: string;
  certClosingText: string;
  certPrimaryColor: string;
  certAccentColor: string;
  certBackgroundImage: string;
}

function isValidImageUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed || /[\s{}();]/.test(trimmed)) return false;
  return /^(https?:\/\/|\/uploads\/|data:image\/)/.test(trimmed);
}

// jsPDF's color setters take separate r/g/b numbers, not CSS hex strings
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
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

type Tab = 'home' | 'dashboard' | 'learning' | 'chatbot' | 'dss' | 'meetings' | 'profile' | 'admin';
const VALID_TABS: Tab[] = ['home', 'dashboard', 'learning', 'chatbot', 'dss', 'meetings', 'profile', 'admin'];

function tabFromPath(pathname: string): Tab {
  const path = pathname.replace(/^\//, '');
  return (VALID_TABS as string[]).includes(path) ? (path as Tab) : 'home';
}

const CHAT_GREETING: { role: 'assistant'; content: string } = {
  role: 'assistant',
  content: 'Hello! I am **PHILSARBot**, your AI assistant for cattle reproductive management. I can help you understand estrus cycles, AI procedures, breeding techniques, and more. What would you like to know today?'
};

// Themed replacement for window.confirm() on destructive actions — styled to match
// the portal's Royal Blue theme instead of the browser's default confirm dialog.
const confirmDelete = (text: string, title = 'Are you sure?', confirmButtonText = 'Yes, delete it'): Promise<boolean> => {
  return Swal.fire({
    title,
    text,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText: 'Cancel',
    confirmButtonColor: '#305CDE',
    cancelButtonColor: '#6B7590',
    reverseButtons: true,
    customClass: {
      popup: 'swal-philsar-popup',
      title: 'swal-philsar-title',
      htmlContainer: 'swal-philsar-text'
    }
  }).then(result => result.isConfirmed);
};

// Themed replacement for window.alert() — a non-blocking toast instead of a
// dialog the user must click OK to dismiss, styled to match the portal's theme.
type ToastType = 'success' | 'error' | 'warning' | 'info';
const showToast = (text: string, icon: ToastType = 'info') => {
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title: text,
    showConfirmButton: false,
    timer: 4000,
    timerProgressBar: true,
    customClass: {
      popup: 'swal-philsar-toast'
    }
  });
};

export default function App() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<Tab>(() => tabFromPath(window.location.pathname));
  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'modules' | 'meetings' | 'home' | 'settings'>('users');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLessonIndex, setSelectedLessonIndex] = useState<number>(0);
  const [completedLessonsMap, setCompletedLessonsMap] = useState<Record<number, number[]>>({});
  const [meetingModalOpen, setMeetingModalOpen] = useState(false);
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null);
  const [minutesDraft, setMinutesDraft] = useState('');
  const [savingMinutes, setSavingMinutes] = useState(false);

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Dynamic Data States
  const [modules, setModules] = useState<LearningModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<LearningModule | null>(null);
  const [editingModule, setEditingModule] = useState<LearningModule | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [landingImages, setLandingImages] = useState<LandingImage[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [myAttendance, setMyAttendance] = useState<Record<number, { secondsAttended: number; eligible: boolean; rsvped: boolean }>>({});
  const attendanceIntervalRef = useRef<number | null>(null);
  const logoImgRef = useRef<HTMLImageElement | null>(null);
  const certBgImgRef = useRef<HTMLImageElement | null>(null);
  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certModalMeeting, setCertModalMeeting] = useState<Meeting | null>(null);
  const [certAttendanceRows, setCertAttendanceRows] = useState<Record<number, { secondsAttended: number; eligible: boolean; granted: boolean }>>({});
  const [cattleModalOpen, setCattleModalOpen] = useState(false);
  const [cattleList, setCattleList] = useState<CattleRecord[]>([]);
  const [newCattleForm, setNewCattleForm] = useState({ tagId: '', breed: '', notes: '' });
  const [editingCattleId, setEditingCattleId] = useState<number | null>(null);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [herdStats, setHerdStats] = useState({ totalCattle: 0, readyForBreeding: 0, newThisMonth: 0 });
  const [settings, setSettings] = useState<SystemSettings>({
    portalName: 'PHILSAR — Cattle Reproductive Management Portal',
    aiProvider: 'Gemini API (Google)',
    videoProvider: 'Jitsi Meet (Open Source)',
    dssVersion: 'v2.1 — AI-Assisted Rule-Based',
    certTitleText: 'Certificate of Attendance',
    certBodyText: 'has successfully attended the virtual seminar',
    certClosingText: 'PHILSAR Cattle Reproductive Portal',
    certPrimaryColor: '#305CDE',
    certAccentColor: '#7B93E0',
    certBackgroundImage: ''
  });

  // Auth Forms State
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authView, setAuthView] = useState<'login' | 'register' | 'forgot' | 'reset'>(() =>
    window.location.pathname === '/reset-password' && new URLSearchParams(window.location.search).get('token')
      ? 'reset'
      : 'login'
  );
  const [resetToken] = useState(() => new URLSearchParams(window.location.search).get('token') || '');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitted, setForgotSubmitted] = useState(false);
  const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirmPassword: '' });
  const [resetSuccess, setResetSuccess] = useState(false);

  // Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    organization: '',
    role: 'Farmer',
    password: '',
    currentPassword: ''
  });

  // Profile Avatar Upload State
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Certificate Background Upload State
  const [uploadingCertBg, setUploadingCertBg] = useState(false);
  const certBgFileInputRef = useRef<HTMLInputElement>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([CHAT_GREETING]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // DSS State
  const [dssForm, setDssForm] = useState({
    cattleId: '',
    age: '',
    bcs: '5 — Moderate',
    daysSinceCalving: '',
    estrusIndicators: ['Standing Heat'] as string[],
    history: 'Successful Previous Calving',
    healthStatus: 'Healthy — no issues'
  });
  const [dssResult, setDssResult] = useState<Assessment | null>(null);
  const [dssLoading, setDssLoading] = useState(false);

  // Admin Operations State
  const [newUserForm, setNewUserForm] = useState({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
  const [newModuleForm, setNewModuleForm] = useState({ title: '', description: '', content: '', imageUrl: '' });
  const [newMeetingForm, setNewMeetingForm] = useState({ title: '', host: '', dateTime: '', status: 'Upcoming' as any, videoLink: '', recordingUrl: '' });
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [savingUser, setSavingUser] = useState(false);
  const [savingModule, setSavingModule] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Image Uploading States for Admin Panel Modules
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Content Image Upload States
  const [uploadingContentImage, setUploadingContentImage] = useState(false);
  const contentFileInputRef = useRef<HTMLInputElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Landing Page Background Image Upload State
  const [uploadingLandingImage, setUploadingLandingImage] = useState(false);
  const landingFileInputRef = useRef<HTMLInputElement>(null);

  // Announcement Form + Image Upload State
  const [newAnnouncementForm, setNewAnnouncementForm] = useState({ title: '', body: '', imageUrl: '' });
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<number | null>(null);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [uploadingAnnouncementImage, setUploadingAnnouncementImage] = useState(false);
  const announcementFileInputRef = useRef<HTMLInputElement>(null);

  // Loaders
  const [dataLoading, setDataLoading] = useState(false);

  // VITE_API_BASE overrides when set (e.g. a separately-hosted frontend). Otherwise:
  // local dev talks to the backend on its own port; a production build defaults to a
  // relative path, which is correct when the backend serves this same build (combined
  // Railway deploy) since everything is then same-origin.
  const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

  // Core Hooks & Effects
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, isChatLoading]);

  // Persist the chatbot conversation per-user so it survives page refreshes and
  // tab navigation — cleared explicitly on logout (see handleLogout) rather than
  // here, so it doesn't get wiped just because currentUser hasn't hydrated yet
  // on a fresh page load.
  useEffect(() => {
    if (!currentUser?.id) return;
    localStorage.setItem(`philsar_chat_${currentUser.id}`, JSON.stringify(chatMessages));
  }, [chatMessages, currentUser?.id]);

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
              startWithVideoMuted: true,
              // JaaS's default embed toolbar omits fullscreen — spell it out explicitly
              // alongside the rest of the standard toolbar to bring it back. 'recording'
              // is JaaS-native (unlike the free public meet.jit.si server); whether it
              // actually works depends on the 8x8 account's plan. Recording rights
              // default to the meeting's moderator (usually whoever joins first).
              toolbarButtons: [
                'microphone', 'camera', 'desktop', 'fullscreen', 'fodeviceselection',
                'hangup', 'chat', 'raisehand', 'tileview', 'settings', 'videoquality',
                'recording'
              ]
            }
          });

          // Track cumulative seminar attendance so a 30-minute certificate can be issued.
          // Reports real elapsed wall-clock time since the last *successful* ping rather
          // than assuming exactly 30s always passed — a dropped ping, delayed timer tick,
          // or brief reconnect no longer permanently undercounts, since the next
          // successful ping just reports the full real gap and catches up.
          const meetingId = activeMeeting.id;
          const userId = currentUser?.id;
          let lastPingAt = Date.now();
          const sendHeartbeat = () => {
            if (!userId) return;
            const now = Date.now();
            const elapsedSeconds = Math.round((now - lastPingAt) / 1000);
            axios.post(`${API_BASE}/meetings/${meetingId}/attendance/ping`, { userId, elapsedSeconds })
              .then(res => {
                lastPingAt = now;
                setMyAttendance(prev => ({ ...prev, [meetingId]: res.data }));
                // The host ending the seminar doesn't push to already-connected
                // participants — this heartbeat is the only channel checking back in,
                // so it doubles as the signal to disconnect everyone still in the call.
                if (res.data.status === 'Ended') {
                  showToast('This seminar has been ended by the host.', 'info');
                  setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, status: 'Ended' } : m));
                  setActiveMeeting(prev => (prev && prev.id === meetingId) ? { ...prev, status: 'Ended' } : prev);
                }
              })
              .catch(err => console.error('Attendance ping failed:', err));
          };
          jitsiApiRef.current.addEventListener('videoConferenceJoined', () => {
            lastPingAt = Date.now();
            sendHeartbeat();
            attendanceIntervalRef.current = window.setInterval(sendHeartbeat, 30000);
          });
          jitsiApiRef.current.addEventListener('videoConferenceLeft', () => {
            if (attendanceIntervalRef.current) {
              clearInterval(attendanceIntervalRef.current);
              attendanceIntervalRef.current = null;
            }
          });
        }
      }, 150);

      return () => {
        clearTimeout(timer);
        if (attendanceIntervalRef.current) {
          clearInterval(attendanceIntervalRef.current);
          attendanceIntervalRef.current = null;
        }
        if (jitsiApiRef.current) {
          jitsiApiRef.current.dispose();
          jitsiApiRef.current = null;
        }
      };
    }
  }, [meetingModalOpen, activeMeeting]);

  // A 401 means the session is no longer valid server-side (expired, or
  // invalidated by a password change elsewhere) — nothing previously handled
  // this globally, so a stale session would just fail silently call after
  // call instead of cleanly dropping back to the login screen.
  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response?.status === 401) {
          delete axios.defaults.headers.common['Authorization'];
          localStorage.removeItem('philsar_user');
          setIsAuthenticated(false);
          setCurrentUser(null);
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, []);

  useEffect(() => {
    // Check locally stored user on mount
    const storedUser = localStorage.getItem('philsar_user');
    if (storedUser) {
      const parsedUser = JSON.parse(storedUser);
      if (parsedUser.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${parsedUser.token}`;
      }
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
      refreshSessionData(parsedUser);

      // Restore the chatbot conversation for this user if one was saved from
      // an earlier page load in this browser (see the persistence effect below).
      const storedChat = localStorage.getItem(`philsar_chat_${parsedUser.id}`);
      if (storedChat) {
        try {
          setChatMessages(JSON.parse(storedChat));
        } catch (err) {
          console.error('Error restoring chat history:', err);
        }
      }
    }

    // Preload the logo so certificate PDFs can embed it synchronously on click
    const logoImg = new Image();
    logoImg.src = philsarLogo;
    logoImgRef.current = logoImg;

    // Normalize the landing URL so it always reflects the active tab — but leave
    // a reset-password link alone, since its token lives in the query string and
    // tabFromPath would otherwise coerce it straight to /dashboard.
    if (window.location.pathname !== '/reset-password') {
      window.history.replaceState({}, '', `/${tabFromPath(window.location.pathname)}`);
    }
  }, []);

  // A tab left open (or backgrounded) has no way to learn that data changed
  // elsewhere — another tab, another device — short of a manual reload. Catch
  // it up the same way a fresh mount would, whenever it regains focus.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isAuthenticated && currentUser) {
        refreshSessionData(currentUser);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isAuthenticated, currentUser?.id]);

  // Preload the admin-configured certificate background so it can be embedded
  // synchronously; crossOrigin is required since jsPDF reads pixels via canvas
  // and the file is served from the backend's origin.
  useEffect(() => {
    if (settings.certBackgroundImage) {
      const bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      bgImg.src = settings.certBackgroundImage;
      certBgImgRef.current = bgImg;
    } else {
      certBgImgRef.current = null;
    }
  }, [settings.certBackgroundImage]);

  // Auto-advance the Home page hero background through whatever images the
  // admin has uploaded — a no-op while there are 0-1 images.
  useEffect(() => {
    if (landingImages.length < 2) return;
    const interval = setInterval(() => {
      setHeroIndex(i => (i + 1) % landingImages.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [landingImages.length]);

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

  // Every tab is a sibling view toggled via display:none/block (not
  // mounted/unmounted), so the browser scroll position otherwise carries
  // over from whatever page was open before — reset it on every navigation.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeTab]);

  // Fetch all necessary data from the backend APIs
  // Cattle/DSS data is private per user, so we read the userId fresh from localStorage
  // rather than the `currentUser` closure — several call sites invoke this in the same
  // synchronous block as setCurrentUser(...), where that state update hasn't landed yet.
  const fetchGlobalData = async () => {
    try {
      setDataLoading(true);
      const storedUser = localStorage.getItem('philsar_user');
      const userId = storedUser ? JSON.parse(storedUser).id : null;

      const [modulesRes, meetingsRes, settingsRes, landingImagesRes, announcementsRes] = await Promise.all([
        axios.get(`${API_BASE}/modules`),
        axios.get(`${API_BASE}/meetings`),
        axios.get(`${API_BASE}/settings`),
        axios.get(`${API_BASE}/landing-images`),
        axios.get(`${API_BASE}/announcements`)
      ]);

      setModules(modulesRes.data);
      setMeetings(meetingsRes.data);
      setSettings(settingsRes.data);
      setLandingImages(landingImagesRes.data);
      setAnnouncements(announcementsRes.data);

      if (userId) {
        const [assessmentsRes, herdStatsRes, attendanceRes] = await Promise.all([
          axios.get(`${API_BASE}/assessments`, { params: { userId } }),
          axios.get(`${API_BASE}/assessments/stats`, { params: { userId } }),
          axios.get(`${API_BASE}/meetings/attendance/${userId}`)
        ]);
        setAssessments(assessmentsRes.data);
        setHerdStats(herdStatsRes.data);
        setMyAttendance(attendanceRes.data);
      } else {
        setAssessments([]);
        setHerdStats({ totalCattle: 0, readyForBreeding: 0, newThisMonth: 0 });
        setMyAttendance({});
      }
    } catch (error) {
      console.error('Error fetching global database data:', error);
    } finally {
      setDataLoading(false);
    }
  };

  // Everything that can go stale in a tab left open while data changes elsewhere
  // (another tab, another device, or just time passing) — called on mount and
  // again whenever the tab regains focus, so a backgrounded tab catches up
  // without the user needing to manually refresh.
  const refreshSessionData = (user: User) => {
    // Lesson completion is server-persisted so it survives cleared storage / device changes
    axios.get(`${API_BASE}/progress/${user.id}`)
      .then(res => setCompletedLessonsMap(res.data))
      .catch(err => console.error('Error loading lesson progress:', err));
    // Refresh from the server rather than trusting a possibly-stale cached snapshot
    // (e.g. modulesCompleted/dssAssessmentsRun changed via some other path/device since login)
    axios.get(`${API_BASE}/auth/profile/${user.id}`)
      .then(res => {
        const refreshed = { ...res.data, token: user.token };
        setCurrentUser(refreshed);
        localStorage.setItem('philsar_user', JSON.stringify(refreshed));
      })
      .catch(err => console.error('Error refreshing user data:', err));

    // Modules/meetings/etc. are only ever rendered post-login, and several of
    // the endpoints below require auth — no reason to fetch them (or risk a
    // 401) for a logged-out visitor.
    fetchGlobalData();
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
    // currentUser?.role is deliberately included: on a hard refresh landing
    // directly on /admin, activeTab is already 'admin' on the very first
    // render but currentUser hasn't hydrated from localStorage yet, so the
    // condition above is false. Without this dependency the effect would
    // never re-fire once currentUser becomes available a moment later,
    // leaving the Users table empty until logging out and back in.
  }, [activeTab, currentUser?.role]);

  // Re-check certificate eligibility whenever the user opens Virtual Meetings —
  // covers certificates an admin granted manually since the last page load.
  useEffect(() => {
    if (activeTab === 'meetings' && currentUser) {
      axios.get(`${API_BASE}/meetings/attendance/${currentUser.id}`)
        .then(res => setMyAttendance(res.data))
        .catch(err => console.error('Error loading seminar attendance:', err));
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
      const user = { ...response.data.user, token: response.data.token };
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
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
      const user = { ...response.data.user, token: response.data.token };
      axios.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
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

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/forgot-password`, { email: forgotEmail });
      setForgotSubmitted(true);
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }
    setAuthLoading(true);
    try {
      await axios.post(`${API_BASE}/auth/reset-password`, {
        token: resetToken,
        newPassword: resetPasswordForm.password
      });
      setResetSuccess(true);
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Invalid or expired reset link.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    // Chat is persisted to localStorage per-user (see the chatMessages effect below) —
    // remove it here so logging out actually restarts the conversation, rather than
    // just resetting the in-memory copy while a stale one lingers in storage for the
    // next fresh login to pick back up.
    if (currentUser) {
      localStorage.removeItem(`philsar_chat_${currentUser.id}`);
    }
    localStorage.removeItem('philsar_user');
    delete axios.defaults.headers.common['Authorization'];
    setIsAuthenticated(false);
    setCurrentUser(null);
    setCompletedLessonsMap({});
    setActiveTab('home');
    // Client-only state with no per-user backend fetch — must be reset explicitly
    // so the next account to log in in this tab doesn't inherit it.
    setChatMessages([CHAT_GREETING]);
    setInputMessage('');
    setDssResult(null);
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
      // A password change invalidates the old token server-side, so the response
      // includes a fresh one in that case — reusing the old token here would leave
      // the session broken on its very next request.
      const newToken = response.data.token || currentUser.token;
      const updated = { ...response.data.user, token: newToken };
      if (response.data.token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      }
      localStorage.setItem('philsar_user', JSON.stringify(updated));
      setCurrentUser(updated);
      showToast('Profile updated successfully!', 'success');
      setProfileForm(prev => ({ ...prev, password: '', currentPassword: '' }));
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Failed to update profile.', 'error');
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!file || !currentUser) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
      return;
    }

    setUploadingAvatar(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const uploadRes = await axios.post(`${API_BASE}/auth/upload-avatar`, {
            base64Data,
            fileName: file.name
          });
          const profileRes = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
            profilePicture: uploadRes.data.url
          });
          const updated = { ...profileRes.data.user, token: currentUser.token };
          localStorage.setItem('philsar_user', JSON.stringify(updated));
          setCurrentUser(updated);
          showToast('Profile picture updated!', 'success');
        } catch (uploadError: any) {
          console.error('Avatar upload error:', uploadError);
          showToast(uploadError.response?.data?.message || 'Failed to upload profile picture.', 'error');
        } finally {
          setUploadingAvatar(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingAvatar(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('FileReader error:', error);
      showToast('Error processing the file.', 'error');
      setUploadingAvatar(false);
    }
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAvatarUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!currentUser) return;
    try {
      const response = await axios.put(`${API_BASE}/auth/profile/${currentUser.id}`, {
        profilePicture: ''
      });
      const updated = { ...response.data.user, token: currentUser.token };
      localStorage.setItem('philsar_user', JSON.stringify(updated));
      setCurrentUser(updated);
      showToast('Profile picture removed.', 'success');
    } catch (error) {
      console.error(error);
      showToast('Error removing profile picture.', 'error');
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
      showToast('Please fill out all required cattle data fields.', 'warning');
      return;
    }
    if (dssForm.estrusIndicators.length === 0) {
      showToast('Please select at least one estrus indicator (or "None Observed").', 'warning');
      return;
    }
    setDssLoading(true);
    try {
      const response = await axios.post(`${API_BASE}/assessments`, {
        cattleId: dssForm.cattleId,
        age: dssForm.age,
        bcs: dssForm.bcs.split(' ')[0], // Parse first character (number)
        daysSinceCalving: dssForm.daysSinceCalving,
        estrusIndicators: dssForm.estrusIndicators.join(', '),
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
      showToast('Error running DSS assessment.', 'error');
    } finally {
      setDssLoading(false);
    }
  };

  // Virtual Meetings RSVPs
  const handleRSVP = async (meetingId: number) => {
    const alreadyRsvped = myAttendance[meetingId]?.rsvped;
    try {
      const response = await axios.post(`${API_BASE}/meetings/${meetingId}/rsvp`, {
        userId: currentUser?.id
      });
      const updated = response.data.meeting;

      // Update in state list
      setMeetings(prev => prev.map(m => m.id === updated.id ? updated : m));
      setMyAttendance(prev => ({
        ...prev,
        [meetingId]: { secondsAttended: prev[meetingId]?.secondsAttended || 0, eligible: prev[meetingId]?.eligible || false, rsvped: true }
      }));

      // The backend only counts seminarsAttended on a genuinely new RSVP — mirror that here
      if (!alreadyRsvped && currentUser) {
        setCurrentUser({ ...currentUser, seminarsAttended: currentUser.seminarsAttended + 1 });
        const stored = localStorage.getItem('philsar_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.seminarsAttended += 1;
          localStorage.setItem('philsar_user', JSON.stringify(parsed));
        }
      }

      if (!alreadyRsvped) {
        showToast('RSVP registered successfully! You can now join this seminar\'s video room. We added this meeting to your schedule.', 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Error registering RSVP.', 'error');
    }
  };

  const handleJoinMeeting = (meeting: Meeting) => {
    // The video room only actually embeds for non-Ended meetings — gate those behind
    // having RSVP'd, so the room isn't open to every logged-in account by default.
    // Admins (who host/manage these) are exempt.
    const needsRsvp = meeting.status !== 'Ended' && currentUser?.role !== 'Admin' && !myAttendance[meeting.id]?.rsvped;
    if (needsRsvp) {
      showToast('Please RSVP to this seminar first — use the RSVP button, then Join Live will be available.', 'warning');
      return;
    }
    setActiveMeeting(meeting);
    setMinutesDraft(meeting.minutes || '');
    setMeetingModalOpen(true);
  };

  const handleSaveMinutes = async () => {
    if (!activeMeeting) return;
    setSavingMinutes(true);
    try {
      const res = await axios.put(`${API_BASE}/meetings/${activeMeeting.id}`, { minutes: minutesDraft });
      setActiveMeeting(res.data.meeting);
      setMinutesDraft(res.data.meeting.minutes || '');
      fetchGlobalData();
    } catch (error) {
      showToast('Error saving minutes.', 'error');
    } finally {
      setSavingMinutes(false);
    }
  };

  const handleDownloadMinutes = async (meeting: Meeting) => {
    if (!meeting.minutes) return;

    // Loaded on demand, same as the certificate PDF — keeps jsPDF out of the main bundle.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    const margin = 50;
    const usableWidth = w - margin * 2;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text('Meeting Minutes', margin, 60);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(meeting.title, margin, 88);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(90, 90, 90);
    doc.text(`Hosted by ${meeting.host}  ·  ${meeting.dateTime}`, margin, 106);

    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(margin, 118, w - margin, 118);

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    const lines = doc.splitTextToSize(meeting.minutes, usableWidth);
    let y = 140;
    const lineHeight = 16;
    const bottomLimit = h - margin;

    for (const line of lines) {
      if (y > bottomLimit) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }

    doc.save(`Minutes - ${meeting.title}.pdf`);
  };

  const handleDownloadCertificate = async (meeting: Meeting, userName?: string, styleOverride?: SystemSettings) => {
    const recipientName = userName || currentUser?.name;
    if (!recipientName) return;

    const style = styleOverride || settings;
    const [pr, pg, pb] = hexToRgb(style.certPrimaryColor || '#305CDE');
    const [ar, ag, ab] = hexToRgb(style.certAccentColor || '#7B93E0');

    // Loaded on demand — jsPDF (plus its html2canvas dependency) is only needed here,
    // so keeping it out of the main bundle noticeably shrinks everyone's initial load.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    const bgImg = certBgImgRef.current;
    const hasBackground = style.certBackgroundImage && bgImg && bgImg.complete && bgImg.naturalWidth > 0;

    if (hasBackground) {
      doc.addImage(bgImg as HTMLImageElement, 'JPEG', 0, 0, w, h);
    } else {
      // Outer border
      doc.setDrawColor(pr, pg, pb);
      doc.setLineWidth(4);
      doc.rect(24, 24, w - 48, h - 48);
      doc.setDrawColor(ar, ag, ab);
      doc.setLineWidth(1);
      doc.rect(34, 34, w - 68, h - 68);

      const logoImg = logoImgRef.current;
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        doc.addImage(logoImg, 'PNG', w / 2 - 40, 50, 80, 80);
      }
    }

    doc.setTextColor(pr, pg, pb);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(30);
    doc.text(style.certTitleText || 'Certificate of Attendance', w / 2, 165, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text('This certifies that', w / 2, 205, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(26);
    doc.text(recipientName, w / 2, 240, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text(style.certBodyText || 'has successfully attended the virtual seminar', w / 2, 270, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(`"${meeting.title}"`, w / 2, 300, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.text(`hosted by ${meeting.host}`, w / 2, 325, { align: 'center' });

    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    doc.setFontSize(11);
    doc.setTextColor(ar, ag, ab);
    doc.text(`Issued on ${dateStr} · ${style.certClosingText || 'PHILSAR Cattle Reproductive Portal'}`, w / 2, h - 60, { align: 'center' });

    doc.save(`Certificate - ${meeting.title} - ${recipientName}.pdf`);
  };

  const fetchCertAttendance = async (meetingId: number) => {
    try {
      const res = await axios.get(`${API_BASE}/meetings/${meetingId}/attendance`);
      const map: Record<number, { secondsAttended: number; eligible: boolean; granted: boolean }> = {};
      for (const row of res.data) {
        map[row.userId] = { secondsAttended: row.secondsAttended, eligible: row.eligible, granted: row.granted };
      }
      setCertAttendanceRows(map);
    } catch (error) {
      console.error('Error loading meeting attendance:', error);
    }
  };

  const openCertModal = async (meeting: Meeting) => {
    setCertModalMeeting(meeting);
    setCertModalOpen(true);
    setCertAttendanceRows({});
    await fetchCertAttendance(meeting.id);
  };

  // The roster otherwise only reflects whatever attendance looked like at the
  // moment the modal was opened — an admin watching a live seminar would see a
  // frozen snapshot instead of climbing attendance times.
  useEffect(() => {
    if (!certModalOpen || !certModalMeeting) return;
    const interval = setInterval(() => fetchCertAttendance(certModalMeeting.id), 20000);
    return () => clearInterval(interval);
  }, [certModalOpen, certModalMeeting]);

  const handleToggleCertificate = async (userId: number, currentlyGranted: boolean) => {
    if (!certModalMeeting) return;
    const endpoint = currentlyGranted ? 'revoke' : 'grant';
    try {
      const res = await axios.post(`${API_BASE}/meetings/${certModalMeeting.id}/attendance/${endpoint}`, { userId });
      setCertAttendanceRows(prev => ({ ...prev, [userId]: res.data }));
    } catch (error) {
      showToast('Error updating certificate.', 'error');
    }
  };

  const openCattleModal = async () => {
    setCattleModalOpen(true);
    try {
      const res = await axios.get(`${API_BASE}/cattle`, { params: { userId: currentUser?.id } });
      setCattleList(res.data);
    } catch (error) {
      console.error('Error loading cattle list:', error);
    }
  };

  const resetCattleForm = () => {
    setNewCattleForm({ tagId: '', breed: '', notes: '' });
    setEditingCattleId(null);
  };

  const handleEditCattleClick = (c: CattleRecord) => {
    setEditingCattleId(c.id);
    setNewCattleForm({ tagId: c.tagId, breed: c.breed || '', notes: c.notes || '' });
  };

  const handleSaveCattle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCattleForm.tagId.trim()) return;
    try {
      if (editingCattleId) {
        await axios.put(`${API_BASE}/cattle/${editingCattleId}`, {
          tagId: newCattleForm.tagId.trim(),
          breed: newCattleForm.breed.trim() || undefined,
          notes: newCattleForm.notes.trim() || undefined,
          userId: currentUser?.id
        });
      } else {
        await axios.post(`${API_BASE}/cattle`, {
          tagId: newCattleForm.tagId.trim(),
          breed: newCattleForm.breed.trim() || undefined,
          notes: newCattleForm.notes.trim() || undefined,
          userId: currentUser?.id
        });
      }
      resetCattleForm();
      const res = await axios.get(`${API_BASE}/cattle`, { params: { userId: currentUser?.id } });
      setCattleList(res.data);
      fetchGlobalData();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Error saving cattle.', 'error');
    }
  };

  const handleDeleteCattle = async (id: number, tagId: string) => {
    if (!(await confirmDelete(`Remove ${tagId} from the herd registry? Past DSS assessments for this cattle are kept.`))) return;
    try {
      await axios.delete(`${API_BASE}/cattle/${id}`, { params: { userId: currentUser?.id } });
      setCattleList(prev => prev.filter(c => c.id !== id));
      if (editingCattleId === id) resetCattleForm();
      fetchGlobalData();
    } catch (error) {
      showToast('Error removing cattle.', 'error');
    }
  };

  const handleCertBackgroundUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
      return;
    }

    setUploadingCertBg(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const uploadRes = await axios.post(`${API_BASE}/modules/upload`, {
            base64Data,
            fileName: file.name
          });
          setSettings(prev => ({ ...prev, certBackgroundImage: uploadRes.data.url }));
        } catch (uploadError: any) {
          console.error('Certificate background upload error:', uploadError);
          showToast(uploadError.response?.data?.message || 'Failed to upload background image.', 'error');
        } finally {
          setUploadingCertBg(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingCertBg(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('FileReader error:', error);
      showToast('Error processing the file.', 'error');
      setUploadingCertBg(false);
    }
  };

  const handleCertBackgroundFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleCertBackgroundUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleRemoveCertBackground = () => {
    setSettings(prev => ({ ...prev, certBackgroundImage: '' }));
  };

  // Admin Dashboard CRUD Operations
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await axios.post(`${API_BASE}/auth/register`, newUserForm);
      showToast('User added successfully!', 'success');
      setNewUserForm({ name: '', email: '', password: '', role: 'Farmer', organization: '' });
      fetchUsersList();
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Error adding user.', 'error');
    } finally {
      setSavingUser(false);
    }
  };

  const handleToggleUserStatus = async (user: User) => {
    const activating = user.status === 'Inactive';
    if (!activating && !(await confirmDelete(
      `Deactivate ${user.name}? They won't be able to log in until reactivated.`,
      'Deactivate this account?',
      'Yes, deactivate'
    ))) return;
    try {
      const newStatus = activating ? 'Active' : 'Inactive';
      await axios.put(`${API_BASE}/auth/profile/${user.id}`, { status: newStatus });
      setAllUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
      showToast(`${user.name} is now ${newStatus.toLowerCase()}.`, 'success');
    } catch (error: any) {
      showToast(error.response?.data?.message || 'Error updating account status.', 'error');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!(await confirmDelete('Are you sure you want to remove this user?'))) return;
    try {
      await axios.delete(`${API_BASE}/auth/users/${userId}`);
      setAllUsers(prev => prev.filter(u => u.id !== userId));
    } catch (error) {
      console.error(error);
      showToast('Error deleting user.', 'error');
    }
  };

  const handleImageFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
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
          showToast(uploadError.response?.data?.message || 'Failed to upload image to the server.', 'error');
        } finally {
          setUploadingImage(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('FileReader error:', error);
      showToast('Error processing the file.', 'error');
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
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
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
          showToast(uploadError.response?.data?.message || 'Failed to upload image.', 'error');
        } finally {
          setUploadingContentImage(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingContentImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Content FileReader error:', error);
      showToast('Error processing the file.', 'error');
      setUploadingContentImage(false);
    }
  };

  const handleContentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleContentImageUpload(e.target.files[0]);
      e.target.value = ''; // reset so same file can be re-selected
    }
  };

  const handleLandingImageUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
      return;
    }

    setUploadingLandingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const uploadRes = await axios.post(`${API_BASE}/modules/upload`, {
            base64Data,
            fileName: file.name
          });
          const addRes = await axios.post(`${API_BASE}/landing-images`, { imageUrl: uploadRes.data.url });
          setLandingImages(prev => [...prev, addRes.data.image]);
        } catch (uploadError: any) {
          console.error('Landing image upload error:', uploadError);
          showToast(uploadError.response?.data?.message || 'Failed to upload image.', 'error');
        } finally {
          setUploadingLandingImage(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingLandingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Landing image FileReader error:', error);
      showToast('Error processing the file.', 'error');
      setUploadingLandingImage(false);
    }
  };

  const handleLandingFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleLandingImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleDeleteLandingImage = async (id: number) => {
    if (!(await confirmDelete('Remove this background photo from the Home page rotation?'))) return;
    try {
      await axios.delete(`${API_BASE}/landing-images/${id}`);
      setLandingImages(prev => prev.filter(img => img.id !== id));
    } catch (error) {
      console.error('Error deleting landing image:', error);
      showToast('Error removing image.', 'error');
    }
  };

  const handleAnnouncementImageUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('Please select an image file (PNG, JPG, JPEG, WEBP, GIF).', 'warning');
      return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      showToast('Image size exceeds 5MB limit. Please choose a smaller image.', 'warning');
      return;
    }

    setUploadingAnnouncementImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Data = reader.result as string;
        try {
          const uploadRes = await axios.post(`${API_BASE}/modules/upload`, {
            base64Data,
            fileName: file.name
          });
          setNewAnnouncementForm(prev => ({ ...prev, imageUrl: uploadRes.data.url }));
        } catch (uploadError: any) {
          console.error('Announcement image upload error:', uploadError);
          showToast(uploadError.response?.data?.message || 'Failed to upload image.', 'error');
        } finally {
          setUploadingAnnouncementImage(false);
        }
      };
      reader.onerror = () => {
        showToast('Error reading the image file.', 'error');
        setUploadingAnnouncementImage(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Announcement image FileReader error:', error);
      showToast('Error processing the file.', 'error');
      setUploadingAnnouncementImage(false);
    }
  };

  const handleAnnouncementFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleAnnouncementImageUpload(e.target.files[0]);
      e.target.value = '';
    }
  };

  const resetAnnouncementForm = () => {
    setNewAnnouncementForm({ title: '', body: '', imageUrl: '' });
    setEditingAnnouncementId(null);
  };

  const handleEditAnnouncementClick = (a: Announcement) => {
    setEditingAnnouncementId(a.id);
    setNewAnnouncementForm({ title: a.title, body: a.body, imageUrl: a.imageUrl || '' });
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnouncementForm.title.trim() || !newAnnouncementForm.body.trim()) return;
    setSavingAnnouncement(true);
    try {
      if (editingAnnouncementId) {
        const res = await axios.put(`${API_BASE}/announcements/${editingAnnouncementId}`, newAnnouncementForm);
        setAnnouncements(prev => prev.map(a => a.id === editingAnnouncementId ? res.data.announcement : a));
      } else {
        const res = await axios.post(`${API_BASE}/announcements`, newAnnouncementForm);
        setAnnouncements(prev => [res.data.announcement, ...prev]);
      }
      resetAnnouncementForm();
    } catch (error) {
      console.error('Error saving announcement:', error);
      showToast('Error saving announcement.', 'error');
    } finally {
      setSavingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = async (id: number) => {
    if (!(await confirmDelete('Delete this announcement from the Home page?'))) return;
    try {
      await axios.delete(`${API_BASE}/announcements/${id}`);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
      if (editingAnnouncementId === id) resetAnnouncementForm();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      showToast('Error deleting announcement.', 'error');
    }
  };

  const handleAddModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingModule(true);
    try {
      if (editingModule) {
        await axios.put(`${API_BASE}/modules/${editingModule.id}`, newModuleForm);
        showToast('Module updated successfully!', 'success');
        setEditingModule(null);
      } else {
        await axios.post(`${API_BASE}/modules`, newModuleForm);
        showToast('Module created successfully!', 'success');
      }
      setNewModuleForm({ title: '', description: '', content: '', imageUrl: '' });
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      showToast('Error saving module.', 'error');
    } finally {
      setSavingModule(false);
    }
  };

  const handleDeleteModule = async (moduleId: number) => {
    if (!(await confirmDelete('Are you sure you want to delete this module? This will remove all its lessons.'))) return;
    try {
      await axios.delete(`${API_BASE}/modules/${moduleId}`);
      showToast('Module deleted successfully!', 'success');
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      showToast('Error deleting module.', 'error');
    }
  };

  const handleAddMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMeeting(true);
    try {
      if (editingMeeting) {
        await axios.put(`${API_BASE}/meetings/${editingMeeting.id}`, newMeetingForm);
        showToast('Seminar updated successfully!', 'success');
        setEditingMeeting(null);
      } else {
        await axios.post(`${API_BASE}/meetings`, newMeetingForm);
        showToast('Seminar scheduled successfully!', 'success');
      }
      setNewMeetingForm({ title: '', host: '', dateTime: '', status: 'Upcoming', videoLink: '', recordingUrl: '' });
      fetchGlobalData();
    } catch (error) {
      console.error(error);
      showToast(editingMeeting ? 'Error updating meeting.' : 'Error scheduling meeting.', 'error');
    } finally {
      setSavingMeeting(false);
    }
  };

  const handleDeleteMeeting = async (meetingId: number) => {
    if (!(await confirmDelete('Are you sure you want to cancel this meeting?'))) return;
    try {
      await axios.delete(`${API_BASE}/meetings/${meetingId}`);
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
    } catch (error) {
      console.error(error);
      showToast('Error deleting meeting.', 'error');
    }
  };

  const handleUpdateSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const response = await axios.post(`${API_BASE}/settings`, settings);
      setSettings(response.data.settings);
      showToast('System configurations saved successfully!', 'success');
    } catch (error) {
      console.error(error);
      showToast('Error saving system settings.', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleMarkLessonComplete = async (mod: LearningModule) => {
    if (!mod || !currentUser) return;
    const currentCompleted = completedLessonsMap[mod.id] || [];
    if (currentCompleted.includes(selectedLessonIndex)) {
      showToast('This lesson is already marked complete!', 'info');
      return;
    }

    const parsedLessons = parseLessons(mod.content);
    try {
      const response = await axios.post(`${API_BASE}/progress/complete`, {
        userId: currentUser.id,
        moduleId: mod.id,
        lessonIndex: selectedLessonIndex
      });
      setCompletedLessonsMap(prev => ({ ...prev, [mod.id]: response.data.completedLessons }));
      const updatedUser = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify({ ...currentUser, ...updatedUser }));
      setCurrentUser(prev => prev ? { ...prev, ...updatedUser } : prev);

      if (response.data.justCompletedModule) {
        showToast(`Congratulations! You've fully completed the "${mod.title}" module!`, 'success');
      } else {
        showToast(`Lesson "${parsedLessons[selectedLessonIndex]?.title}" marked as complete!`, 'success');
      }
    } catch (error) {
      console.error(error);
      showToast('Error updating completion progress.', 'error');
    }
  };

  const handleUnmarkLessonComplete = async (mod: LearningModule) => {
    if (!mod || !currentUser) return;
    const currentCompleted = completedLessonsMap[mod.id] || [];
    if (!currentCompleted.includes(selectedLessonIndex)) {
      return;
    }

    const parsedLessons = parseLessons(mod.content);
    try {
      const response = await axios.post(`${API_BASE}/progress/uncomplete`, {
        userId: currentUser.id,
        moduleId: mod.id,
        lessonIndex: selectedLessonIndex
      });
      setCompletedLessonsMap(prev => ({ ...prev, [mod.id]: response.data.completedLessons }));
      const updatedUser = response.data.user;
      localStorage.setItem('philsar_user', JSON.stringify({ ...currentUser, ...updatedUser }));
      setCurrentUser(prev => prev ? { ...prev, ...updatedUser } : prev);
    } catch (error) {
      console.error('Error decrementing completed modules:', error);
    }
    showToast(`Lesson "${parsedLessons[selectedLessonIndex]?.title}" unmarked.`, 'info');
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

  // Render Auth Screen (Gatekeeper) — a reset-password link must show the reset
  // screen even if this browser already has an active session.
  if (!isAuthenticated || authView === 'reset') {
    return (
      <div className="auth-wrapper">
        <div className="auth-card">

          {/* LEFT PANEL — Branding */}
          <div className="auth-left">
            <div className="auth-left-content">
              <div className="auth-brand">
                <div className="auth-brand-icon"><img src={philsarLogo} alt="PHILSAR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
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

              {authView === 'login' ? (
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
                        <span className="auth-forgot" onClick={() => { setAuthView('forgot'); setAuthError(''); setForgotSubmitted(false); }}>
                          Forgot password?
                        </span>
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
                    <a className="auth-switch-link" onClick={() => { setAuthView('register'); setAuthError(''); }}>
                      Create one here
                    </a>
                  </p>
                </>
              ) : authView === 'register' ? (
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
                    <a className="auth-switch-link" onClick={() => { setAuthView('login'); setAuthError(''); }}>
                      Sign in here
                    </a>
                  </p>
                </>
              ) : authView === 'forgot' ? (
                <>
                  <div className="auth-form-header">
                    <h2 className="auth-form-title">Forgot password?</h2>
                    <p className="auth-form-subtitle">Enter your email and we'll send you a reset link</p>
                  </div>

                  {authError && (
                    <div className="auth-error-box">{authError}</div>
                  )}

                  {forgotSubmitted ? (
                    <div className="auth-error-box" style={{ background: 'rgba(34,139,34,0.08)', borderColor: 'rgba(34,139,34,0.3)', color: '#2e7d32' }}>
                      If an account exists for that email, we've sent a reset link. Check your inbox (and spam folder).
                    </div>
                  ) : (
                    <form onSubmit={handleForgotPasswordSubmit} className="auth-form">
                      <div className="auth-field">
                        <label className="auth-label">Email Address</label>
                        <div className="auth-input-wrap">
                          <span className="auth-input-icon">✉️</span>
                          <input
                            className="auth-input"
                            type="email"
                            placeholder="juan@gmail.com"
                            value={forgotEmail}
                            onChange={e => setForgotEmail(e.target.value)}
                            required
                          />
                        </div>
                      </div>

                      <button className="auth-submit-btn" type="submit" disabled={authLoading}>
                        <span>→</span>
                        {authLoading ? 'Sending…' : 'Send Reset Link'}
                      </button>
                    </form>
                  )}

                  <p className="auth-switch-text">
                    Remembered your password?{' '}
                    <a className="auth-switch-link" onClick={() => { setAuthView('login'); setAuthError(''); }}>
                      Sign in here
                    </a>
                  </p>
                </>
              ) : (
                <>
                  <div className="auth-form-header">
                    <h2 className="auth-form-title">Set a new password</h2>
                    <p className="auth-form-subtitle">Choose a new password for your account</p>
                  </div>

                  {authError && (
                    <div className="auth-error-box">{authError}</div>
                  )}

                  {resetSuccess ? (
                    <>
                      <div className="auth-error-box" style={{ background: 'rgba(34,139,34,0.08)', borderColor: 'rgba(34,139,34,0.3)', color: '#2e7d32' }}>
                        Your password has been reset successfully.
                      </div>
                      <button
                        className="auth-submit-btn"
                        type="button"
                        onClick={() => {
                          window.history.replaceState({}, '', '/');
                          setAuthView('login');
                        }}
                      >
                        <span>→</span>
                        Go to Sign In
                      </button>
                    </>
                  ) : !resetToken ? (
                    <div className="auth-error-box">This reset link is missing its token. Please request a new one.</div>
                  ) : (
                    <form onSubmit={handleResetPasswordSubmit} className="auth-form">
                      <div className="auth-field">
                        <label className="auth-label">New Password</label>
                        <div className="auth-input-wrap">
                          <span className="auth-input-icon">🔒</span>
                          <input
                            className="auth-input"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Create a strong password"
                            value={resetPasswordForm.password}
                            onChange={e => setResetPasswordForm({ ...resetPasswordForm, password: e.target.value })}
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
                        <label className="auth-label">Confirm New Password</label>
                        <div className="auth-input-wrap">
                          <span className="auth-input-icon">🔒</span>
                          <input
                            className="auth-input"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Re-enter your new password"
                            value={resetPasswordForm.confirmPassword}
                            onChange={e => setResetPasswordForm({ ...resetPasswordForm, confirmPassword: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <button className="auth-submit-btn" type="submit" disabled={authLoading}>
                        <span>→</span>
                        {authLoading ? 'Saving…' : 'Reset Password'}
                      </button>
                    </form>
                  )}

                  <p className="auth-switch-text">
                    Need a new link?{' '}
                    <a className="auth-switch-link" onClick={() => { setAuthView('forgot'); setAuthError(''); setForgotSubmitted(false); }}>
                      Request another
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
            <div className="logo-icon"><img src={philsarLogo} alt="PHILSAR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /></div>
            <div>
              <div className="logo-text">PHILSAR</div>
              <span className="logo-sub">Portal</span>
            </div>
          </div>
        </div>

        <div className="sidebar-user">
          <div className="user-avatar">
            {isValidImageUrl(currentUser?.profilePicture) ? (
              <img src={currentUser?.profilePicture} alt={currentUser?.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
            ) : (
              currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'JD'
            )}
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
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => handleTabNavigate('home')}
          >
            <div className="nav-icon">🏠</div>
            Home
          </button>

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

      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* MAIN CONTENT REGION */}
      <div className="main">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu-btn"
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
            <div className="topbar-btn" onClick={() => handleTabNavigate('profile')}>👤</div>
          </div>
        </div>

        {/* VIEW CONDITIONAL RENDERING */}
        <div className="page-content">

          {/* ── VIEW: HOME ── */}
          {activeTab === 'home' && (
            <div className="view active">
              <div className="home-hero">
                {landingImages.length > 0 ? (
                  landingImages.map((img, i) => (
                    <div
                      key={img.id}
                      className="home-hero-bg"
                      style={{
                        backgroundImage: `url(${img.imageUrl})`,
                        opacity: (heroIndex % landingImages.length) === i ? 1 : 0
                      }}
                    />
                  ))
                ) : (
                  <div className="home-hero-bg home-hero-bg-fallback" style={{ opacity: 1 }} />
                )}
                <div className="home-hero-overlay" />
                <div className="home-hero-content">
                  <div className="home-hero-eyebrow">PHILSAR Cattle Reproductive Portal</div>
                  <h1 className="home-hero-title">Smarter Breeding Decisions, Healthier Herds</h1>
                  <p className="home-hero-subtitle">
                    Data-driven decision support, structured e-learning, and virtual seminars — built for
                    Filipino cattle farmers, livestock managers, and veterinary extension workers.
                  </p>
                  <div className="home-hero-actions">
                    <button className="home-hero-btn primary" onClick={() => handleTabNavigate('dss')}>
                      🧬 Run Breeding Assessment
                    </button>
                    <button className="home-hero-btn" onClick={() => handleTabNavigate('learning')}>
                      📚 Explore Learning Modules
                    </button>
                  </div>
                </div>
                {landingImages.length > 1 && (
                  <div className="home-hero-dots">
                    {landingImages.map((img, i) => (
                      <button
                        key={img.id}
                        className={`home-hero-dot ${(heroIndex % landingImages.length) === i ? 'active' : ''}`}
                        onClick={() => setHeroIndex(i)}
                        aria-label={`Show background ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>

              {announcements.length > 0 && (
                <div className="home-section">
                  <div className="page-header" style={{ marginBottom: '16px' }}>
                    <div className="page-title" style={{ fontSize: '20px' }}>Announcements</div>
                  </div>
                  <div className="announcement-grid">
                    {announcements.map(a => (
                      <div key={a.id} className="announcement-card">
                        {isValidImageUrl(a.imageUrl || undefined) && (
                          <div className="announcement-card-img" style={{ backgroundImage: `url(${a.imageUrl})` }} />
                        )}
                        <div className="announcement-card-body">
                          <div className="announcement-card-title">{a.title}</div>
                          <div className="announcement-card-text">{a.body}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="home-section">
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">Upcoming Seminars</div>
                    <button className="card-action" onClick={() => handleTabNavigate('meetings')}>See all</button>
                  </div>
                  <div className="card-body">
                    {meetings.filter(m => m.status !== 'Ended').length === 0 ? (
                      <div style={{ padding: '20px 4px', color: 'var(--text-muted)', fontSize: '13px' }}>
                        No upcoming seminars scheduled right now.
                      </div>
                    ) : (
                      meetings.filter(m => m.status !== 'Ended').slice(0, 3).map(session => (
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
                          ) : myAttendance[session.id]?.rsvped ? (
                            <div className="session-join" style={{ color: 'var(--green-mid)', background: 'rgba(45,106,79,0.1)', border: '1px solid rgba(45,106,79,0.25)' }}>
                              ✓ Registered
                            </div>
                          ) : (
                            <button
                              className="session-join"
                              style={{ color: 'var(--amber)', background: 'rgba(48,92,222,0.08)', border: '1px solid rgba(48,92,222,0.2)' }}
                              onClick={(e) => { e.stopPropagation(); handleRSVP(session.id); }}
                            >
                              RSVP
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="home-section">
                <div className="page-header" style={{ marginBottom: '16px' }}>
                  <div className="page-title" style={{ fontSize: '20px' }}>Quick Access</div>
                </div>
                <div className="quick-access-grid">
                  <div className="quick-access-card" onClick={() => handleTabNavigate('learning')}>
                    <div className="quick-access-icon">📚</div>
                    <div className="quick-access-title">Learning Center</div>
                    <div className="quick-access-desc">Structured courses on cattle reproductive anatomy and breeding.</div>
                  </div>
                  <div className="quick-access-card" onClick={() => handleTabNavigate('dss')}>
                    <div className="quick-access-icon">🧬</div>
                    <div className="quick-access-title">Decision Support</div>
                    <div className="quick-access-desc">AI-assisted breeding readiness assessment for your herd.</div>
                  </div>
                  <div className="quick-access-card" onClick={() => handleTabNavigate('chatbot')}>
                    <div className="quick-access-icon">🤖</div>
                    <div className="quick-access-title">AI Assistant</div>
                    <div className="quick-access-desc">Ask PHILSARBot about estrus cycles, AI procedures, and more.</div>
                  </div>
                  <div className="quick-access-card" onClick={() => handleTabNavigate('meetings')}>
                    <div className="quick-access-icon">🎥</div>
                    <div className="quick-access-title">Virtual Meetings</div>
                    <div className="quick-access-desc">Join live seminars and connect with extension workers.</div>
                  </div>
                </div>
              </div>
            </div>
          )}

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
                <div className="stat-card amber" style={{ cursor: 'pointer' }} onClick={openCattleModal}>
                  <div className="stat-icon">🐄</div>
                  <div className="stat-value">{herdStats.totalCattle}</div>
                  <div className="stat-label">Total Cattle</div>
                  {herdStats.newThisMonth > 0 ? (
                    <div className="stat-change up">↑ {herdStats.newThisMonth} this month</div>
                  ) : (
                    <div className="stat-change neutral">No new cattle this month</div>
                  )}
                </div>
                <div className="stat-card green">
                  <div className="stat-icon">🌿</div>
                  <div className="stat-value">{herdStats.readyForBreeding}</div>
                  <div className="stat-label">Ready for Breeding</div>
                  <div className="stat-change neutral">
                    {herdStats.totalCattle > 0 ? Math.round((herdStats.readyForBreeding / herdStats.totalCattle) * 100) : 0}% of assessed herd
                  </div>
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
                        ) : myAttendance[session.id]?.rsvped ? (
                          <div className="session-join" style={{ color: 'var(--green-mid)', background: 'rgba(45,106,79,0.1)', border: '1px solid rgba(45,106,79,0.25)' }}>
                            ✓ Registered
                          </div>
                        ) : (
                          <button
                            className="session-join"
                            style={{ color: 'var(--amber)', background: 'rgba(48,92,222,0.08)', border: '1px solid rgba(48,92,222,0.2)' }}
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
                            <div className="lesson-tag" style={{ background: 'rgba(48,92,222,0.1)', color: 'var(--amber)' }}>
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
                        <label className="form-label">Estrus Indicators <span>*</span> <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(select all that apply)</span></label>
                        <div className="radio-group">
                          {['Standing Heat', 'Mounting Others', 'Clear Discharge', 'Swollen Vulva', 'None Observed'].map(indicator => (
                            <div
                              key={indicator}
                              className={`radio-btn ${dssForm.estrusIndicators.includes(indicator) ? 'selected' : ''}`}
                              onClick={() => {
                                if (indicator === 'None Observed') {
                                  setDssForm({ ...dssForm, estrusIndicators: ['None Observed'] });
                                  return;
                                }
                                const withoutNone = dssForm.estrusIndicators.filter(i => i !== 'None Observed');
                                const isSelected = withoutNone.includes(indicator);
                                setDssForm({
                                  ...dssForm,
                                  estrusIndicators: isSelected
                                    ? withoutNone.filter(i => i !== indicator)
                                    : [...withoutNone, indicator]
                                });
                              }}
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
                      <button className="submit-btn" type="submit" disabled={dssLoading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        {dssLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" /> Analyzing…
                          </>
                        ) : (
                          <>🧬 Evaluate Breeding Readiness</>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="result-panel">
                  {dssLoading ? (
                    <div className="result-empty">
                      <Loader2 size={40} className="animate-spin" style={{ color: 'var(--amber)' }} />
                      <div className="result-empty-text" style={{ marginTop: '16px' }}>
                        Analyzing cattle data and generating breeding guidance…
                      </div>
                    </div>
                  ) : !dssResult ? (
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
                            <div className="criteria-icon">{dssForm.estrusIndicators.length > 0 && !dssForm.estrusIndicators.includes('None Observed') ? '✅' : '❌'}</div>
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

                      <div style={{ background: 'rgba(48,92,222,0.07)', border: '1px solid rgba(48,92,222,0.2)', borderRadius: '8px', padding: '14px' }}>
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
                        myAttendance[session.id]?.rsvped ? (
                          <button className="meeting-action" style={{ background: 'var(--green-pale)', color: 'var(--green-dark)', cursor: 'default' }} disabled>
                            ✓ Registered
                          </button>
                        ) : (
                          <button
                            className="meeting-action upcoming"
                            onClick={(e) => { e.stopPropagation(); handleRSVP(session.id); }}
                          >
                            RSVP
                          </button>
                        )
                      ) : (
                        <button className="meeting-action ended">Watch Replay</button>
                      )}
                      {myAttendance[session.id]?.eligible && session.status === 'Ended' && (
                        <button
                          className="meeting-action live"
                          style={{ background: 'var(--amber)', marginLeft: '8px' }}
                          onClick={(e) => { e.stopPropagation(); handleDownloadCertificate(session); }}
                        >
                          🎓 Certificate
                        </button>
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
                <div className="profile-avatar-lg" style={{ position: 'relative' }}>
                  {isValidImageUrl(currentUser?.profilePicture) ? (
                    <img src={currentUser?.profilePicture} alt={currentUser?.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                  ) : (
                    currentUser?.name ? currentUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'JD'
                  )}
                  <input
                    ref={avatarFileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleAvatarFileChange}
                  />
                  <button
                    type="button"
                    className="avatar-upload-btn"
                    onClick={() => avatarFileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                    title="Change profile picture"
                  >
                    {uploadingAvatar ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  </button>
                  {isValidImageUrl(currentUser?.profilePicture) && (
                    <button
                      type="button"
                      className="avatar-remove-btn"
                      onClick={handleRemoveAvatar}
                      title="Remove profile picture"
                    >
                      <X size={12} />
                    </button>
                  )}
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
                  className={`admin-tab ${activeAdminTab === 'home' ? 'active' : ''}`}
                  onClick={() => setActiveAdminTab('home')}
                >
                  🏠 Home Page
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
                  <div className="grid-2 admin-form-grid">
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
                          <button className="submit-btn" type="submit" disabled={savingUser} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            {savingUser ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : '+ Save Account'}
                          </button>
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
                                      {isValidImageUrl(u.profilePicture) ? (
                                        <img src={u.profilePicture} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                                      ) : (
                                        u.name.split(' ').map(n => n[0]).join('').slice(0,2).toUpperCase()
                                      )}
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
                                  <button className="table-action" onClick={() => handleToggleUserStatus(u)} title={u.status === 'Active' ? 'Deactivate' : 'Activate'}>
                                    {u.status === 'Active'
                                      ? <Ban size={14} style={{ color: '#d48806' }} />
                                      : <UserCheck size={14} style={{ color: '#2D6A4F' }} />}
                                  </button>
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
                  <div className="grid-2 admin-form-grid">
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
                            <button className="submit-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} type="submit" disabled={savingModule}>
                              {savingModule ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : (editingModule ? 'Save Changes' : '+ Create Module')}
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
                  <div className="grid-2 admin-form-grid">
                    <div className="card" style={{ height: 'fit-content' }}>
                      <div className="card-header"><div className="card-title">{editingMeeting ? `Edit Seminar: ${editingMeeting.title}` : 'Schedule Virtual Seminar'}</div></div>
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
                          {editingMeeting && (
                            <div className="form-group">
                              <label className="form-label">Status</label>
                              <select
                                className="form-control"
                                value={newMeetingForm.status}
                                onChange={e => setNewMeetingForm({ ...newMeetingForm, status: e.target.value as any })}
                              >
                                <option value="Upcoming">Upcoming</option>
                                <option value="Live">Live</option>
                                <option value="Ended">Ended</option>
                              </select>
                            </div>
                          )}
                          {editingMeeting && (
                            <div className="form-group">
                              <label className="form-label">Recording Link <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                              <input
                                className="form-control"
                                type="text"
                                placeholder="YouTube, Google Drive, or Dropbox link…"
                                value={newMeetingForm.recordingUrl}
                                onChange={e => setNewMeetingForm({ ...newMeetingForm, recordingUrl: e.target.value })}
                              />
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="submit-btn" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} type="submit" disabled={savingMeeting}>
                              {savingMeeting ? <><Loader2 size={16} className="animate-spin" /> {editingMeeting ? 'Saving…' : 'Scheduling…'}</> : (editingMeeting ? 'Save Changes' : '+ Schedule Seminar')}
                            </button>
                            {editingMeeting && (
                              <button
                                className="submit-btn"
                                style={{ flex: 1, background: 'var(--text-muted)' }}
                                type="button"
                                onClick={() => {
                                  setEditingMeeting(null);
                                  setNewMeetingForm({ title: '', host: '', dateTime: '', status: 'Upcoming', videoLink: '', recordingUrl: '' });
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
                              <th>Meeting Title</th>
                              <th>Host</th>
                              <th>Scheduled</th>
                              <th>Status</th>
                              <th>Registrants</th>
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
                                <td>{m.registrants}</td>
                                <td>
                                  <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                      className="table-action"
                                      title="Edit meeting"
                                      onClick={() => {
                                        setEditingMeeting(m);
                                        setNewMeetingForm({
                                          title: m.title,
                                          host: m.host,
                                          dateTime: m.dateTime,
                                          status: m.status,
                                          videoLink: m.videoLink || '',
                                          recordingUrl: m.recordingUrl || ''
                                        });
                                      }}
                                    >
                                      <Pencil size={14} />
                                    </button>
                                    <button className="table-action" onClick={() => openCertModal(m)} title="Manage certificates">
                                      <Award size={14} style={{ color: 'var(--amber)' }} />
                                    </button>
                                    <button className="table-action" onClick={() => handleDeleteMeeting(m.id)}>
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

              {/* TAB CONTENT: HOME PAGE BACKGROUNDS */}
              {activeAdminTab === 'home' && (
                <div id="admin-home">
                  <div className="card">
                    <div className="card-header">
                      <div className="card-title">Home Page Background Photos</div>
                    </div>
                    <div className="card-body">
                      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '18px' }}>
                        These photos rotate through the background of the Home page hero banner. Upload as many
                        as you like — with 2 or more, they'll crossfade automatically every few seconds.
                      </p>

                      <input
                        ref={landingFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleLandingFileChange}
                      />
                      <button
                        type="button"
                        className="submit-btn"
                        style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}
                        onClick={() => landingFileInputRef.current?.click()}
                        disabled={uploadingLandingImage}
                      >
                        {uploadingLandingImage ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : <><Upload size={16} /> Upload Background Photo</>}
                      </button>

                      {landingImages.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)' }}>
                          No background photos yet — the Home page will show a plain gradient until you upload some.
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '14px' }}>
                          {landingImages.map(img => (
                            <div key={img.id} style={{ position: 'relative', borderRadius: 'var(--radius-sm)', overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '16 / 10' }}>
                              <img src={img.imageUrl} alt="Home background" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                              <button
                                type="button"
                                onClick={() => handleDeleteLandingImage(img.id)}
                                title="Remove"
                                style={{
                                  position: 'absolute', top: '8px', right: '8px',
                                  width: '28px', height: '28px', borderRadius: '50%',
                                  background: 'rgba(0,0,0,0.6)', color: 'white', border: 'none',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                                }}
                              >
                                <Trash size={13} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="card" style={{ marginTop: '20px' }}>
                    <div className="card-header">
                      <div className="card-title">{editingAnnouncementId ? 'Edit Announcement' : 'New Announcement'}</div>
                    </div>
                    <div className="card-body">
                      <form onSubmit={handleSaveAnnouncement}>
                        <div className="form-group">
                          <label className="form-label">Title</label>
                          <input
                            className="form-control"
                            type="text"
                            placeholder="e.g., New Estrus Synchronization Protocol Released"
                            value={newAnnouncementForm.title}
                            onChange={e => setNewAnnouncementForm({ ...newAnnouncementForm, title: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Body</label>
                          <textarea
                            className="form-control"
                            style={{ minHeight: '90px' }}
                            placeholder="Write the announcement text…"
                            value={newAnnouncementForm.body}
                            onChange={e => setNewAnnouncementForm({ ...newAnnouncementForm, body: e.target.value })}
                            required
                          ></textarea>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Photo <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
                          <input
                            ref={announcementFileInputRef}
                            type="file"
                            accept="image/*"
                            style={{ display: 'none' }}
                            onChange={handleAnnouncementFileChange}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <button
                              type="button"
                              className="submit-btn"
                              style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
                              onClick={() => announcementFileInputRef.current?.click()}
                              disabled={uploadingAnnouncementImage}
                            >
                              {uploadingAnnouncementImage ? <><Loader2 size={16} className="animate-spin" /> Uploading…</> : <><Upload size={16} /> {newAnnouncementForm.imageUrl ? 'Replace Photo' : 'Upload Photo'}</>}
                            </button>
                            {isValidImageUrl(newAnnouncementForm.imageUrl) && (
                              <img src={newAnnouncementForm.imageUrl} alt="Preview" style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', border: '1px solid var(--border)' }} />
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button className="submit-btn" style={{ flex: 1 }} type="submit" disabled={savingAnnouncement}>
                            {savingAnnouncement ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : (editingAnnouncementId ? 'Save Changes' : '+ Post Announcement')}
                          </button>
                          {editingAnnouncementId && (
                            <button
                              className="submit-btn"
                              style={{ flex: 1, background: 'var(--text-muted)' }}
                              type="button"
                              onClick={resetAnnouncementForm}
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </form>

                      {announcements.length > 0 && (
                        <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {announcements.map(a => (
                            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                              {isValidImageUrl(a.imageUrl || undefined) ? (
                                <img src={a.imageUrl || ''} alt={a.title} style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: '44px', height: '44px', borderRadius: 'var(--radius-sm)', background: 'var(--cream)', flexShrink: 0 }} />
                              )}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.body}</div>
                              </div>
                              <button className="table-action" onClick={() => handleEditAnnouncementClick(a)} title="Edit">
                                <Pencil size={14} />
                              </button>
                              <button className="table-action" onClick={() => handleDeleteAnnouncement(a.id)} title="Delete">
                                <Trash size={14} style={{ color: '#cf1322' }} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
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
                        <div style={{ borderTop: '1px solid var(--border)', margin: '20px 0 16px', paddingTop: '16px', fontWeight: 700, fontSize: '14px' }}>
                          🎓 Certificate Design
                        </div>
                        <div className="form-group">
                          <label className="form-label">Certificate Title</label>
                          <input
                            className="form-control"
                            type="text"
                            value={settings.certTitleText}
                            onChange={e => setSettings({ ...settings, certTitleText: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Attendance Statement</label>
                          <input
                            className="form-control"
                            type="text"
                            value={settings.certBodyText}
                            onChange={e => setSettings({ ...settings, certBodyText: e.target.value })}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Footer / Organization Line</label>
                          <input
                            className="form-control"
                            type="text"
                            value={settings.certClosingText}
                            onChange={e => setSettings({ ...settings, certClosingText: e.target.value })}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '16px' }}>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Primary Color</label>
                            <input
                              className="form-control"
                              type="color"
                              style={{ height: '40px', padding: '4px' }}
                              value={settings.certPrimaryColor}
                              onChange={e => setSettings({ ...settings, certPrimaryColor: e.target.value })}
                            />
                          </div>
                          <div className="form-group" style={{ flex: 1 }}>
                            <label className="form-label">Accent Color</label>
                            <input
                              className="form-control"
                              type="color"
                              style={{ height: '40px', padding: '4px' }}
                              value={settings.certAccentColor}
                              onChange={e => setSettings({ ...settings, certAccentColor: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Custom Background (optional — replaces the border/logo layout)</label>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {settings.certBackgroundImage && (
                              <img
                                src={settings.certBackgroundImage}
                                alt="Certificate background"
                                style={{ width: '80px', height: '56px', objectFit: 'cover', borderRadius: '6px', border: '1px solid var(--border)' }}
                              />
                            )}
                            <input
                              ref={certBgFileInputRef}
                              type="file"
                              accept="image/*"
                              style={{ display: 'none' }}
                              onChange={handleCertBackgroundFileChange}
                            />
                            <button
                              type="button"
                              className="btn"
                              onClick={() => certBgFileInputRef.current?.click()}
                              disabled={uploadingCertBg}
                            >
                              {uploadingCertBg ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
                            </button>
                            {settings.certBackgroundImage && (
                              <button type="button" className="btn" onClick={handleRemoveCertBackground}>Remove</button>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                          <button type="submit" className="btn btn-primary" disabled={savingSettings} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                            {savingSettings ? <><Loader2 size={16} className="animate-spin" /> Saving…</> : 'Save Settings'}
                          </button>
                          <button
                            type="button"
                            className="btn"
                            onClick={() => {
                              const sampleMeeting: Meeting = { id: 0, title: 'Sample Seminar', host: 'Dr. Jane Doe', dateTime: '', status: 'Ended', registrants: 0, videoLink: '', minutes: '', recordingUrl: '' };
                              handleDownloadCertificate(sampleMeeting, currentUser?.name || 'Preview User', settings);
                            }}
                          >
                            Preview Certificate
                          </button>
                        </div>
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
              background: 'var(--brown-dark, #16213e)',
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
              <div style={{ color: 'var(--cream, #eef2fc)', fontWeight: 600, fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <div className="meeting-modal-video" style={{ background: '#111', height: '480px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', position: 'relative' }}>
              {activeMeeting.status === 'Ended' ? (
                <>
                  <div style={{ fontSize: '60px' }}>{activeMeeting.recordingUrl ? '🎬' : '📼'}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', fontWeight: 500, textAlign: 'center', maxWidth: '380px' }}>
                    {activeMeeting.recordingUrl
                      ? 'A recording of this session is available.'
                      : 'No recording has been uploaded for this session yet.'}
                    <br />You can reopen the session room to review it — camera &amp; mic start muted.
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {activeMeeting.recordingUrl && (
                      <a
                        href={activeMeeting.recordingUrl}
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
                        ▶ Watch Recording
                      </a>
                    )}
                    <a
                      href={`${activeMeeting.videoLink}#config.startWithAudioMuted=true&config.startWithVideoMuted=true`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '10px 24px',
                        background: activeMeeting.recordingUrl ? 'rgba(255,255,255,0.08)' : 'var(--amber)',
                        border: activeMeeting.recordingUrl ? '1px solid rgba(255,255,255,0.15)' : 'none',
                        borderRadius: '8px',
                        color: activeMeeting.recordingUrl ? 'var(--cream)' : 'var(--brown-dark)',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '14px'
                      }}
                    >
                      Reopen Session Room (Muted)
                    </a>
                  </div>
                </>
              ) : (
                <div id="jaas-container" style={{ width: '100%', height: '100%' }}></div>
              )}
            </div>
            {activeMeeting.status === 'Ended' && (
              <div style={{ padding: '18px 24px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.08)', maxHeight: '260px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ color: 'var(--cream, #eef2fc)', fontWeight: 700, fontSize: '14px' }}>📝 Meeting Minutes</div>
                  {activeMeeting.minutes && (
                    <button
                      onClick={() => handleDownloadMinutes(activeMeeting)}
                      style={{ padding: '6px 14px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '6px', color: 'var(--cream)', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
                    >
                      Download PDF
                    </button>
                  )}
                </div>
                {currentUser?.role === 'Admin' ? (
                  <>
                    <textarea
                      className="form-control"
                      style={{ minHeight: '120px', background: 'rgba(255,255,255,0.05)', color: 'var(--cream)', border: '1px solid rgba(255,255,255,0.15)' }}
                      placeholder="Write the minutes for this session (Markdown supported — e.g. **bold**, - bullet points)…"
                      value={minutesDraft}
                      onChange={e => setMinutesDraft(e.target.value)}
                    ></textarea>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                      <button
                        onClick={handleSaveMinutes}
                        disabled={savingMinutes}
                        style={{ padding: '8px 20px', background: 'var(--amber)', border: 'none', borderRadius: '8px', color: 'var(--brown-dark)', cursor: savingMinutes ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {savingMinutes ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save Minutes'}
                      </button>
                    </div>
                  </>
                ) : activeMeeting.minutes ? (
                  <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', lineHeight: 1.6 }}>
                    <ReactMarkdown>{activeMeeting.minutes}</ReactMarkdown>
                  </div>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '13px', fontStyle: 'italic' }}>
                    No minutes have been posted for this session yet.
                  </div>
                )}
              </div>
            )}
            {activeMeeting.status !== 'Ended' && (
              <div className="meeting-modal-footer" style={{ padding: '16px 24px', display: 'flex', gap: '12px', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.1)' }}>
                <button
                  className="meeting-footer-btn"
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleAudio')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  🎙️ Toggle Mic
                </button>
                <button
                  className="meeting-footer-btn"
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleVideo')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  📷 Toggle Camera
                </button>
                <button
                  className="meeting-footer-btn"
                  onClick={() => jitsiApiRef.current?.executeCommand('toggleChat')}
                  style={{ padding: '8px 20px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: 'var(--cream)', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}
                >
                  💬 Toggle Chat
                </button>
                <button
                  className="meeting-footer-btn"
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

      {/* Cattle Herd Registry */}
      {cattleModalOpen && (
        <div className="confirm-overlay" onClick={() => { setCattleModalOpen(false); resetCattleForm(); }}>
          <div className="confirm-box" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <div className="confirm-message" style={{ fontWeight: 700, marginBottom: '14px' }}>
              🐄 Herd Registry
            </div>
            <form onSubmit={handleSaveCattle} style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <input
                className="form-control"
                type="text"
                placeholder="Cattle ID (required)"
                style={{ flex: '1 1 140px' }}
                value={newCattleForm.tagId}
                onChange={e => setNewCattleForm({ ...newCattleForm, tagId: e.target.value })}
                required
              />
              <input
                className="form-control"
                type="text"
                placeholder="Breed (optional)"
                style={{ flex: '1 1 120px' }}
                value={newCattleForm.breed}
                onChange={e => setNewCattleForm({ ...newCattleForm, breed: e.target.value })}
              />
              <input
                className="form-control"
                type="text"
                placeholder="Notes (optional)"
                style={{ flex: '1 1 120px' }}
                value={newCattleForm.notes}
                onChange={e => setNewCattleForm({ ...newCattleForm, notes: e.target.value })}
              />
              <button type="submit" className="submit-btn" style={{ margin: 0, flex: '0 0 auto' }}>
                {editingCattleId ? 'Save Changes' : '+ Add Cattle'}
              </button>
              {editingCattleId && (
                <button type="button" className="table-action" style={{ flex: '0 0 auto' }} onClick={resetCattleForm}>
                  Cancel
                </button>
              )}
            </form>
            <div style={{ maxHeight: '340px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cattle ID</th>
                    <th>Breed</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cattleList.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>No cattle registered yet.</td></tr>
                  ) : cattleList.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 600 }}>{c.tagId}</td>
                      <td>{c.breed || '—'}</td>
                      <td>
                        {c.isReady === true ? (
                          <span style={{ color: '#52c41a', fontSize: '12px', fontWeight: 600 }}>✓ Ready for Breeding</span>
                        ) : c.isReady === false ? (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Not Ready</span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Not Yet Assessed</span>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button className="table-action" onClick={() => handleEditCattleClick(c)}>
                            <Pencil size={14} />
                          </button>
                          <button className="table-action" onClick={() => handleDeleteCattle(c.id, c.tagId)}>
                            <Trash size={14} style={{ color: '#cf1322' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="confirm-actions" style={{ marginTop: '16px' }}>
              <button className="confirm-btn confirm-btn-cancel" onClick={() => { setCattleModalOpen(false); resetCattleForm(); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Seminar Certificate Management (Admin) */}
      {certModalOpen && certModalMeeting && (
        <div className="confirm-overlay" onClick={() => setCertModalOpen(false)}>
          <div className="confirm-box" style={{ maxWidth: '560px' }} onClick={e => e.stopPropagation()}>
            <div className="confirm-message" style={{ fontWeight: 700, marginBottom: '14px' }}>
              🎓 Certificates — {certModalMeeting.title}
            </div>
            <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Attended</th>
                    <th>Certificate</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map(u => {
                    const row = certAttendanceRows[u.id];
                    const seconds = row?.secondsAttended || 0;
                    const granted = row?.granted || false;
                    const eligible = row?.eligible || false;
                    return (
                      <tr key={u.id}>
                        <td>{u.name}</td>
                        <td>{Math.floor(seconds / 60)} min</td>
                        <td>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            {granted ? (
                              <button className="table-action" onClick={() => handleToggleCertificate(u.id, true)}>Revoke</button>
                            ) : eligible ? (
                              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>✓ Earned</span>
                            ) : (
                              <button className="table-action" onClick={() => handleToggleCertificate(u.id, false)}>Grant</button>
                            )}
                            {(granted || eligible) && (
                              <button className="table-action" onClick={() => handleDownloadCertificate(certModalMeeting, u.name)}>
                                Download
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="confirm-actions" style={{ marginTop: '16px' }}>
              <button className="confirm-btn confirm-btn-cancel" onClick={() => setCertModalOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
</div>
  );
}
