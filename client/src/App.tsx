import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Users, 
  ClipboardList, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Plus, 
  LogOut, 
  ChevronRight, 
  Calendar,
  Menu,
  X,
  Trash2,
  Edit3,
  User as UserIcon,
  Bell,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Activity,
  MessageSquare,
  Send,
  CheckCheck,
  Shield
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie, 
  Legend,
  LineChart,
  Line
} from 'recharts';
import { 
  format, 
  formatDistanceToNow,
  parse,
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  addMonths, 
  subMonths,
  isToday,
  parseISO
} from 'date-fns';
import { cn, type User, type Task, type Role, type NoticeThread } from './types';
import { io } from 'socket.io-client';

type RequestOptions = {
  method?: string;
  body?: unknown;
};

type PaginatedResponse<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type AuditLogEntry = {
  id: number;
  actor_user_id: number | null;
  actor_username?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  status_code?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  details?: string | null;
  created_at: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const getPaginatedItems = <T,>(value: unknown): T[] | null => {
  if (!value || typeof value !== 'object' || !('items' in value)) {
    return null;
  }
  const maybeItems = (value as PaginatedResponse<T>).items;
  return Array.isArray(maybeItems) ? maybeItems : null;
};

const getPaginationMeta = (value: unknown): PaginationMeta | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const maybe = value as Partial<PaginatedResponse<unknown>>;
  if (
    typeof maybe.page === 'number' &&
    typeof maybe.limit === 'number' &&
    typeof maybe.total === 'number' &&
    typeof maybe.totalPages === 'number'
  ) {
    return {
      page: maybe.page,
      limit: maybe.limit,
      total: maybe.total,
      totalPages: maybe.totalPages,
    };
  }

  return null;
};

const toTasks = (value: unknown): Task[] => {
  if (Array.isArray(value)) return value as Task[];
  return getPaginatedItems<Task>(value) || [];
};

const toUsers = (value: unknown): User[] => {
  if (Array.isArray(value)) return value as User[];
  return getPaginatedItems<User>(value) || [];
};

const toNotices = (value: unknown): NoticeThread[] => {
  if (Array.isArray(value)) return value as NoticeThread[];
  return getPaginatedItems<NoticeThread>(value) || [];
};

const toAuditLogs = (value: unknown): AuditLogEntry[] => {
  if (Array.isArray(value)) return value as AuditLogEntry[];
  return getPaginatedItems<AuditLogEntry>(value) || [];
};

const parseAppDate = (value?: string | null): Date | null => {
  if (!value) return null;

  const iso = parseISO(value);
  if (!Number.isNaN(iso.getTime())) return iso;

  const fallback = new Date(value);
  if (!Number.isNaN(fallback.getTime())) return fallback;
  return null;
};

const toDateTimeLocalValue = (value?: string | null): string => {
  const parsed = parseAppDate(value);
  if (!parsed) return '';
  return format(parsed, "yyyy-MM-dd'T'HH:mm");
};

const formatDateTime = (value?: string | null, fallback = 'No deadline'): string => {
  const parsed = parseAppDate(value);
  if (!parsed) return fallback;

  const hasTime = typeof value === 'string' && value.includes('T');
  return format(parsed, hasTime ? 'MMM d, yyyy h:mm a' : 'MMM d, yyyy');
};

const formatTaskTime = (value?: string | null): string => {
  const parsed = parseAppDate(value);
  if (!parsed) return '--';
  return format(parsed, 'h:mm a');
};

const getUserInitials = (fullName?: string | null): string => {
  if (!fullName) return '?';
  const tokens = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return '?';
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] || ''}${tokens[1][0] || ''}`.toUpperCase();
};

const normalizeDateTimeInput = (value?: string | null): string => {
  const raw = (value || '').trim();
  if (!raw) return '';
  if (raw.includes('--')) return '';

  const compact = raw
    .replace(/[\u200e\u200f]/g, '')
    .replace(/\s*\/\s*/g, '/')
    .replace(/\s*:\s*/g, ':')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(compact)) {
    return compact;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(compact)) {
    return `${compact}T09:00`;
  }

  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(compact)) {
    const [month, day, year] = compact.split('/');
    const mm = month.padStart(2, '0');
    const dd = day.padStart(2, '0');
    return `${year}-${mm}-${dd}T09:00`;
  }

  const patternCandidates = [
    "MM/dd/yyyy, hh:mm a",
    "M/d/yyyy, h:mm a",
    "MM/dd/yyyy, HH:mm",
    "M/d/yyyy, H:mm",
  ];

  for (const pattern of patternCandidates) {
    const dt = parse(compact, pattern, new Date());
    if (!Number.isNaN(dt.getTime())) {
      return format(dt, "yyyy-MM-dd'T'HH:mm");
    }
  }

  // Fallback parser for locale-rendered variants where browser inserts
  // separators/spaces differently (observed in Firefox datetime controls).
  const numericParts = compact.match(/\d+/g);
  if (numericParts && numericParts.length >= 3) {
    let year = 0;
    let month = 0;
    let day = 0;
    let hour = numericParts.length >= 4 ? Number(numericParts[3]) : 9;
    let minute = numericParts.length >= 5 ? Number(numericParts[4]) : 0;
    const ampm = /\b(pm|am)\b/i.exec(compact)?.[1]?.toLowerCase();

    const first = Number(numericParts[0]);
    const second = Number(numericParts[1]);
    const third = Number(numericParts[2]);

    if (String(numericParts[0]).length === 4) {
      year = first;
      month = second;
      day = third;
    } else if (String(numericParts[2]).length === 4) {
      month = first;
      day = second;
      year = third;
    }

    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const isDateValid =
      year >= 1900 &&
      year <= 3000 &&
      month >= 1 &&
      month <= 12 &&
      day >= 1 &&
      day <= 31 &&
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59;

    if (isDateValid) {
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }

  const parsed = parseAppDate(compact);
  if (!parsed) return '';
  return format(parsed, "yyyy-MM-dd'T'HH:mm");
};

const splitDateTimeValue = (value?: string | null): { date: string; time: string } => {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) {
    return { date: '', time: '09:00' };
  }
  const [date, time] = normalized.split('T');
  return {
    date: date || '',
    time: time || '09:00',
  };
};

const combineDateTimeParts = (datePart?: string | null, timePart?: string | null): string => {
  const date = (datePart || '').trim();
  if (!date) return '';
  const time = (timePart || '09:00').trim() || '09:00';
  return `${date}T${time}`;
};

const useDebouncedValue = <T,>(value: T, delayMs = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
};

const isUserShape = (value: unknown): value is User => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<User>;
  return (
    typeof candidate.id === 'number' &&
    typeof candidate.username === 'string' &&
    typeof candidate.role === 'string' &&
    typeof candidate.full_name === 'string'
  );
};

const readCookie = (name: string): string | null => {
  const prefix = `${name}=`;
  const parts = document.cookie.split(';').map((part) => part.trim());
  const hit = parts.find((part) => part.startsWith(prefix));
  return hit ? decodeURIComponent(hit.slice(prefix.length)) : null;
};

async function apiRequest<T = unknown>(url: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const init: RequestInit = {
    method,
    credentials: 'include',
  };

  if (typeof options.body !== 'undefined') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfToken = readCookie('csrf_token');
    if (csrfToken) {
      init.headers = {
        ...(init.headers || {}),
        'x-csrf-token': csrfToken,
      };
    }
  }

  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') || '';
  if (url.startsWith('/api/') && !contentType.includes('application/json')) {
    throw new Error('Invalid API response. Please ensure backend is running and service worker cache is cleared.');
  }

  const raw = await response.text();

  let data: unknown = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (data as { error?: unknown }).error === 'string'
        ? (data as { error: string }).error
        : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data as T;
}

// --- Components ---

const Badge = ({ children, variant = 'default', className }: { children: React.ReactNode, variant?: 'default' | 'urgent' | 'high' | 'normal' | 'low' | 'completed' | 'in_progress' | 'pending' | 'assigned' | 'created', className?: string }) => {
  const variants = {
    default: 'bg-zinc-100 text-zinc-800',
    urgent: 'bg-red-100 text-red-700 border-red-200',
    high: 'bg-orange-100 text-orange-700 border-orange-200',
    normal: 'bg-blue-100 text-blue-700 border-blue-200',
    low: 'bg-slate-100 text-slate-700 border-slate-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    in_progress: 'bg-amber-100 text-amber-700 border-amber-200',
    pending: 'bg-zinc-100 text-zinc-600 border-zinc-200',
    assigned: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    created: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  };
  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border", variants[variant as keyof typeof variants] || variants.default, className)}>
      {children}
    </span>
  );
};

const ProgressBar = ({ progress, className }: { progress: number, className?: string }) => {
  return (
    <div className={cn("w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden", className)}>
      <motion.div 
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className={cn(
          "h-full transition-all",
          progress === 100 ? "bg-emerald-500" : progress > 50 ? "bg-blue-500" : "bg-amber-500"
        )}
      />
    </div>
  );
};

const PaginationControls = ({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  className?: string;
}) => {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : Math.min(total, page * pageSize);

  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 bg-white border border-zinc-100 rounded-2xl shadow-sm", className)}>
      <p className="text-xs text-zinc-500 font-semibold">
        Showing <span className="text-zinc-900">{from}-{to}</span> of <span className="text-zinc-900">{total}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Page Size</label>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="px-2 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 text-xs font-semibold focus:outline-none focus:border-zinc-900"
        >
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={20}>20</option>
          <option value={50}>50</option>
        </select>
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
            page <= 1 ? "border-zinc-100 text-zinc-300 cursor-not-allowed" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
          )}
        >
          Prev
        </button>
        <span className="text-xs font-semibold text-zinc-600 min-w-[70px] text-center">
          Page {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors",
            page >= totalPages ? "border-zinc-100 text-zinc-300 cursor-not-allowed" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
          )}
        >
          Next
        </button>
      </div>
    </div>
  );
};

const NotificationToast = ({ notifications }: { notifications: any[] }) => {
  const getIcon = (type: string) => {
    switch (type) {
      case 'task_created': return <Plus size={18} className="text-emerald-400" />;
      case 'task_status_updated': return <CheckCircle2 size={18} className="text-amber-400" />;
      case 'task_reminder': return <Bell size={18} className="text-red-400" />;
      case 'task_reminder_updated': return <Bell size={18} className="text-blue-400" />;
      case 'task_updated': return <Edit3 size={18} className="text-blue-400" />;
      case 'task_deleted': return <Trash2 size={18} className="text-red-400" />;
      case 'subtask_updated': return <ClipboardList size={18} className="text-indigo-400" />;
      default: return <AlertCircle size={18} className="text-zinc-400" />;
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] space-y-2 pointer-events-none">
      <AnimatePresence>
        {notifications.map((n, i) => (
          <motion.div
            key={i + n.timestamp}
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="bg-zinc-900 text-white p-4 rounded-2xl shadow-2xl flex items-center gap-3 min-w-[300px] pointer-events-auto border border-white/10"
          >
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              {getIcon(n.type)}
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">{n.type.replace('_', ' ')}</p>
              <p className="text-sm font-medium">{n.message}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

const ConfirmationDialog = ({ 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  confirmText = "Delete", 
  confirmVariant = "danger" 
}: { 
  title: string, 
  message: string, 
  onConfirm: () => void, 
  onCancel: () => void,
  confirmText?: string,
  confirmVariant?: 'danger' | 'primary'
}) => {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[110] p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-zinc-100 p-8"
      >
        <h3 className="text-xl font-bold mb-2">{title}</h3>
        <p className="text-zinc-500 text-sm mb-8">{message}</p>
        <div className="flex gap-3">
          <button 
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className={cn(
              "flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all",
              confirmVariant === 'danger' ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"
            )}
          >
            {confirmText}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'users' | 'tasks' | 'notices' | 'auditLogs' | 'calendar' | 'analytics' | 'profile'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      setNotificationPermission('unsupported');
      return;
    }

    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  };

  const handleInstallApp = async () => {
    if (!installPromptEvent) return;
    await installPromptEvent.prompt();
    const choice = await installPromptEvent.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPromptEvent(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    const socket = io({
      withCredentials: true,
    });

    socket.on('task_notification', (notif) => {
      setNotifications(prev => [notif, ...prev].slice(0, 5));
      
      // Browser push notification
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification("TaskFlow Pro", {
          body: notif.message,
          icon: 'https://cdn-icons-png.flaticon.com/512/2098/2098402.png'
        });
      }

      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n !== notif));
      }, 5000);
    });

    socket.on('connect_error', () => {
      // Keep UI usable even when realtime channel is unavailable.
    });

    return () => { socket.disconnect(); };
  }, [user]);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setInstallPromptEvent(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    const currentPath = window.location.pathname;
    const allowedPaths = new Set(['/', '/login']);
    if (!allowedPaths.has(currentPath)) {
      window.history.replaceState({}, '', '/');
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const me = await apiRequest<unknown>('/api/auth/me');
        if (isUserShape(me)) {
          setUser(me);
          await apiRequest('/api/auth/csrf');
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, []);

  if (loading) return <div className="h-screen w-screen flex items-center justify-center bg-zinc-50 font-mono text-xs uppercase tracking-widest">Initialising...</div>;

  if (!user) return <Login onLogin={setUser} />;

  const navigateTo = (
    nextView: 'dashboard' | 'users' | 'tasks' | 'notices' | 'auditLogs' | 'calendar' | 'analytics' | 'profile',
  ) => {
    setView(nextView);
    setSidebarOpen(false);
  };

  return (
    <div className="flex min-h-screen lg:h-screen bg-[#F5F5F5] text-zinc-900 font-sans overflow-hidden">
      <NotificationToast notifications={notifications} />
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu overlay"
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
        />
      )}
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-64 bg-white border-r border-zinc-200 flex flex-col transform transition-transform duration-200 max-h-screen",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="p-6 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center text-white">
              <ClipboardList size={18} />
            </div>
            <h1 className="font-bold tracking-tight text-lg">TaskFlow <span className="text-zinc-400 font-normal">Pro</span></h1>
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
              className="ml-auto lg:hidden p-2 rounded-lg text-zinc-500 hover:bg-zinc-100"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <NavItem 
            active={view === 'dashboard'} 
            onClick={() => navigateTo('dashboard')} 
            icon={<LayoutDashboard size={18} />} 
            label="Overview" 
          />
          <NavItem 
            active={view === 'tasks'} 
            onClick={() => navigateTo('tasks')} 
            icon={<ClipboardList size={18} />} 
            label="Tasks" 
          />
          <NavItem 
            active={view === 'notices'} 
            onClick={() => navigateTo('notices')} 
            icon={<MessageSquare size={18} />} 
            label="Notice Board" 
          />
          <NavItem 
            active={view === 'calendar'} 
            onClick={() => navigateTo('calendar')} 
            icon={<Calendar size={18} />} 
            label="Calendar" 
          />
          {(user.role === 'sysAdmin' || user.role === 'manager') && (
            <NavItem 
              active={view === 'analytics'} 
              onClick={() => navigateTo('analytics')} 
              icon={<BarChart3 size={18} />} 
              label="Analytics" 
            />
          )}
          {user.role === 'sysAdmin' && (
            <>
              <NavItem 
                active={view === 'users'} 
                onClick={() => navigateTo('users')} 
                icon={<Users size={18} />} 
                label="User Management" 
              />
              <NavItem
                active={view === 'auditLogs'}
                onClick={() => navigateTo('auditLogs')}
                icon={<Shield size={18} />}
                label="Audit Logs"
              />
            </>
          )}
          <NavItem 
            active={view === 'profile'} 
            onClick={() => navigateTo('profile')} 
            icon={<UserIcon size={18} />} 
            label="Profile" 
          />
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 mb-4">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.full_name}
                className="w-10 h-10 rounded-full object-cover border border-zinc-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-zinc-200 flex items-center justify-center font-bold text-zinc-600">
                {user?.full_name?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user?.full_name || 'User'}</p>
              <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">{user?.role}</p>
            </div>
          </div>
          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <button
              onClick={requestNotificationPermission}
              className="w-full mb-3 p-2.5 rounded-xl bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors"
            >
              Enable Browser Notifications
            </button>
          )}
          {installPromptEvent && (
            <button
              onClick={handleInstallApp}
              className="w-full mb-3 p-2.5 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
            >
              Install TaskFlow App
            </button>
          )}
          <button 
            onClick={async () => {
              try {
                await apiRequest('/api/auth/logout', { method: 'POST' });
              } catch {
                // Ignore logout transport errors and still clear local session state.
              }
              setSidebarOpen(false);
              setUser(null);
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-zinc-500 hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="lg:hidden sticky top-0 z-30 bg-[#F5F5F5]/95 backdrop-blur border-b border-zinc-200 px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg bg-white border border-zinc-200 text-zinc-700"
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <p className="text-sm font-bold tracking-tight">TaskFlow Pro</p>
          <div className="w-8 h-8 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600">
            {user.full_name?.charAt(0) || '?'}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <AnimatePresence mode="wait">
            {view === 'dashboard' && <DashboardView key="dashboard" user={user} />}
            {view === 'users' && <UserManagementView key="users" user={user} />}
            {view === 'tasks' && <TasksView key="tasks" user={user} />}
            {view === 'notices' && <NoticeBoardView key="notices" user={user} />}
            {view === 'auditLogs' && <AuditLogsView key="auditLogs" user={user} />}
            {view === 'calendar' && <CalendarView key="calendar" user={user} />}
            {view === 'analytics' && <AnalyticsView key="analytics" user={user} />}
            {view === 'profile' && <ProfileView key="profile" user={user} onUserUpdate={setUser} />}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium transition-all",
        active ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" : "text-zinc-500 hover:bg-zinc-100"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// --- Views ---

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaChallenge, setCaptchaChallenge] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      const data = await apiRequest<{ challenge?: string }>('/api/auth/captcha');
      setCaptchaChallenge(typeof data?.challenge === 'string' ? data.challenge : '');
      setCaptchaAnswer('');
    } catch {
      setCaptchaChallenge('');
      setError('Failed to load CAPTCHA. Please refresh and try again.');
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const loggedInUser = await apiRequest<User>('/api/auth/login', {
        method: 'POST',
        body: { username, password, captchaAnswer },
      });
      onLogin(loggedInUser);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
      loadCaptcha();
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 bg-white rounded-3xl shadow-xl border border-zinc-100"
      >
        <div className="mb-8 text-center">
          <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white mx-auto mb-4">
            <ClipboardList size={24} />
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-zinc-400 text-sm">Sign in to manage your tasks</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 ml-1">Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
              placeholder="Enter your username"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-1.5 ml-1">Password</label>
            <input 
              type="password" 
              value={password} 
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
              placeholder="••••••••"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5 ml-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-400">CAPTCHA</label>
              <button
                type="button"
                onClick={loadCaptcha}
                className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-900"
              >
                Refresh
              </button>
            </div>
            <div className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold text-zinc-700 mb-2">
              {captchaLoading ? 'Loading challenge...' : (captchaChallenge || 'Challenge unavailable')}
            </div>
            <input
              type="text"
              value={captchaAnswer}
              onChange={e => setCaptchaAnswer(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
              placeholder="Type answer"
              required
            />
          </div>
          {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
          <button 
            type="submit"
            disabled={captchaLoading || !captchaChallenge}
            className="w-full py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            Sign In
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-zinc-50 text-center">
          <p className="text-xs text-zinc-400">Contact sysAdmin for account creation</p>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileView({ user, onUserUpdate }: { user: User, onUserUpdate: (next: User) => void, key?: string }) {
  const [fullName, setFullName] = useState(user.full_name || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(user.avatar_url || null);
  const [profileError, setProfileError] = useState('');
  const [profileSuccess, setProfileSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setFullName(user.full_name || '');
    setEmail(user.email || '');
    setAvatarUrl(user.avatar_url || null);
  }, [user]);

  const handleAvatarUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setProfileError('Please upload an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError('');
    setProfileSuccess('');

    try {
      const payload = {
        full_name: fullName.trim(),
        email: email.trim() || null,
        avatar_url: avatarUrl || null,
      };

      let updated: User;
      try {
        updated = await apiRequest<User>('/api/users/me/profile', {
          method: 'PUT',
          body: payload,
        });
      } catch (firstError) {
        const firstMessage = firstError instanceof Error ? firstError.message : '';
        if (!firstMessage.includes('404')) {
          throw firstError;
        }
        try {
          updated = await apiRequest<User>('/api/users/me/profile', {
            method: 'PATCH',
            body: payload,
          });
        } catch (secondError) {
          const secondMessage = secondError instanceof Error ? secondError.message : '';
          if (!secondMessage.includes('404')) {
            throw secondError;
          }
          updated = await apiRequest<User>('/api/auth/me/profile', {
            method: 'PUT',
            body: payload,
          });
        }
      }

      onUserUpdate(updated);
      setProfileSuccess('Profile updated successfully');
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    try {
      await apiRequest('/api/users/me/password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Profile Settings</h2>
        <p className="text-zinc-500">Manage your account information and security.</p>
      </header>

      <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm space-y-8">
        <div className="flex items-center gap-6">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user.full_name}
              className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-sm"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center text-2xl font-bold text-zinc-400 border-4 border-white shadow-sm">
              {user.full_name.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="text-xl font-bold">{user.full_name}</h3>
            <p className="text-zinc-400 font-mono text-sm">@{user.username}</p>
            <Badge variant={user.role === 'sysAdmin' ? 'high' : user.role === 'manager' ? 'normal' : 'low'} className="mt-2">
              {user.role}
            </Badge>
          </div>
        </div>

        <div className="pt-8 border-t border-zinc-50">
          <h4 className="text-lg font-bold mb-6">Profile Information</h4>
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Full Name</label>
                <input
                  required
                  type="text"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Email</label>
                <input
                  type="email"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@company.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Profile Picture</label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="text-xs text-zinc-500"
                />
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl(null)}
                    className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-zinc-50"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>
            {profileError && <p className="text-red-500 text-xs font-medium">{profileError}</p>}
            {profileSuccess && <p className="text-emerald-500 text-xs font-medium">{profileSuccess}</p>}
            <button
              type="submit"
              className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
            >
              Save Profile
            </button>
          </form>
        </div>

        <div className="pt-8 border-t border-zinc-50">
          <h4 className="text-lg font-bold mb-6">Change Password</h4>
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Current Password</label>
              <input 
                required
                type="password"
                className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">New Password</label>
                <input 
                  required
                  type="password"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Confirm New Password</label>
                <input 
                  required
                  type="password"
                  className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
            {success && <p className="text-emerald-500 text-xs font-medium">{success}</p>}
            <button 
              type="submit"
              className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>
    </motion.div>
  );
}

function AnalyticsView({ user: _user }: { user: User, key?: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        const summary = await apiRequest<any>('/api/analytics/summary');
        setData({
          statusStats: Array.isArray(summary?.statusStats) ? summary.statusStats : [],
          priorityStats: Array.isArray(summary?.priorityStats) ? summary.priorityStats : [],
          overdueCount: typeof summary?.overdueCount === 'number' ? summary.overdueCount : 0,
          loadDistribution: Array.isArray(summary?.loadDistribution) ? summary.loadDistribution : [],
          performance: Array.isArray(summary?.performance) ? summary.performance : [],
          completionTrend: Array.isArray(summary?.completionTrend) ? summary.completionTrend : [],
          upcomingDeadlines: Array.isArray(summary?.upcomingDeadlines) ? summary.upcomingDeadlines : [],
          managerProductivity: Array.isArray(summary?.managerProductivity) ? summary.managerProductivity : [],
          teamUtilization: Array.isArray(summary?.teamUtilization) ? summary.teamUtilization : [],
          capacityPlanning: Array.isArray(summary?.capacityPlanning) ? summary.capacityPlanning : [],
          sla: {
            overdueTotal: Number(summary?.sla?.overdueTotal || 0),
            escalatedTotal: Number(summary?.sla?.escalatedTotal || 0),
            pendingEscalation: Number(summary?.sla?.pendingEscalation || 0),
          },
          kpis: {
            totalTasks: Number(summary?.kpis?.totalTasks || 0),
            completedTasks: Number(summary?.kpis?.completedTasks || 0),
            inProgressTasks: Number(summary?.kpis?.inProgressTasks || 0),
            completionRate: Number(summary?.kpis?.completionRate || 0),
            avgCompletionHours: Number(summary?.kpis?.avgCompletionHours || 0),
          },
        });
      } catch {
        setData({
          statusStats: [],
          priorityStats: [],
          overdueCount: 0,
          loadDistribution: [],
          performance: [],
          completionTrend: [],
          upcomingDeadlines: [],
          managerProductivity: [],
          teamUtilization: [],
          capacityPlanning: [],
          sla: {
            overdueTotal: 0,
            escalatedTotal: 0,
            pendingEscalation: 0,
          },
          kpis: {
            totalTasks: 0,
            completedTasks: 0,
            inProgressTasks: 0,
            completionRate: 0,
            avgCompletionHours: 0,
          },
        });
      } finally {
        setLoading(false);
      }
    };

    loadAnalytics();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-full">Loading analytics...</div>;

  const COLORS = ['#10b981', '#f59e0b', '#6366f1', '#ef4444', '#71717a'];

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8 pb-12"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Analytics & Reporting</h2>
        <p className="text-zinc-500">Insights into team performance and task distribution.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Total Tasks</p>
          <p className="text-4xl font-bold text-zinc-900">{data.kpis.totalTasks}</p>
          <p className="text-xs text-zinc-400 mt-2">Across visible scope</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Completion Rate</p>
          <p className="text-4xl font-bold text-emerald-500">{data.kpis.completionRate}%</p>
          <p className="text-xs text-zinc-400 mt-2">{data.kpis.completedTasks} completed tasks</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Overdue Tasks</p>
          <p className="text-4xl font-bold text-red-500">{data.overdueCount}</p>
          <p className="text-xs text-zinc-400 mt-2">Requires immediate attention</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Avg. Completion Time</p>
          <p className="text-4xl font-bold text-blue-600">{data.kpis.avgCompletionHours}h</p>
          <p className="text-xs text-zinc-400 mt-2">Per task average</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Over-Allocated Team Members</p>
          <p className="text-4xl font-bold text-amber-500">
            {data.capacityPlanning.filter((row: any) => row.over_allocated).length}
          </p>
          <p className="text-xs text-zinc-400 mt-2">Based on daily workload caps</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">SLA Pending Escalation</p>
          <p className="text-4xl font-bold text-red-500">{data.sla.pendingEscalation}</p>
          <p className="text-xs text-zinc-400 mt-2">Overdue and not escalated yet</p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-1">Escalated Overdue Tasks</p>
          <p className="text-4xl font-bold text-indigo-500">{data.sla.escalatedTotal}</p>
          <p className="text-xs text-zinc-400 mt-2">SLA escalations sent</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Task Status Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <PieChartIcon size={20} className="text-zinc-400" />
            Task Status Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.statusStats}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="count"
                  nameKey="status"
                >
                  {data.statusStats.map((_: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <Activity size={20} className="text-zinc-400" />
            Priority Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.priorityStats}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                  dataKey="priority" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#71717a' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#71717a' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#18181b" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <TrendingUp size={20} className="text-zinc-400" />
            Completion Trend (14 Days)
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.completionTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis
                  dataKey="day"
                  tickFormatter={(value: string) => format(new Date(value), 'MMM d')}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#71717a' }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#71717a' }} />
                <Tooltip
                  labelFormatter={(value: string) => format(new Date(value), 'MMM d, yyyy')}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="completed_count" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Task Load Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <Activity size={20} className="text-zinc-400" />
            Task Load Distribution
          </h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.loadDistribution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis 
                  dataKey="full_name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#71717a' }}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#71717a' }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="task_count" fill="#18181b" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">Upcoming Deadlines</h3>
          <div className="space-y-3">
            {data.upcomingDeadlines.map((item: any) => (
              <div key={item.id} className="p-3 rounded-xl border border-zinc-100 bg-zinc-50">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold text-sm">{item.title}</p>
                  <Badge variant={item.priority}>{item.priority}</Badge>
                </div>
                <p className="text-xs text-zinc-500 mt-1">{format(new Date(item.deadline), 'MMM d, yyyy h:mm a')}</p>
              </div>
            ))}
            {data.upcomingDeadlines.length === 0 && (
              <p className="text-sm text-zinc-400 italic">No upcoming deadlines</p>
            )}
          </div>
        </div>

        {/* Employee Performance */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-2">
            <TrendingUp size={20} className="text-zinc-400" />
            Employee Performance Metrics
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Employee</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Tasks Completed</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Avg. Time (Hours)</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Efficiency Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {data.performance.map((p: any, idx: number) => {
                  // Simple efficiency score: completed / avg_hours (higher is better)
                  const efficiency = p.avg_hours > 0 ? (p.completed_count / p.avg_hours * 10).toFixed(1) : '10.0';
                  return (
                    <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                      <td className="py-4 font-semibold text-sm">{p.full_name}</td>
                      <td className="py-4 text-sm">{p.completed_count}</td>
                      <td className="py-4 text-sm">{Number(p.avg_hours || 0).toFixed(1)}h</td>
                      <td className="py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-zinc-100 rounded-full overflow-hidden max-w-[100px]">
                            <div 
                              className="h-full bg-emerald-500 rounded-full" 
                              style={{ width: `${Math.min(parseFloat(efficiency) * 10, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-zinc-600">{efficiency}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.performance.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400 text-sm italic">No performance data available yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold mb-6">Team Utilization Snapshot</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Team Member</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Active</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Overdue</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {data.teamUtilization.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="py-4 text-sm font-semibold">{row.full_name}</td>
                    <td className="py-4 text-sm">{row.active_tasks || 0}</td>
                    <td className="py-4 text-sm text-red-500">{row.overdue_tasks || 0}</td>
                    <td className="py-4 text-sm text-emerald-600">{row.completed_tasks || 0}</td>
                  </tr>
                ))}
                {data.teamUtilization.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400 text-sm italic">No utilization data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold mb-6">Manager Productivity</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Manager</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Created</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Completed</th>
                  <th className="pb-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Overdue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {data.managerProductivity.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="py-4 text-sm font-semibold">{row.full_name}</td>
                    <td className="py-4 text-sm">{row.total_created || 0}</td>
                    <td className="py-4 text-sm text-emerald-600">{row.completed || 0}</td>
                    <td className="py-4 text-sm text-red-500">{row.overdue || 0}</td>
                  </tr>
                ))}
                {data.managerProductivity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-zinc-400 text-sm italic">No manager productivity data available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function DashboardView({ user }: { user: User, key?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  
  useEffect(() => {
    const loadTasks = async () => {
      try {
        const data = await apiRequest('/api/tasks?page=1&limit=40&sort=created_desc&includeHistory=1');
        setTasks(toTasks(data));
      } catch {
        setTasks([]);
      }
    };

    loadTasks();
  }, []);

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    pending: tasks.filter(t => t.status !== 'completed').length,
    urgent: tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length
  };

  const activityItems = tasks
    .flatMap(task =>
      (task.history || []).map(history => ({
        id: `${task.id}-${history.id}`,
        title:
          history.status_to === 'created'
            ? 'Task created'
            : history.status_to === 'assigned'
              ? 'Task assigned'
              : history.status_to === 'completed'
                ? 'Task completed'
                : 'Task updated',
        time: history.created_at,
        desc: `${task.title} - ${history.user_name}`,
      })),
    )
    .sort((a, b) => {
      const aDate = parseAppDate(a.time)?.getTime() || 0;
      const bDate = parseAppDate(b.time)?.getTime() || 0;
      return bDate - aDate;
    })
    .slice(0, 6);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Overview</h2>
        <p className="text-zinc-500">Welcome back, {user.full_name}. Here's what's happening.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Tasks" value={stats.total} icon={<ClipboardList className="text-blue-500" />} />
        <StatCard label="In Progress" value={stats.pending} icon={<Clock className="text-amber-500" />} />
        <StatCard label="Completed" value={stats.completed} icon={<CheckCircle2 className="text-emerald-500" />} />
        <StatCard label="Urgent" value={stats.urgent} icon={<AlertCircle className="text-red-500" />} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            Recent Tasks
            <ChevronRight size={16} className="text-zinc-300" />
          </h3>
          <div className="space-y-4">
            {tasks.slice(0, 5).map(task => {
              const progress = task.subtasks.length > 0 
                ? Math.round((task.subtasks.filter(s => s.status === 'completed').length / task.subtasks.length) * 100)
                : (task.status === 'completed' ? 100 : 0);
              const deadline = parseAppDate(task.deadline);

              return (
                <div key={task.id} className="p-4 rounded-2xl hover:bg-zinc-50 transition-colors border border-transparent hover:border-zinc-100">
                  <div className="flex items-center gap-4 mb-3">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center",
                      task.status === 'completed' ? "bg-emerald-50 text-emerald-500" : "bg-zinc-100 text-zinc-400"
                    )}>
                      {task.status === 'completed' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{task.title}</p>
                      <p className="text-xs text-zinc-400">
                        {deadline ? format(deadline, 'MMM d, yyyy') : 'No deadline'}
                      </p>
                    </div>
                    <Badge variant={task.priority}>{task.priority}</Badge>
                  </div>
                  <ProgressBar progress={progress} />
                </div>
              );
            })}
            {tasks.length === 0 && <p className="text-center py-8 text-zinc-400 text-sm italic">No tasks found</p>}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
          <h3 className="text-lg font-bold mb-6">System Activity</h3>
          <div className="space-y-6">
            {activityItems.map(item => (
              <div key={item.id}>
                <ActivityItem title={item.title} time={item.time} desc={item.desc} />
              </div>
            ))}
            {activityItems.length === 0 && (
              <p className="text-center py-8 text-zinc-400 text-sm italic">No recent activity yet</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div className="p-2 bg-zinc-50 rounded-xl">{icon}</div>
      </div>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function ActivityItem({ title, time, desc }: { title: string, time: string, desc: string }) {
  const parsed = parseAppDate(time);
  const timeLabel = parsed ? formatDistanceToNow(parsed, { addSuffix: true }) : 'Unknown time';

  return (
    <div className="flex gap-4">
      <div className="w-2 h-2 rounded-full bg-zinc-200 mt-2 shrink-0" />
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold">{title}</p>
          <span className="text-[10px] text-zinc-400 font-mono uppercase">{timeLabel}</span>
        </div>
        <p className="text-xs text-zinc-500">{desc}</p>
      </div>
    </div>
  );
}

function UserManagementView({ user: _user }: { user: User, key?: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchUsers = async (targetPage = page, targetPageSize = pageSize) => {
    try {
      const data = await apiRequest(`/api/users?page=${targetPage}&limit=${targetPageSize}`);
      setUsers(toUsers(data));
      const meta = getPaginationMeta(data);
      if (meta) {
        setPage(meta.page);
        setPageSize(meta.limit);
        setTotalUsers(meta.total);
        setTotalPages(meta.totalPages);
      } else {
        const all = toUsers(data);
        setTotalUsers(all.length);
        setTotalPages(1);
      }
    } catch {
      setUsers([]);
      setTotalUsers(0);
      setTotalPages(1);
    }
  };

  useEffect(() => {
    fetchUsers(page, pageSize);
  }, [page, pageSize]);

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this user?')) {
      try {
        await apiRequest(`/api/users/${id}`, { method: 'DELETE' });
        if (users.length === 1 && page > 1) {
          setPage((prev) => prev - 1);
        } else {
          fetchUsers();
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete user');
      }
    }
  };

  const handleResetPassword = async (targetUser: User) => {
    const newPassword = prompt(`Set a new password for ${targetUser.full_name}:`);
    if (!newPassword) return;

    try {
      await apiRequest(`/api/users/${targetUser.id}/reset-password`, {
        method: 'PUT',
        body: { newPassword },
      });
      alert(`Password reset successfully for ${targetUser.username}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-zinc-500">Manage system roles and access control.</p>
        </div>
        <button 
          onClick={() => {
            setEditingUser(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
        >
          <Plus size={18} />
          Add User
        </button>
      </header>

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="md:hidden space-y-3 p-4">
          {users.map((u) => (
            <div key={u.id} className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/50 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500">
                  {u?.full_name?.charAt(0) || '?'}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{u.full_name}</p>
                  <p className="text-xs text-zinc-400 font-mono truncate">@{u.username} • Cap {u.daily_task_cap || 5}/day</p>
                </div>
              </div>
              <Badge variant={u.role === 'sysAdmin' ? 'high' : u.role === 'manager' ? 'normal' : 'low'}>{u.role}</Badge>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingUser(u);
                    setShowForm(true);
                  }}
                  className="flex-1 p-2 text-zinc-500 hover:text-zinc-900 hover:bg-white border border-zinc-200 rounded-lg transition-all text-xs font-semibold"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleResetPassword(u)}
                  className="flex-1 p-2 text-zinc-500 hover:text-zinc-900 hover:bg-white border border-zinc-200 rounded-lg transition-all text-xs font-semibold"
                >
                  Reset PW
                </button>
                {u.role !== 'sysAdmin' && (
                  <button
                    onClick={() => handleDelete(u.id)}
                    className="px-3 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-100 rounded-lg transition-all text-xs font-semibold"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
          {users.length === 0 && <p className="text-center text-sm text-zinc-400 italic py-6">No users found on this page.</p>}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Username</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Daily Cap</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-500">
                        {u?.full_name?.charAt(0) || '?'}
                      </div>
                      <span className="font-semibold text-sm">{u.full_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.role === 'sysAdmin' ? 'high' : u.role === 'manager' ? 'normal' : 'low'}>
                      {u.role}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-sm text-zinc-500 font-mono">{u.username}</td>
                  <td className="px-6 py-4 text-sm text-zinc-600 font-semibold">{u.daily_task_cap || 5}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setEditingUser(u);
                          setShowForm(true);
                        }}
                        className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-all"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="px-2 py-1 text-[10px] font-bold rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-100 transition-all"
                      >
                        RESET PW
                      </button>
                      {u.role !== 'sysAdmin' && (
                        <button 
                          onClick={() => handleDelete(u.id)}
                          className="p-2 text-zinc-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-zinc-400 italic">No users found on this page.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={totalUsers}
        totalPages={totalPages}
        onPageChange={(next) => setPage(Math.max(1, Math.min(totalPages, next)))}
        onPageSizeChange={(nextSize) => {
          setPage(1);
          setPageSize(nextSize);
        }}
      />

      <AnimatePresence>
        {showForm && (
          <UserFormModal 
            user={editingUser}
            onClose={() => setShowForm(false)}
            onSaved={() => {
              setPage(1);
              fetchUsers(1, pageSize);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function UserFormModal({ user, onClose, onSaved }: { user: User | null, onClose: () => void, onSaved: () => void }) {
  const [formData, setFormData] = useState({
    username: user?.username || '',
    password: '',
    role: (user?.role || 'employee') as Role,
    full_name: user?.full_name || '',
    email: user?.email || '',
    daily_task_cap: user?.daily_task_cap || 5,
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const url = user ? `/api/users/${user.id}` : '/api/users';
    const method = user ? 'PUT' : 'POST';

    try {
      const result = await apiRequest<any>(url, {
        method,
        body: formData,
      });
      if (Array.isArray(result?.capacityWarnings) && result.capacityWarnings.length > 0) {
        const warningNames = result.capacityWarnings.map((w: any) => `${w.full_name} (${w.active_tasks}/${w.daily_task_cap})`);
        alert(`Capacity warning: ${warningNames.join(', ')}`);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-zinc-100 p-8"
      >
        <h3 className="text-xl font-bold mb-6">{user ? 'Edit User' : 'Add New User'}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Full Name</label>
            <input 
              required
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.full_name}
              onChange={e => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Username</label>
            <input 
              required
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.username}
              onChange={e => setFormData({ ...formData, username: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Email (Optional)</label>
            <input
              type="email"
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              placeholder="name@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">
              Password {user && <span className="text-[10px] lowercase font-normal">(leave blank to keep current)</span>}
            </label>
            <input 
              required={!user}
              type="password"
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Role</label>
            <select 
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as Role })}
            >
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="sysAdmin">System Admin</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Daily Task Cap</label>
            <input
              type="number"
              min={1}
              max={50}
              className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
              value={formData.daily_task_cap}
              onChange={e => setFormData({ ...formData, daily_task_cap: Number(e.target.value || 1) })}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-2 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all"
            >
              {user ? 'Save Changes' : 'Create User'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
        </form>
      </motion.div>
    </div>
  );
}

function TasksView({ user }: { user: User, key?: string }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskPage, setTaskPage] = useState(1);
  const [taskPageSize, setTaskPageSize] = useState(10);
  const [taskTotal, setTaskTotal] = useState(0);
  const [taskTotalPages, setTaskTotalPages] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | Task['status']>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | Task['priority']>('all');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'created_by_me' | 'assigned_to_me'>('all');
  const [sortBy, setSortBy] = useState<'deadline_asc' | 'deadline_desc' | 'created_desc' | 'priority_desc'>('created_desc');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 250);
  const canCreateTask = user.role === 'manager' || user.role === 'sysAdmin';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setScopeFilter('all');
    setSortBy('created_desc');
    setTaskPage(1);
  };

  const fetchTasks = async (targetPage = taskPage, targetPageSize = taskPageSize) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(targetPageSize));
      params.set('includeHistory', '0');
      if (debouncedSearchTerm.trim()) params.set('search', debouncedSearchTerm.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (scopeFilter !== 'all') params.set('scope', scopeFilter);
      if (sortBy !== 'created_desc') params.set('sort', sortBy);
      const data = await apiRequest(`/api/tasks?${params.toString()}`);
      setTasks(toTasks(data));
      const meta = getPaginationMeta(data);
      if (meta) {
        setTaskPage(meta.page);
        setTaskPageSize(meta.limit);
        setTaskTotal(meta.total);
        setTaskTotalPages(meta.totalPages);
      } else {
        const all = toTasks(data);
        setTaskTotal(all.length);
        setTaskTotalPages(1);
      }
    } catch {
      setTasks([]);
      setTaskTotal(0);
      setTaskTotalPages(1);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = toUsers(await apiRequest('/api/users?page=1&limit=200'));
      if (user.role === 'sysAdmin') {
        setEmployees(data.filter((u: User) => u.role === 'employee' || u.role === 'manager'));
      } else {
        setEmployees(data.filter((u: User) => u.role === 'employee'));
      }
    } catch {
      setEmployees([]);
    }
  };

  useEffect(() => {
    fetchTasks(taskPage, taskPageSize);
  }, [taskPage, taskPageSize, debouncedSearchTerm, statusFilter, priorityFilter, scopeFilter, sortBy]);

  useEffect(() => {
    setTaskPage(1);
  }, [debouncedSearchTerm, statusFilter, priorityFilter, scopeFilter, sortBy]);

  useEffect(() => {
    if (user.role === 'manager' || user.role === 'sysAdmin') fetchEmployees();
  }, []);

  const openTaskDetails = async (task: Task) => {
    try {
      const detailed = await apiRequest<Task>(`/api/tasks/${task.id}`);
      setSelectedTask(detailed);
    } catch {
      setSelectedTask(task);
    }
  };

  const updateTaskStatus = async (taskId: number, status: string, remarks?: string) => {
    try {
      await apiRequest(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: { status, remarks },
      });
      fetchTasks(taskPage, taskPageSize);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update task status');
    }
  };

  const updateSubtask = async (subtaskId: number, status: string, remarks?: string) => {
    try {
      await apiRequest(`/api/subtasks/${subtaskId}`, {
        method: 'PATCH',
        body: { status, remarks },
      });
      fetchTasks(taskPage, taskPageSize);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update subtask');
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (tasks.length === 1 && taskPage > 1) {
        setTaskPage((prev) => prev - 1);
      } else {
        fetchTasks(taskPage, taskPageSize);
      }
      setTaskToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const visibleTasks = tasks;

  const hasActiveFilters =
    searchTerm.trim().length > 0 ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    scopeFilter !== 'all' ||
    sortBy !== 'created_desc';
  const activeFilterCount = [
    searchTerm.trim().length > 0,
    statusFilter !== 'all',
    priorityFilter !== 'all',
    scopeFilter !== 'all',
    sortBy !== 'created_desc',
  ].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Tasks</h2>
          <p className="text-zinc-500">
            {canCreateTask
              ? 'Create, assign, and monitor tasks for your team.'
              : 'Manage your assigned tasks and subtasks.'}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {visibleTasks.length} visible on page
            </span>
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              {taskTotal} total
            </span>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Reset {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
        {canCreateTask && (
          <button
            onClick={() => setShowCreate(true)}
            className="self-start flex items-center gap-2 px-4 py-2.5 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
          >
            <Plus size={18} />
            Create Task
          </button>
        )}
      </header>

      <section className="bg-white p-4 md:p-5 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Search</label>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by title, instructions, or assignee..."
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
            >
              <option value="all">All Statuses</option>
              <option value="created">Created</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Priority</label>
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Sort</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
            >
              <option value="deadline_asc">Deadline: Soonest</option>
              <option value="deadline_desc">Deadline: Latest</option>
              <option value="created_desc">Newest Created</option>
              <option value="priority_desc">Priority: High to Low</option>
            </select>
          </div>
        </div>

        {canCreateTask && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Scope</label>
              <select
                value={scopeFilter}
                onChange={e => setScopeFilter(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
              >
                <option value="all">All Visible</option>
                <option value="created_by_me">Created By Me</option>
                <option value="assigned_to_me">Assigned To Me</option>
              </select>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {searchTerm.trim() && (
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold">
              Search: "{searchTerm.trim()}"
            </span>
          )}
          {statusFilter !== 'all' && (
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold">
              Status: {statusFilter.replace('_', ' ')}
            </span>
          )}
          {priorityFilter !== 'all' && (
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold">
              Priority: {priorityFilter}
            </span>
          )}
          {canCreateTask && scopeFilter !== 'all' && (
            <span className="px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-600 text-xs font-semibold">
              Scope: {scopeFilter === 'created_by_me' ? 'Created by me' : 'Assigned to me'}
            </span>
          )}
          {!hasActiveFilters && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-100">
              Showing all available tasks
            </span>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6">
        {visibleTasks.map(task => {
          const completedSubtasks = task.subtasks.filter(s => s.status === 'completed').length;
          const progress = task.subtasks.length > 0
            ? Math.round((completedSubtasks / task.subtasks.length) * 100)
            : (task.status === 'completed' ? 100 : 0);
          const visualStatus = progress === 100 ? 'completed' : task.status;
          const deadlineDate = parseAppDate(task.deadline);
          const canDelete = user.role === 'sysAdmin' || (user.role === 'manager' && task.manager_id === user.id);
          const assigneesPreview = task.assignments.slice(0, 3);
          const assigneeOverflow = Math.max(0, task.assignments.length - assigneesPreview.length);
          const statusLabel = visualStatus.replace(/_/g, ' ');

          return (
            <div
              key={task.id}
              className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden hover:shadow-md transition-all cursor-pointer"
              onClick={() => openTaskDetails(task)}
            >
              <div className="p-6 space-y-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-zinc-900">{task.title}</h3>
                      <Badge variant={visualStatus as any}>{statusLabel}</Badge>
                      <Badge variant={task.priority}>{task.priority}</Badge>
                    </div>
                    <p className="text-sm text-zinc-500 line-clamp-2">{task.instructions || 'No instructions provided'}</p>
                  </div>
                  <div className="flex items-start gap-2 md:gap-3 shrink-0">
                    <div className="rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-right min-w-[158px]">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-mono">Deadline</p>
                      <p className="text-sm font-semibold flex items-center justify-end gap-1.5 text-zinc-700">
                        <Calendar size={14} />
                        {formatDateTime(task.deadline)}
                      </p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">
                        {deadlineDate ? formatDistanceToNow(deadlineDate, { addSuffix: true }) : 'No due date set'}
                      </p>
                    </div>
                    {canDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskToDelete(task);
                        }}
                        className="p-2.5 rounded-xl border border-zinc-200 bg-white text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                        title="Delete task"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Progress</span>
                    <span className="text-[10px] font-bold text-zinc-900">{progress}%</span>
                  </div>
                  <ProgressBar progress={progress} />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-50">
                  <div className="flex items-center gap-2">
                    {assigneesPreview.map(a => (
                      <div
                        key={a.id}
                        title={a.full_name}
                        className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-600"
                      >
                        {getUserInitials(a?.full_name)}
                      </div>
                    ))}
                    {assigneeOverflow > 0 && (
                      <div className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-500">
                        +{assigneeOverflow}
                      </div>
                    )}
                    {task.assignments.length === 0 && <span className="text-xs text-zinc-400 italic">Unassigned</span>}
                    {task.assignments.length > 0 && (
                      <span className="text-xs font-medium text-zinc-500">
                        {task.assignments.length} assignee{task.assignments.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1.5 text-zinc-700">
                      <CheckCircle2 size={14} />
                      <span className="text-xs font-semibold">
                        {completedSubtasks}/{task.subtasks.length} subtasks
                      </span>
                    </div>
                    <ChevronRight size={18} className="text-zinc-300" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {visibleTasks.length === 0 && (
          <div className="bg-white rounded-3xl border border-zinc-100 p-10 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 border border-zinc-200 flex items-center justify-center mx-auto mb-4">
              <ClipboardList size={28} className="text-zinc-400" />
            </div>
            <p className="text-lg font-bold text-zinc-800 mb-1">No tasks found</p>
            <p className="text-zinc-500 text-sm mb-5">
              {hasActiveFilters ? 'No tasks match the selected filters.' : 'There are no tasks yet for this view.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-4 py-2 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 transition-colors"
                >
                  Clear Filters
                </button>
              )}
              {canCreateTask && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-colors"
                >
                  Create Task
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <PaginationControls
        page={taskPage}
        pageSize={taskPageSize}
        total={taskTotal}
        totalPages={taskTotalPages}
        onPageChange={(next) => setTaskPage(Math.max(1, Math.min(taskTotalPages, next)))}
        onPageSizeChange={(nextSize) => {
          setTaskPage(1);
          setTaskPageSize(nextSize);
        }}
      />

      {/* Create Task Modal */}
      <AnimatePresence>
        {showCreate && (
          <TaskFormModal 
            employees={employees} 
            onClose={() => setShowCreate(false)} 
            onSaved={() => {
              setTaskPage(1);
              fetchTasks(1, taskPageSize);
            }} 
          />
        )}
      </AnimatePresence>

      {/* Task Detail Modal */}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal 
            task={selectedTask} 
            user={user}
            employees={employees}
            onClose={() => setSelectedTask(null)} 
            onUpdate={() => fetchTasks(taskPage, taskPageSize)}
            updateTaskStatus={updateTaskStatus}
            updateSubtask={updateSubtask}
            onDelete={(task) => {
              setSelectedTask(null);
              setTaskToDelete(task);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {taskToDelete && (
          <ConfirmationDialog 
            title="Delete Task"
            message={`Are you sure you want to delete "${taskToDelete.title}"? This action cannot be undone.`}
            onConfirm={() => deleteTask(taskToDelete.id)}
            onCancel={() => setTaskToDelete(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TaskFormModal({ employees, onClose, onSaved, task = null }: { employees: User[], onClose: () => void, onSaved: () => void, task?: Task | null }) {
  const initialDeadlineParts = splitDateTimeValue(task?.deadline);
  const initialReminderParts = splitDateTimeValue(task?.reminder_at);
  const hasInitialReminder = Boolean(task?.reminder_at);
  const [formData, setFormData] = useState({
    title: task?.title || '',
    instructions: task?.instructions || '',
    deadline_date: initialDeadlineParts.date,
    deadline_time: initialDeadlineParts.time,
    priority: task?.priority || 'normal',
    assigned_to: task?.assignments.map(a => a.id) || [] as number[],
    subtasks: task?.subtasks.map(st => ({ 
      id: st.id, 
      title: st.title, 
      deadline: toDateTimeLocalValue(st.deadline),
    })) || [] as { id?: number, title: string, deadline: string }[],
    reminder_date: initialReminderParts.date,
    reminder_time: initialReminderParts.time,
  });
  const [enableReminder, setEnableReminder] = useState(hasInitialReminder);
  const [error, setError] = useState('');
  const [assignmentSearch, setAssignmentSearch] = useState('');
  const [subtaskDraft, setSubtaskDraft] = useState({
    title: '',
    deadline_date: initialDeadlineParts.date,
    deadline_time: initialDeadlineParts.time,
  });

  const filteredEmployees = employees.filter(emp =>
    emp.full_name.toLowerCase().includes(assignmentSearch.toLowerCase()) ||
    emp.username.toLowerCase().includes(assignmentSearch.toLowerCase()),
  );

  const toggleAssignee = (userId: number) => {
    setFormData(prev => ({
      ...prev,
      assigned_to: prev.assigned_to.includes(userId)
        ? prev.assigned_to.filter(id => id !== userId)
        : [...prev.assigned_to, userId],
    }));
  };

  const addSubtaskDraft = () => {
    if (!subtaskDraft.title.trim()) return;
    const fallbackDeadline = combineDateTimeParts(formData.deadline_date, formData.deadline_time);
    const subtaskDeadline = normalizeDateTimeInput(
      combineDateTimeParts(subtaskDraft.deadline_date, subtaskDraft.deadline_time),
    ) || fallbackDeadline;
    setFormData(prev => ({
      ...prev,
      subtasks: [...prev.subtasks, { title: subtaskDraft.title.trim(), deadline: subtaskDeadline }],
    }));
    setSubtaskDraft(prev => ({ ...prev, title: '' }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    const url = task ? `/api/tasks/${task.id}` : '/api/tasks';
    const method = task ? 'PUT' : 'POST';
    const normalizedTitle = formData.title.trim();
    if (!normalizedTitle) {
      setError('Please provide a task title.');
      return;
    }
    const rawReminderAt = enableReminder && formData.reminder_date
      ? combineDateTimeParts(formData.reminder_date, formData.reminder_time)
      : '';
    const combinedDeadline = combineDateTimeParts(formData.deadline_date, formData.deadline_time);
    const normalizedDeadline = normalizeDateTimeInput(combinedDeadline);

    if (!normalizedDeadline) {
      setError('Please provide a valid deadline date/time.');
      return;
    }

    const payload = {
      title: normalizedTitle,
      instructions: formData.instructions,
      deadline: normalizedDeadline,
      priority: formData.priority,
      assigned_to: formData.assigned_to,
      reminder_at: normalizeDateTimeInput(rawReminderAt) || null,
      subtasks: formData.subtasks.map((st) => ({
        ...st,
        deadline: normalizeDateTimeInput(st.deadline) || normalizedDeadline,
      })),
    };

    try {
      await apiRequest(url, {
        method,
        body: payload,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-zinc-100 p-8 max-h-[90vh] overflow-y-auto"
      >
        <h3 className="text-2xl font-bold mb-6">{task ? 'Edit Task' : 'Create New Task'}</h3>
        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-7">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Task Title</label>
                <input 
                  required
                  className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Instructions</label>
                <textarea 
                  className="w-full px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900 h-24 resize-none"
                  value={formData.instructions}
                  onChange={e => setFormData({ ...formData, instructions: e.target.value })}
                />
              </div>
              <div className="space-y-2.5">
                <label className="block text-xs font-semibold text-zinc-400 uppercase">Deadline</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase mb-1">Date</p>
                    <input
                      type="date"
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                      value={formData.deadline_date}
                      onChange={e => setFormData((prev) => ({ ...prev, deadline_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase mb-1">Time</p>
                    <input
                      type="time"
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                      value={formData.deadline_time}
                      onChange={e => setFormData((prev) => ({ ...prev, deadline_time: e.target.value || '09:00' }))}
                    />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-zinc-400 uppercase mb-1">Priority</p>
                    <select
                      className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900"
                      value={formData.priority}
                      onChange={e => setFormData((prev) => ({ ...prev, priority: e.target.value }))}
                    >
                      <option value="low">Low</option>
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase mb-1.5">Assign To</label>
                <div className="space-y-2 p-2 bg-zinc-50 rounded-xl border border-zinc-100">
                  <input
                    type="text"
                    placeholder="Search users by name or username"
                    value={assignmentSearch}
                    onChange={e => setAssignmentSearch(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
                  />
                  <div className="flex flex-wrap gap-2 min-h-8">
                    {formData.assigned_to.map(id => {
                      const selected = employees.find(e => e.id === id);
                      if (!selected) return null;
                      return (
                        <button
                          type="button"
                          key={id}
                          onClick={() => toggleAssignee(id)}
                          className="px-2.5 py-1 rounded-full bg-zinc-900 text-white text-xs font-semibold"
                        >
                          {selected.full_name} x
                        </button>
                      );
                    })}
                    {formData.assigned_to.length === 0 && (
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider">No assignees selected</span>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {filteredEmployees.map(emp => (
                      <button
                        type="button"
                        key={emp.id}
                        onClick={() => toggleAssignee(emp.id)}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-lg text-sm border transition-all",
                          formData.assigned_to.includes(emp.id)
                            ? "bg-zinc-900 text-white border-zinc-900"
                            : "bg-white border-zinc-100 hover:border-zinc-300",
                        )}
                      >
                        <p className="font-semibold">{emp.full_name}</p>
                        <p className={cn("text-[10px] uppercase tracking-wider", formData.assigned_to.includes(emp.id) ? "text-zinc-300" : "text-zinc-400")}>
                          @{emp.username} - {emp.role}
                        </p>
                      </button>
                    ))}
                    {filteredEmployees.length === 0 && (
                      <p className="text-xs text-zinc-400 italic p-2">No matching users found</p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="block text-xs font-semibold text-zinc-400 uppercase">Add Subtasks</label>
                </div>
                <div className="space-y-3 max-h-60 overflow-y-auto p-2 bg-zinc-50 rounded-xl border border-zinc-100">
                  <div className="space-y-2 p-3 bg-white rounded-xl border border-zinc-100">
                    <input
                      placeholder="Subtask title"
                      className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
                      value={subtaskDraft.title}
                      onChange={e => setSubtaskDraft(prev => ({ ...prev, title: e.target.value }))}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2">
                      <input
                        type="date"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100 text-xs focus:outline-none focus:border-zinc-900"
                        value={subtaskDraft.deadline_date}
                        onChange={e => setSubtaskDraft(prev => ({ ...prev, deadline_date: e.target.value }))}
                      />
                      <input
                        type="time"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-100 text-xs focus:outline-none focus:border-zinc-900"
                        value={subtaskDraft.deadline_time}
                        onChange={e => setSubtaskDraft(prev => ({ ...prev, deadline_time: e.target.value || '09:00' }))}
                      />
                      <button
                        type="button"
                        onClick={addSubtaskDraft}
                        className="px-3 py-2 rounded-lg bg-zinc-900 text-white text-xs font-bold"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                  {formData.subtasks.map((st, idx) => {
                    const stParts = splitDateTimeValue(st.deadline);
                    return (
                    <div key={idx} className="space-y-2 p-3 bg-white rounded-xl border border-zinc-100 shadow-sm">
                      <div className="flex gap-2">
                        <input 
                          placeholder="Subtask title"
                          className="flex-1 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
                          value={st.title}
                          onChange={e => {
                            const newSubtasks = [...formData.subtasks];
                            newSubtasks[idx].title = e.target.value;
                            setFormData({ ...formData, subtasks: newSubtasks });
                          }}
                        />
                        <button 
                          type="button"
                          onClick={() => setFormData({ ...formData, subtasks: formData.subtasks.filter((_, i) => i !== idx) })}
                          className="text-red-400 hover:text-red-600 p-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
                        <input
                          type="date"
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 text-xs focus:outline-none focus:border-zinc-900"
                          value={stParts.date}
                          onChange={e => {
                            const newSubtasks = [...formData.subtasks];
                            newSubtasks[idx].deadline = combineDateTimeParts(e.target.value, stParts.time);
                            setFormData({ ...formData, subtasks: newSubtasks });
                          }}
                        />
                        <input
                          type="time"
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-100 text-xs focus:outline-none focus:border-zinc-900"
                          value={stParts.time}
                          onChange={e => {
                            const newSubtasks = [...formData.subtasks];
                            newSubtasks[idx].deadline = combineDateTimeParts(stParts.date, e.target.value || '09:00');
                            setFormData({ ...formData, subtasks: newSubtasks });
                          }}
                        />
                      </div>
                    </div>
                  )})}
                  {formData.subtasks.length === 0 && <p className="text-[10px] text-zinc-300 italic text-center py-4">No new subtasks added</p>}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4">
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 uppercase tracking-wide cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableReminder}
                  onChange={(e) => setEnableReminder(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                Set Reminder
              </label>
              {enableReminder && (formData.reminder_date || formData.reminder_time !== '09:00') && (
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, reminder_date: '', reminder_time: '09:00' }))}
                  className="text-[10px] font-semibold uppercase text-zinc-500 hover:text-zinc-900"
                >
                  Clear
                </button>
              )}
            </div>
            {enableReminder && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="date"
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-zinc-200 focus:outline-none focus:border-zinc-900"
                  value={formData.reminder_date}
                  onChange={e => setFormData((prev) => ({ ...prev, reminder_date: e.target.value }))}
                />
                <input
                  type="time"
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-zinc-200 focus:outline-none focus:border-zinc-900"
                  value={formData.reminder_time}
                  onChange={e => setFormData((prev) => ({ ...prev, reminder_time: e.target.value || '09:00' }))}
                />
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 border-t border-zinc-50">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-zinc-50 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-1 py-3 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all shadow-lg shadow-zinc-200"
            >
              {task ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
          {error && <p className="text-red-500 text-xs font-medium">{error}</p>}
        </form>
      </motion.div>
    </div>
  );
}

const CollapsibleSection = ({ title, children, defaultOpen = true, icon }: { title: string, children: React.ReactNode, defaultOpen?: boolean, icon?: React.ReactNode }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-50 last:border-0">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-4 hover:bg-zinc-50/50 transition-colors px-2 rounded-xl"
      >
        <div className="flex items-center gap-3">
          {icon && <div className="text-zinc-400">{icon}</div>}
          <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{title}</h4>
        </div>
        <ChevronRight size={16} className={cn("text-zinc-300 transition-transform", isOpen && "rotate-90")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pb-6 pt-2 px-2">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function TaskDetailModal({ task, user, employees, onClose, onUpdate, updateTaskStatus, updateSubtask, onDelete }: { task: Task, user: User, employees: User[], onClose: () => void, onUpdate: () => void, updateTaskStatus: any, updateSubtask: any, onDelete?: (task: Task) => void }) {
  const [remarks, setRemarks] = useState(task.remarks || '');
  const [isEditing, setIsEditing] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'history'>('details');
  const [reminderAt, setReminderAt] = useState(task.reminder_at ? task.reminder_at.slice(0, 16) : '');
  const [localSubtasks, setLocalSubtasks] = useState(task.subtasks || []);
  const canManageTask = user.role === 'sysAdmin' || (user.role === 'manager' && task.manager_id === user.id);
  const requiresStart = task.status === 'assigned';

  useEffect(() => {
    setRemarks(task.remarks || '');
    setReminderAt(task.reminder_at ? task.reminder_at.slice(0, 16) : '');
    setLocalSubtasks(task.subtasks || []);
  }, [task]);

  const handleStatusChange = async (status: string) => {
    await updateTaskStatus(task.id, status, remarks);
    setIsEditing(false);
    onUpdate();
    onClose();
  };

  const handleSetReminder = async () => {
    try {
      await apiRequest(`/api/tasks/${task.id}/reminder`, {
        method: 'PATCH',
        body: { reminder_at: reminderAt },
      });
      onUpdate();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to set reminder');
    }
  };

  const handleResendEmail = async () => {
    try {
      await apiRequest(`/api/tasks/${task.id}/resend-email`, { method: 'POST' });
      alert('Email notification resend triggered (active only when EMAIL_NOTIFICATIONS_ENABLED=true).');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resend email notification');
    }
  };

  const handleSubtaskToggle = async (subtaskId: number, currentStatus: 'pending' | 'completed') => {
    const nextStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    setLocalSubtasks(prev =>
      prev.map(subtask => (subtask.id === subtaskId ? { ...subtask, status: nextStatus } : subtask)),
    );
    await updateSubtask(subtaskId, nextStatus);
    onUpdate();
  };

  const progress = localSubtasks.length > 0 
    ? Math.round((localSubtasks.filter(s => s.status === 'completed').length / localSubtasks.length) * 100)
    : (task.status === 'completed' ? 100 : 0);

  return (
    <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl border border-zinc-100 overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-8 border-b border-zinc-50 flex justify-between items-start">
          <div className="space-y-4 w-full">
            <div className="flex items-center gap-3">
              <h3 className="text-2xl font-bold tracking-tight">{task.title}</h3>
              <Badge variant={task.status}>{task.status.replace('_', ' ')}</Badge>
              <Badge variant={task.priority}>{task.priority}</Badge>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <ProgressBar progress={progress} className="w-32" />
                <span className="text-xs font-bold text-zinc-400">{progress}% Complete</span>
              </div>
              <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('details')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                    activeTab === 'details' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  Details
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                    activeTab === 'history' ? "bg-white shadow-sm text-zinc-900" : "text-zinc-400 hover:text-zinc-600"
                  )}
                >
                  History
                </button>
              </div>
            </div>
            <p className="text-zinc-500">{task.instructions}</p>
          </div>
          <div className="flex items-center gap-2">
            {canManageTask && (
              <>
                <button 
                  disabled={requiresStart}
                  onClick={() => setShowEditModal(true)}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    requiresStart
                      ? "text-zinc-300 cursor-not-allowed"
                      : "hover:bg-zinc-50 text-zinc-400 hover:text-zinc-900",
                  )}
                  title="Edit Task"
                >
                  <Edit3 size={20} />
                </button>
                <button 
                  onClick={() => onDelete?.(task)}
                  className="p-2 hover:bg-red-50 rounded-full text-zinc-400 hover:text-red-600 transition-colors"
                  title="Delete Task"
                >
                  <Trash2 size={20} />
                </button>
              </>
            )}
            <button onClick={onClose} className="p-2 hover:bg-zinc-50 rounded-full text-zinc-400 transition-colors">
              <ChevronRight size={24} className="rotate-90" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {activeTab === 'details' ? (
            <div className="p-8 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div className="md:col-span-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Instructions</h4>
                  <p className="text-zinc-600 text-sm leading-relaxed bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    {task.instructions || <span className="text-zinc-300 italic">No instructions provided</span>}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-3">Timeline</h4>
                  <div className="space-y-3 bg-zinc-50 p-4 rounded-2xl border border-zinc-100">
                    <div className="flex items-center gap-3">
                      <Calendar size={14} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase font-mono">Deadline</p>
                        <p className="text-xs font-bold">{formatDateTime(task.deadline)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock size={14} className="text-zinc-400" />
                      <div>
                        <p className="text-[10px] text-zinc-400 uppercase font-mono">Created</p>
                        <p className="text-xs font-bold">{format(new Date(task.created_at), 'MMM d, yyyy')}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CollapsibleSection title="Subtasks" icon={<ClipboardList size={16} />}>
                <div className="space-y-3">
                  {localSubtasks.map(st => (
                    <div key={st.id} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100 group">
                      <button 
                        onClick={() => handleSubtaskToggle(st.id, st.status)}
                        className={cn(
                          "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                          st.status === 'completed' ? "bg-emerald-500 border-emerald-500 text-white" : "border-zinc-200 hover:border-zinc-400"
                        )}
                      >
                        {st.status === 'completed' && <CheckCircle2 size={14} />}
                      </button>
                      <div className="flex-1">
                        <p className={cn("text-sm font-medium", st.status === 'completed' && "text-zinc-400 line-through")}>{st.title}</p>
                        <p className="text-[10px] text-zinc-400 font-mono uppercase">Due {formatDateTime(st.deadline, 'No date')}</p>
                      </div>
                      <Badge variant={st.status === 'completed' ? 'completed' : 'pending'}>
                        {st.status === 'completed' ? '100%' : '0%'}
                      </Badge>
                    </div>
                  ))}
                  {localSubtasks.length === 0 && <p className="text-sm text-zinc-300 italic ml-2">No subtasks defined</p>}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Assignments" icon={<Users size={16} />} defaultOpen={false}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {task.assignments.map(a => (
                    <div key={a.id} className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-50 border border-zinc-100">
                      <div className="w-10 h-10 rounded-full bg-white border border-zinc-100 flex items-center justify-center text-sm font-bold text-zinc-500 shadow-sm">
                        {a?.full_name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900">{a?.full_name || 'User'}</p>
                        <p className="text-[10px] text-zinc-400 font-mono uppercase">@{a?.username}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Remarks & Progress" icon={<Edit3 size={16} />}>
                <div className="space-y-4">
                  {isEditing ? (
                    <textarea 
                      className="w-full p-4 rounded-2xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900 h-32 resize-none text-sm"
                      value={remarks}
                      onChange={e => setRemarks(e.target.value)}
                      placeholder="Add your progress remarks here..."
                    />
                  ) : (
                    <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-100 text-sm text-zinc-600 min-h-24">
                      {task.remarks || <span className="text-zinc-300 italic">No remarks yet</span>}
                    </div>
                  )}
                </div>
              </CollapsibleSection>

              {canManageTask && (
                <CollapsibleSection title="Reminders" icon={<Bell size={16} />} defaultOpen={false}>
                  <div className="space-y-4">
                    {requiresStart && (
                      <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        This task must be started by an assignee before reminder/details can be changed.
                      </p>
                    )}
                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest ml-1">Set Reminder</label>
                        <input 
                          type="datetime-local" 
                          value={reminderAt}
                          onChange={e => setReminderAt(e.target.value)}
                          disabled={requiresStart}
                          className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 focus:outline-none focus:border-zinc-900 text-sm"
                        />
                      </div>
                      <button 
                        disabled={requiresStart}
                        onClick={handleSetReminder}
                        className={cn(
                          "px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-zinc-200",
                          requiresStart
                            ? "bg-zinc-300 text-zinc-500 cursor-not-allowed"
                            : "bg-zinc-900 text-white hover:bg-zinc-800",
                        )}
                      >
                        Save
                      </button>
                    </div>
                    <div className="flex items-center justify-between rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3">
                      <p className="text-xs text-zinc-500">Resend task email notification (inactive until enabled in env)</p>
                      <button
                        onClick={handleResendEmail}
                        className="px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-semibold hover:bg-white transition-all"
                      >
                        Resend Email
                      </button>
                    </div>
                  </div>
                </CollapsibleSection>
              )}
            </div>
          ) : (
            <div className="p-8 space-y-6">
              <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-widest mb-4">Activity Log</h4>
              <div className="space-y-6 relative before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-px before:bg-zinc-100">
                {task.history.map((h) => (
                  <div key={h.id} className="relative pl-10">
                    <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-white border-2 border-zinc-100 flex items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full bg-zinc-400" />
                    </div>
                    <div className="bg-zinc-50 rounded-2xl p-4 border border-zinc-100">
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm font-bold">{h.user_name}</p>
                        <p className="text-[10px] text-zinc-400 font-mono uppercase">{format(new Date(h.created_at), 'MMM d, h:mm a')}</p>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        {h.status_from && (
                          <>
                            <Badge variant={h.status_from as any}>{h.status_from.replace('_', ' ')}</Badge>
                            <ChevronRight size={12} className="text-zinc-300" />
                          </>
                        )}
                        <Badge variant={h.status_to as any}>{h.status_to.replace('_', ' ')}</Badge>
                      </div>
                      {h.remarks && <p className="text-sm text-zinc-500 italic">"{h.remarks}"</p>}
                    </div>
                  </div>
                ))}
                {task.history.length === 0 && <p className="text-sm text-zinc-300 italic text-center py-12">No history available</p>}
              </div>
            </div>
          )}
        </div>

        <div className="p-8 bg-zinc-50 border-t border-zinc-100 flex items-center gap-4">
          {user.role !== 'sysAdmin' && (
            <div className="flex gap-4">
              {isEditing ? (
                <>
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-6 py-2 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-white transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => handleStatusChange(task.status)}
                    className="px-6 py-2 bg-zinc-900 text-white rounded-xl text-sm font-semibold hover:bg-zinc-800 transition-all"
                  >
                    Save Remarks
                  </button>
                </>
              ) : (
                <>
                  <button 
                    onClick={() => setIsEditing(true)}
                    className="px-6 py-2 rounded-xl border border-zinc-200 text-sm font-semibold hover:bg-white transition-all flex items-center gap-2"
                  >
                    <Edit3 size={16} />
                    Update Progress
                  </button>
                  {task.status !== 'completed' && (
                    <button 
                      onClick={() => handleStatusChange('completed')}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 size={16} />
                      Mark as Completed
                    </button>
                  )}
                  {task.status === 'assigned' && (
                    <button 
                      onClick={() => handleStatusChange('in_progress')}
                      className="px-6 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold hover:bg-amber-600 transition-all"
                    >
                      Start Task
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {canManageTask && (
            <button 
              onClick={() => onDelete?.(task)}
              className="px-6 py-2 text-red-600 hover:bg-red-50 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ml-auto"
            >
              <Trash2 size={16} />
              Delete Task
            </button>
          )}
        </div>

        <AnimatePresence>
          {showEditModal && (
            <TaskFormModal 
              task={task}
              employees={employees}
              onClose={() => setShowEditModal(false)}
              onSaved={() => {
                onUpdate();
                onClose();
              }}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function AuditLogsView({ user }: { user: User, key?: string }) {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [action, setAction] = useState('');
  const [actorUserId, setActorUserId] = useState('all');
  const [statusCode, setStatusCode] = useState('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    try {
      const data = await apiRequest('/api/users?page=1&limit=200');
      setUsers(toUsers(data));
    } catch {
      setUsers([]);
    }
  };

  const fetchLogs = async (targetPage = page, targetPageSize = pageSize) => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(targetPageSize));
      if (action.trim()) params.set('action', action.trim());
      if (actorUserId !== 'all') params.set('actorUserId', actorUserId);
      if (statusCode !== 'all') params.set('statusCode', statusCode);
      if (fromDate) params.set('from', `${fromDate}T00:00:00`);
      if (toDate) params.set('to', `${toDate}T23:59:59`);

      const data = await apiRequest(`/api/audit-logs?${params.toString()}`);
      setLogs(toAuditLogs(data));
      const meta = getPaginationMeta(data);
      if (meta) {
        setPage(meta.page);
        setPageSize(meta.limit);
        setTotal(meta.total);
        setTotalPages(meta.totalPages);
      } else {
        const items = toAuditLogs(data);
        setTotal(items.length);
        setTotalPages(1);
      }
    } catch (err) {
      setLogs([]);
      setTotal(0);
      setTotalPages(1);
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role !== 'sysAdmin') return;
    fetchUsers();
  }, [user.role]);

  useEffect(() => {
    if (user.role !== 'sysAdmin') return;
    fetchLogs(page, pageSize);
  }, [page, pageSize, action, actorUserId, statusCode, fromDate, toDate, user.role]);

  useEffect(() => {
    setPage(1);
  }, [action, actorUserId, statusCode, fromDate, toDate]);

  if (user.role !== 'sysAdmin') {
    return (
      <div className="bg-white rounded-3xl border border-zinc-100 p-8">
        <p className="text-sm text-zinc-500">Only system administrators can access audit logs.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Audit Logs</h2>
        <p className="text-zinc-500">Security and mutation event trail across the system.</p>
      </header>

      <section className="bg-white p-4 md:p-5 rounded-3xl border border-zinc-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Action</label>
            <input
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. auth_login_failed"
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Actor</label>
            <select
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
            >
              <option value="all">All Actors</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} (@{u.username})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">Status</label>
            <select
              value={statusCode}
              onChange={(e) => setStatusCode(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm font-semibold focus:outline-none focus:border-zinc-900"
            >
              <option value="all">All Status</option>
              <option value="200">200</option>
              <option value="401">401</option>
              <option value="403">403</option>
              <option value="500">500</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5 ml-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
            />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-red-500 font-semibold">{error}</p>}

      <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
        <div className="md:hidden space-y-3 p-4">
          {loading && <p className="text-sm text-zinc-400">Loading logs...</p>}
          {!loading && logs.map((log) => (
            <div key={log.id} className="p-4 rounded-2xl border border-zinc-100 bg-zinc-50/60 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-zinc-700">{log.action}</p>
                <Badge variant={log.status_code === 403 || log.status_code === 401 ? 'high' : 'normal'}>
                  {log.status_code || '-'}
                </Badge>
              </div>
              <p className="text-xs text-zinc-500">
                {formatDateTime(log.created_at, 'Unknown')} • {log.actor_username || 'system'}
              </p>
              <p className="text-xs text-zinc-500">Entity: {log.entity_type || '-'} {log.entity_id || ''}</p>
              <p className="text-xs text-zinc-500 truncate">IP: {log.ip || '-'}</p>
            </div>
          ))}
          {!loading && logs.length === 0 && <p className="text-sm text-zinc-400 italic">No logs for current filters.</p>}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-100">
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Time</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Action</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Actor</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Entity</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-semibold text-zinc-400 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-zinc-400">Loading logs...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-zinc-400 italic">No logs for current filters.</td></tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-6 py-4 text-xs font-mono text-zinc-500">{formatDateTime(log.created_at, 'Unknown')}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-zinc-800">{log.action}</td>
                    <td className="px-6 py-4 text-sm text-zinc-600">{log.actor_username || 'system'}</td>
                    <td className="px-6 py-4 text-xs text-zinc-500">{log.entity_type || '-'} {log.entity_id || ''}</td>
                    <td className="px-6 py-4 text-sm font-semibold">{log.status_code || '-'}</td>
                    <td className="px-6 py-4 text-xs font-mono text-zinc-500">{log.ip || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={(next) => setPage(Math.max(1, Math.min(totalPages, next)))}
        onPageSizeChange={(nextSize) => {
          setPage(1);
          setPageSize(nextSize);
        }}
      />
    </motion.div>
  );
}

function NoticeBoardView({ user }: { user: User, key?: string }) {
  const [notices, setNotices] = useState<NoticeThread[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [replyDrafts, setReplyDrafts] = useState<Record<number, string>>({});
  const canCreate = user.role === 'sysAdmin' || user.role === 'manager';

  const fetchNotices = async (targetPage = page, targetPageSize = pageSize) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', String(targetPageSize));
      if (includeArchived) params.set('includeArchived', 'true');
      const data = await apiRequest(`/api/notices?${params.toString()}`);
      setNotices(toNotices(data));
      const meta = getPaginationMeta(data);
      if (meta) {
        setPage(meta.page);
        setPageSize(meta.limit);
        setTotal(meta.total);
        setTotalPages(meta.totalPages);
      } else {
        const items = toNotices(data);
        setTotal(items.length);
        setTotalPages(1);
      }
    } catch (err) {
      setNotices([]);
      setTotal(0);
      setTotalPages(1);
      setError(err instanceof Error ? err.message : 'Failed to load notices');
    }
  };

  useEffect(() => {
    fetchNotices(page, pageSize);
  }, [page, pageSize, includeArchived]);

  useEffect(() => {
    setPage(1);
  }, [includeArchived]);

  const createNotice = async () => {
    setError('');
    try {
      await apiRequest('/api/notices', {
        method: 'POST',
        body: { title, message },
      });
      setTitle('');
      setMessage('');
      setShowCreate(false);
      setPage(1);
      fetchNotices(1, pageSize);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create notice');
    }
  };

  const archiveNotice = async (noticeId: number, archived: boolean) => {
    try {
      await apiRequest(`/api/notices/${noticeId}/archive`, {
        method: 'PATCH',
        body: { archived },
      });
      fetchNotices(page, pageSize);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update notice');
    }
  };

  const acknowledgeNotice = async (noticeId: number) => {
    try {
      await apiRequest(`/api/notices/${noticeId}/acknowledge`, { method: 'POST' });
      fetchNotices(page, pageSize);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to acknowledge notice');
    }
  };

  const sendReply = async (noticeId: number) => {
    const draft = (replyDrafts[noticeId] || '').trim();
    if (!draft) return;

    try {
      await apiRequest(`/api/notices/${noticeId}/replies`, {
        method: 'POST',
        body: { message: draft },
      });
      setReplyDrafts((prev) => ({ ...prev, [noticeId]: '' }));
      fetchNotices(page, pageSize);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send reply');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6 pb-6"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Notice Board</h2>
          <p className="text-zinc-500">Announcements, team threads, and acknowledgements.</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate && (
            <button
              onClick={() => setShowCreate((prev) => !prev)}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all"
            >
              {showCreate ? 'Close Composer' : 'Create Notice'}
            </button>
          )}
          <label className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(e) => setIncludeArchived(e.target.checked)}
              className="rounded border-zinc-300"
            />
            Show archived
          </label>
        </div>
      </header>

      {showCreate && canCreate && (
        <div className="bg-white border border-zinc-100 rounded-3xl p-5 shadow-sm space-y-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Notice title"
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Write the announcement or thread starter..."
            className="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-sm min-h-28 resize-y focus:outline-none focus:border-zinc-900"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">Visible to all users. Employees can acknowledge and reply.</p>
            <button
              type="button"
              onClick={createNotice}
              className="px-4 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all"
            >
              Publish
            </button>
          </div>
          {error && <p className="text-xs text-red-500 font-semibold">{error}</p>}
        </div>
      )}

      <div className="space-y-4">
        {notices.map((notice) => (
          <article key={notice.id} className="bg-white border border-zinc-100 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-lg font-bold">{notice.title}</h3>
                  {notice.is_archived === 1 && <Badge variant="pending">Archived</Badge>}
                </div>
                <p className="text-xs text-zinc-400">
                  Posted by {notice.created_by_name} • {formatDateTime(notice.created_at, 'Unknown time')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-500">{notice.acknowledgement_count} ack</span>
                <span className="text-xs font-semibold text-zinc-500">{notice.reply_count} replies</span>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => archiveNotice(notice.id, notice.is_archived === 0)}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 text-[11px] font-bold text-zinc-600 hover:bg-zinc-50"
                  >
                    {notice.is_archived === 1 ? 'Unarchive' : 'Archive'}
                  </button>
                )}
              </div>
            </div>

            <p className="text-sm text-zinc-700 whitespace-pre-wrap">{notice.message}</p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => acknowledgeNotice(notice.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                  notice.acknowledged_by_me
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50",
                )}
              >
                <CheckCheck size={14} />
                {notice.acknowledged_by_me ? 'Acknowledged' : 'Acknowledge'}
              </button>
            </div>

            <div className="space-y-2">
              {notice.replies.map((reply) => (
                <div key={reply.id} className="rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                  <p className="text-xs text-zinc-500">
                    <span className="font-bold text-zinc-700">{reply.user_name}</span> ({reply.role}) • {formatDateTime(reply.created_at, 'Unknown')}
                  </p>
                  <p className="text-sm text-zinc-700 whitespace-pre-wrap">{reply.message}</p>
                </div>
              ))}
              {notice.replies.length === 0 && <p className="text-xs text-zinc-400 italic">No replies yet.</p>}
            </div>

            {notice.is_archived === 0 && (
              <div className="flex gap-2">
                <input
                  value={replyDrafts[notice.id] || ''}
                  onChange={(e) => setReplyDrafts((prev) => ({ ...prev, [notice.id]: e.target.value }))}
                  placeholder="Reply to this thread..."
                  className="flex-1 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-100 text-sm focus:outline-none focus:border-zinc-900"
                />
                <button
                  type="button"
                  onClick={() => sendReply(notice.id)}
                  className="px-3 py-2 rounded-xl bg-zinc-900 text-white text-sm font-semibold hover:bg-zinc-800 transition-all inline-flex items-center gap-1.5"
                >
                  <Send size={14} />
                  Send
                </button>
              </div>
            )}
          </article>
        ))}
        {notices.length === 0 && (
          <div className="bg-white rounded-3xl border border-zinc-100 p-10 text-center shadow-sm">
            <MessageSquare size={32} className="mx-auto text-zinc-300 mb-3" />
            <p className="text-zinc-500 text-sm">No notices available for this page.</p>
          </div>
        )}
      </div>

      <PaginationControls
        page={page}
        pageSize={pageSize}
        total={total}
        totalPages={totalPages}
        onPageChange={(next) => setPage(Math.max(1, Math.min(totalPages, next)))}
        onPageSizeChange={(nextSize) => {
          setPage(1);
          setPageSize(nextSize);
        }}
      />
    </motion.div>
  );
}

function CalendarView({ user }: { user: User, key?: string }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);

  const fetchTasks = async () => {
    try {
      const pageSize = 200;
      let page = 1;
      let totalPages = 1;
      const nextTasks: Task[] = [];

      do {
        const data = await apiRequest(`/api/tasks?page=${page}&limit=${pageSize}&sort=deadline_asc&includeHistory=0`);
        nextTasks.push(...toTasks(data));
        totalPages = getPaginationMeta(data)?.totalPages || 1;
        page += 1;
      } while (page <= totalPages);

      setTasks(nextTasks);
    } catch {
      setTasks([]);
    }
  };

  const fetchEmployees = async () => {
    try {
      const data = toUsers(await apiRequest('/api/users'));
      if (user.role === 'sysAdmin') {
        setEmployees(data.filter((u: User) => u.role === 'employee' || u.role === 'manager'));
      } else {
        setEmployees(data.filter((u: User) => u.role === 'employee'));
      }
    } catch {
      setEmployees([]);
    }
  };

  useEffect(() => {
    fetchTasks();
    if (user.role === 'manager' || user.role === 'sysAdmin') fetchEmployees();
  }, []);

  const openTaskDetails = async (task: Task) => {
    try {
      const detailed = await apiRequest<Task>(`/api/tasks/${task.id}`);
      setSelectedTask(detailed);
    } catch {
      setSelectedTask(task);
    }
  };

  const deleteTask = async (taskId: number) => {
    try {
      await apiRequest(`/api/tasks/${taskId}`, { method: 'DELETE' });
      fetchTasks();
      setTaskToDelete(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToTaskMonth = (deadline: string) => {
    const parsed = parseAppDate(deadline);
    if (!parsed) return;
    setCurrentDate(parsed);
  };

  const tasksByDay = useMemo(() => {
    const priorityOrder: Record<Task['priority'], number> = { urgent: 4, high: 3, normal: 2, low: 1 };
    const map = new Map<string, Task[]>();

    for (const task of tasks) {
      const parsed = parseAppDate(task.deadline);
      if (!parsed) continue;
      const key = format(parsed, 'yyyy-MM-dd');
      const bucket = map.get(key) || [];
      bucket.push(task);
      map.set(key, bucket);
    }

    for (const [, bucket] of map) {
      bucket.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
    }

    return map;
  }, [tasks]);

  const getTasksForDay = (day: Date) => tasksByDay.get(format(day, 'yyyy-MM-dd')) || [];

  const monthTaskCount = useMemo(
    () =>
      tasks.filter((task) => {
        const parsed = parseAppDate(task.deadline);
        return parsed ? isSameMonth(parsed, currentDate) : false;
      }).length,
    [tasks, currentDate],
  );

  const nextUpcomingTask = useMemo(
    () =>
      [...tasks]
        .filter((task) => {
          const parsed = parseAppDate(task.deadline);
          return parsed ? parsed.getTime() >= Date.now() : false;
        })
        .sort((a, b) => {
          const aTime = parseAppDate(a.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
          const bTime = parseAppDate(b.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        })[0],
    [tasks],
  );

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8 h-full flex flex-col"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Calendar</h2>
          <p className="text-zinc-500">Visual overview of your deadlines.</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {monthTaskCount} task{monthTaskCount === 1 ? '' : 's'} this month
            </span>
            {monthTaskCount === 0 && nextUpcomingTask && (
              <button
                type="button"
                onClick={() => goToTaskMonth(nextUpcomingTask.deadline)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                Jump to next due: {formatDateTime(nextUpcomingTask.deadline)}
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white p-1.5 rounded-2xl border border-zinc-100 shadow-sm">
          <button onClick={prevMonth} className="p-2 hover:bg-zinc-50 rounded-xl transition-colors">
            <ChevronRight size={20} className="rotate-180" />
          </button>
          <span className="text-sm font-bold min-w-[120px] text-center">
            {format(currentDate, 'MMMM yyyy')}
          </span>
          <button onClick={nextMonth} className="p-2 hover:bg-zinc-50 rounded-xl transition-colors">
            <ChevronRight size={20} />
          </button>
        </div>
      </header>

      <div className="flex-1 bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden flex flex-col">
        {monthTaskCount === 0 && (
          <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs font-semibold">
            No tasks in {format(currentDate, 'MMMM yyyy')}. {nextUpcomingTask ? 'Use "Jump to next due" to navigate.' : 'Create a task to populate the calendar.'}
          </div>
        )}
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[760px] h-full flex flex-col">
            <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/50">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {day}
                </div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 auto-rows-fr">
              {calendarDays.map((day, idx) => {
                const dayTasks = getTasksForDay(day);
                const isCurrentMonth = isSameMonth(day, monthStart);
                
                return (
                  <div 
                    key={idx} 
                    className={cn(
                      "border-r border-b border-zinc-50 p-2 min-h-[120px] transition-colors",
                      !isCurrentMonth && "bg-zinc-50/30",
                      isToday(day) && "bg-blue-50/30"
                    )}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className={cn(
                        "text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full",
                        isToday(day) ? "bg-blue-600 text-white" : isCurrentMonth ? "text-zinc-900" : "text-zinc-300"
                      )}>
                        {format(day, 'd')}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayTasks.slice(0, 3).map(task => (
                        <button
                          key={task.id}
                          onClick={() => openTaskDetails(task)}
                          className={cn(
                            "w-full text-left p-1.5 rounded-lg text-[10px] font-semibold border transition-all",
                            task.priority === 'urgent' ? "bg-red-50 text-red-700 border-red-100" :
                            task.priority === 'high' ? "bg-orange-50 text-orange-700 border-orange-100" :
                            "bg-zinc-50 text-zinc-700 border-zinc-100"
                          )}
                        >
                          <p className="truncate">{task.title}</p>
                          <p className="text-[9px] font-mono uppercase opacity-70">{formatTaskTime(task.deadline)}</p>
                        </button>
                      ))}
                      {dayTasks.length > 3 && (
                        <p className="text-[10px] text-zinc-400 font-semibold">+{dayTasks.length - 3} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {selectedTask && (
          <TaskDetailModal 
            task={selectedTask} 
            user={user}
            employees={employees}
            onClose={() => setSelectedTask(null)} 
            onUpdate={fetchTasks}
            updateTaskStatus={async (id: number, status: string, remarks: string) => {
              await apiRequest(`/api/tasks/${id}/status`, {
                method: 'PATCH',
                body: { status, remarks },
              });
              fetchTasks();
            }}
            updateSubtask={async (id: number, status: string, remarks: string) => {
              await apiRequest(`/api/subtasks/${id}`, {
                method: 'PATCH',
                body: { status, remarks },
              });
              fetchTasks();
            }}
            onDelete={(task) => {
              setSelectedTask(null);
              setTaskToDelete(task);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {taskToDelete && (
          <ConfirmationDialog 
            title="Delete Task"
            message={`Are you sure you want to delete "${taskToDelete.title}"? This action cannot be undone.`}
            onConfirm={() => deleteTask(taskToDelete.id)}
            onCancel={() => setTaskToDelete(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
