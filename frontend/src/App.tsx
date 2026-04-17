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
  Venus,
  Activity,
  Syringe,
  Layers,
  ArrowLeft,
  Stethoscope,
  LogIn,
  UserPlus,
  Phone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import axios from 'axios';
import { cn } from './lib/utils';
import { MODULES, LearningModule } from './constants';
import logoUrl from './assets/logo-transparent.png';

const IconMap: Record<string, React.ElementType> = {
  Venus,
  Activity,
  Syringe,
  Layers,
  Stethoscope
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'home' | 'learn' | 'chat' | 'login' | 'register'>('home');
  const [selectedModule, setSelectedModule] = useState<LearningModule | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<{ name: string, email: string } | null>(null);

  // Chat State
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: 'Hello! I am the PHILSAR AI Assistant. How can I help you today?' }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth Forms State
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    // Check locally stored user on mount
    const storedUser = localStorage.getItem('philsar_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('philsar_user');
    setIsAuthenticated(false);
    setUser(null);
    setActiveTab('home');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        email: authForm.email,
        password: authForm.password
      });
      localStorage.setItem('philsar_user', JSON.stringify(response.data.user));
      setUser(response.data.user);
      setIsAuthenticated(true);
      setActiveTab('home');
      setAuthForm({ name: '', email: '', password: '' });
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
      const response = await axios.post('http://localhost:5000/api/auth/register', {
        name: authForm.name,
        email: authForm.email,
        password: authForm.password
      });
      localStorage.setItem('philsar_user', JSON.stringify(response.data.user));
      setUser(response.data.user);
      setIsAuthenticated(true);
      setActiveTab('home');
      setAuthForm({ name: '', email: '', password: '' });
    } catch (error: any) {
      setAuthError(error.response?.data?.message || 'Registration failed. User may already exist.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isChatLoading) return;

    const userMsg = inputMessage.trim();
    setInputMessage('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);

    try {
      const response = await axios.post('http://localhost:5000/api/chat/ask', { message: userMsg });
      const assistantMsg = response.data?.response || "I'm sorry, I couldn't process that request.";
      setChatMessages(prev => [...prev, { role: 'assistant', content: assistantMsg }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error connecting to the server. Please try again later." }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const renderHome = () => (
    <div className="space-y-8 animate-in fade-in duration-700">
      <section className="relative h-[400px] rounded-3xl overflow-hidden bg-emerald-900 flex items-center px-8 md:px-16">
        <div className="absolute inset-0 opacity-30">
          <img
            src="https://images.unsplash.com/photo-1570158268183-d296b2892211?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80"
            alt="Cattle"
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
        </div>
        <div className="relative z-10 max-w-2xl space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white leading-tight drop-shadow-md">
            Philippine Society <br className="hidden md:block" /> of Animal <span className="text-emerald-400">Reproduction</span>
          </h1>
          <p className="text-lg text-emerald-50/90 font-medium max-w-xl">
            A society borne by science, shaped by species, and driven by service.
          </p>
          <div className="flex gap-4 flex-wrap">
            <button
              onClick={() => setActiveTab('learn')}
              className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-white rounded-full font-semibold transition-all flex items-center gap-2"
            >
              Start Learning <ChevronRight size={20} />
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white border border-white/20 rounded-full font-semibold transition-all"
            >
              Ask AI Assistant
            </button>
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        <div className="p-8 bg-white rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-6">
            <BookOpen size={24} />
          </div>
          <h3 className="text-xl font-bold mb-3">Structured Modules</h3>
          <p className="text-gray-600">Comprehensive guides on anatomy, physiology, and modern breeding techniques.</p>
        </div>
        <div className="p-8 bg-white rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-6">
            <MessageSquare size={24} />
          </div>
          <h3 className="text-xl font-bold mb-3">AI Consultation</h3>
          <p className="text-gray-600">Real-time answers to your complex questions about animal reproduction.</p>
        </div>
        <div className="p-8 bg-white rounded-3xl border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600 mb-6">
            <Stethoscope size={24} />
          </div>
          <h3 className="text-xl font-bold mb-3">Breeding Tech</h3>
          <p className="text-gray-600">Stay updated with AI, Embryo Transfer, and Synchronization protocols.</p>
        </div>
      </section>
    </div>
  );

  const renderLearn = () => (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold">Learning Modules</h2>
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search modules..."
            className="pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
          />
        </div>
      </div>

      {selectedModule ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm"
        >
          <button
            onClick={() => setSelectedModule(null)}
            className="mb-6 flex items-center gap-2 text-emerald-600 font-bold hover:text-emerald-700 transition-colors bg-emerald-50 px-4 py-2 rounded-full"
          >
            <ArrowLeft size={18} /> Back to Modules
          </button>
          <div className="prose prose-emerald max-w-none">
            <ReactMarkdown>{selectedModule.content}</ReactMarkdown>
          </div>
        </motion.div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          {MODULES.map((module) => {
            const Icon = IconMap[module.icon] || BookOpen;
            return (
              <motion.div
                key={module.id}
                whileHover={{ y: -4 }}
                onClick={() => setSelectedModule(module)}
                className="p-6 bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md cursor-pointer transition-all flex flex-col sm:flex-row gap-6"
              >
                <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0">
                  <Icon size={32} />
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-500 mb-2 block">
                    {module.category}
                  </span>
                  <h3 className="text-xl font-bold mb-2 text-slate-900">{module.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{module.description}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderChat = () => (
    <div className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-500">
      <div className="p-5 border-b border-gray-100 bg-emerald-50/50 flex items-center gap-4">
        <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-sm">
          <MessageSquare size={24} />
        </div>
        <div>
          <h3 className="font-bold text-lg text-slate-900">PHILSAR AI Assistant</h3>
          <p className="text-sm font-medium text-emerald-600">Online | Ready to answer questions</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#fafafa]">
        {chatMessages.map((msg, i) => (
          <div key={i} className={cn(
            "flex",
            msg.role === 'user' ? "justify-end" : "justify-start"
          )}>
            <div className={cn(
              "max-w-[85%] md:max-w-[75%] p-4 rounded-2xl shadow-sm",
              msg.role === 'user'
                ? "bg-emerald-600 text-white rounded-tr-sm"
                : "bg-white border border-gray-100 text-gray-800 rounded-tl-sm"
            )}>
              <div className={cn("text-[15px] leading-relaxed prose prose-sm max-w-none", msg.role === 'user' ? "prose-invert" : "prose-slate")}>
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
        {isChatLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-100 p-4 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-3">
              <Loader2 size={18} className="animate-spin text-emerald-600" />
              <span className="text-sm font-medium text-gray-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-white border-t border-gray-100">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask about AI, ET, or cattle anatomy..."
            className="flex-1 px-5 py-3.5 bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-medium"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isChatLoading}
            className="w-14 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full flex items-center justify-center disabled:opacity-50 transition-all shadow-sm"
          >
            <Send size={20} className="ml-1" />
          </button>
        </form>
      </div>
    </div>
  );

  const renderLogin = () => (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm animate-in slide-in-from-bottom-8 duration-500">
      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 mx-auto">
        <LogIn size={32} />
      </div>
      <h2 className="text-2xl font-bold text-center mb-2">Welcome Back</h2>
      <p className="text-gray-500 text-center mb-8 text-sm">Sign in to access advanced learning models and save your chat history.</p>

      {authError && (
        <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center border border-red-100">
          {authError}
        </div>
      )}

      <form onSubmit={handleLoginSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Email Address</label>
          <input
            type="email"
            required
            value={authForm.email}
            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            placeholder="example@gmail.com"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Password</label>
          <input
            type="password"
            required
            value={authForm.password}
            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={authLoading}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold mt-6 transition-all shadow-sm disabled:opacity-70 flex justify-center items-center"
        >
          {authLoading ? <Loader2 className="animate-spin" size={20} /> : 'Sign In'}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-gray-500 font-medium">
        Don't have an account? {' '}
        <button onClick={() => { setAuthError(''); setActiveTab('register') }} className="text-emerald-600 font-bold hover:underline">
          Create one now
        </button>
      </p>
    </div>
  );

  const renderRegister = () => (
    <div className="max-w-md mx-auto mt-12 bg-white rounded-3xl p-8 border border-gray-100 shadow-sm animate-in slide-in-from-bottom-8 duration-500">
      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-6 mx-auto">
        <UserPlus size={32} />
      </div>
      <h2 className="text-2xl font-bold text-center mb-2">Create Account</h2>
      <p className="text-gray-500 text-center mb-8 text-sm">Join PHILSAR to master cattle reproduction technologies with AI.</p>

      {authError && (
        <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-xl font-medium text-center border border-red-100">
          {authError}
        </div>
      )}

      <form onSubmit={handleRegisterSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Full Name</label>
          <input
            type="text"
            required
            value={authForm.name}
            onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            placeholder="James Kevin"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Email Address</label>
          <input
            type="email"
            required
            value={authForm.email}
            onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            placeholder="example@gmail.com"
          />
        </div>
        <div>
          <label className="block text-sm font-bold text-gray-700 mb-1.5 ml-1">Create Password</label>
          <input
            type="password"
            required
            value={authForm.password}
            onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm transition-all"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={authLoading}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold mt-6 transition-all shadow-sm disabled:opacity-70 flex justify-center items-center"
        >
          {authLoading ? <Loader2 className="animate-spin" size={20} /> : 'Create Account'}
        </button>
      </form>

      <p className="text-center mt-6 text-sm text-gray-500 font-medium">
        Already a member? {' '}
        <button onClick={() => { setAuthError(''); setActiveTab('login') }} className="text-emerald-600 font-bold hover:underline">
          Sign In
        </button>
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <button onClick={() => setActiveTab('home')} className="flex items-center gap-3 text-left group">
            <img
              src={logoUrl}
              alt="PHILSAR Logo"
              className="w-12 h-12 object-contain rounded-full shadow-sm border border-emerald-100 group-hover:shadow-md transition-shadow"
            />
            <div>
              <span className="font-bold text-xl tracking-tight block leading-none">PHILSAR</span>
              <span className="hidden md:block text-[10px] uppercase tracking-widest text-emerald-600 font-bold mt-1">Animal Reproduction</span>
            </div>
          </button>

          <div className="hidden md:flex items-center gap-8">
            {[
              { id: 'home', label: 'Home' },
              { id: 'learn', label: 'Learning Center' },
              { id: 'chat', label: 'AI Assistant' }
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as any)}
                className={cn(
                  "text-sm font-semibold transition-colors",
                  activeTab === item.id ? "text-emerald-600" : "text-gray-500 hover:text-emerald-500"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4">
            {!isAuthenticated ? (
              <button
                onClick={() => setActiveTab('login')}
                className="hidden md:block px-6 py-2 bg-emerald-600 text-white rounded-full text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm"
              >
                Join PHILSAR
              </button>
            ) : (
              <div className="hidden md:flex items-center gap-3">
                <span className="text-sm font-bold text-slate-700 bg-gray-100 px-3 py-1.5 rounded-full">
                  Hi, {user?.name?.split(' ')[0]}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-5 py-1.5 bg-red-50 text-red-600 border border-red-100 rounded-full text-sm font-bold hover:bg-red-100 transition-all"
                >
                  Logout
                </button>
              </div>
            )}

            <button
              className="md:hidden p-2 text-gray-600 bg-gray-50 rounded-lg hover:bg-gray-100"
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            >
              {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Sidebar */}
      <AnimatePresence>
        {isSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="fixed inset-0 bg-black/20 z-[60] backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: "spring", bounce: 0, duration: 0.4 }}
              className="fixed right-0 top-0 h-full w-72 bg-white z-[70] p-6 shadow-2xl flex flex-col"
            >
              <div className="flex justify-between items-center mb-8">
                <span className="font-bold text-lg text-emerald-600 tracking-tight">Menu</span>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-gray-100 rounded-full text-gray-500">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-4 flex-1">
                {[
                  { id: 'home', label: 'Home' },
                  { id: 'learn', label: 'Learning Center' },
                  { id: 'chat', label: 'AI Assistant' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }}
                    className={cn(
                      "text-left text-lg font-bold px-4 py-3 rounded-xl transition-colors",
                      activeTab === item.id ? "bg-emerald-50 text-emerald-600" : "text-gray-600 hover:bg-gray-50"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-auto border-t border-gray-100 pt-6">
                {!isAuthenticated ? (
                  <button
                    onClick={() => { setActiveTab('login'); setIsSidebarOpen(false); }}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-md transition-all"
                  >
                    Join PHILSAR
                  </button>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-bold text-gray-500 text-center uppercase tracking-wider">Signed in as</p>
                    <p className="text-center font-bold text-lg text-emerald-900 bg-emerald-50 py-3 rounded-xl">{user?.name}</p>
                    <button
                      onClick={() => { handleLogout(); setIsSidebarOpen(false); }}
                      className="w-full py-4 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold transition-all border border-red-100 mt-4"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 min-h-[60vh]">
        {activeTab === 'home' && renderHome()}
        {activeTab === 'learn' && renderLearn()}
        {activeTab === 'chat' && renderChat()}
        {activeTab === 'login' && renderLogin()}
        {activeTab === 'register' && renderRegister()}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 mt-20 py-12">
        <div className="max-w-7xl mx-auto px-4 grid md:grid-cols-4 gap-12">
          <div className="col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <img
                src={logoUrl}
                alt="PHILSAR Logo"
                className="w-10 h-10 object-contain rounded-full shadow-sm border border-emerald-100"
              />
              <span className="font-bold text-xl tracking-tight">PHILSAR</span>
            </div>
            <p className="text-gray-500 max-w-md font-medium leading-relaxed">
              The Philippine Society of Animal Reproduction (PHILSAR) is dedicated to the advancement of animal reproduction science and technology in the Philippines.
            </p>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-6">Quick Links</h4>
            <ul className="space-y-4 text-gray-500 text-sm font-medium">
              <li><button onClick={() => setActiveTab('home')} className="hover:text-emerald-600 transition-colors">Home</button></li>
              <li><button onClick={() => setActiveTab('learn')} className="hover:text-emerald-600 transition-colors">Learning Center</button></li>
              <li><button onClick={() => setActiveTab('chat')} className="hover:text-emerald-600 transition-colors">AI Assistant</button></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold text-gray-900 mb-6">Contact</h4>
            <ul className="space-y-4 text-gray-500 text-sm font-medium">
              <li className="flex items-center gap-3"><Info size={18} className="text-emerald-500" /> philsar.org@gmail.com</li>
              <li className="flex items-center gap-3"><Phone size={18} className="text-emerald-500" /> 0917 178 9002</li>
              <li className="flex items-center gap-3"><span className="w-4 h-4 bg-emerald-500 rounded-full inline-block"></span> Philippines</li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-12 pt-8 border-t border-gray-50 text-center text-gray-400 text-sm font-medium">
          © 2026 Philippine Society of Animal Reproduction (PHILSAR). All rights reserved.
        </div>
      </footer>
    </div>
  );
}
