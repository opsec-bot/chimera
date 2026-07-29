import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { getJson } from '../utils/api';
import { PageLayout } from '../components/PageLayout';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { UserManagement } from '../components/admin/UserManagement';
import { InviteManagement } from '../components/admin/InviteManagement';
import { SubmissionsManagement } from '../components/admin/SubmissionsManagement';
import { TelegramConfiguration } from '../components/admin/TelegramConfiguration';
import { ResetBotManagement } from '../components/admin/ResetBotManagement';
import { AnnouncementsManagement } from '../components/admin/AnnouncementsManagement';
import { DataExportManagement } from '../components/admin/DataExportManagement';
import { StubBuilderConfiguration } from '../components/admin/StubBuilderConfiguration';
import { SubscriptionCodesManagement } from '../components/admin/SubscriptionCodesManagement';
import { NotFound } from './NotFound';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import {
  Users,
  UserPlus,
  Database,
  MessageSquare,
  RefreshCw,
  Megaphone,
  Settings,
  Download,
  Hammer,
  DollarSign,
  TrendingUp,
  ArrowLeft,
  Shield,
} from 'lucide-react';
import { PaymentsAnalytics } from '../components/admin/PaymentsAnalytics';

type AdminTab =
  | 'submissions'
  | 'users'
  | 'invites'
  | 'telegram'
  | 'resetbot'
  | 'announcements'
  | 'export'
  | 'payments'
  | 'stubbuilder'
  | 'subscriptioncodes';

interface AdminSidebarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

function AdminSidebar({ activeTab, onTabChange }: AdminSidebarProps) {
  const menuItems = [
    { id: 'submissions' as AdminTab, label: 'Submissions', icon: Database },
    { id: 'users' as AdminTab, label: 'Users', icon: Users },
    { id: 'invites' as AdminTab, label: 'Invites', icon: UserPlus },
    { id: 'telegram' as AdminTab, label: 'Telegram logs', icon: MessageSquare },
    { id: 'resetbot' as AdminTab, label: 'Password Reset Bot', icon: RefreshCw },
    { id: 'announcements' as AdminTab, label: 'Announcements', icon: Megaphone },
    { id: 'export' as AdminTab, label: 'Export', icon: Download },
    { id: 'payments' as AdminTab, label: 'Payments', icon: DollarSign },
    { id: 'stubbuilder' as AdminTab, label: 'Stub Builder', icon: Hammer },
    { id: 'subscriptioncodes' as AdminTab, label: 'Subscription Codes', icon: TrendingUp },
  ];

  return (
    <nav className="w-64 bg-card border-r border-border flex-shrink-0 h-full">
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">Admin Panel</h2>
        <div className="flex flex-col gap-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <Button
                key={item.id}
                variant={isActive ? 'secondary' : 'ghost'}
                className={cn('w-full justify-start gap-3', isActive && 'font-medium')}
                onClick={() => onTabChange(item.id)}
              >
                <Icon className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

function AdminTabContent({ activeTab }: { activeTab: AdminTab }) {
  switch (activeTab) {
    case 'submissions':
      return <SubmissionsManagement />;

    case 'users':
      return <UserManagement />;

    case 'invites':
      return <InviteManagement />;

    case 'telegram':
      return <TelegramConfiguration />;

    case 'resetbot':
      return <ResetBotManagement />;

    case 'announcements':
      return <AnnouncementsManagement />;

    case 'export':
      return <DataExportManagement />;

    case 'payments':
      return <PaymentsAnalytics />;

    case 'stubbuilder':
      return <StubBuilderConfiguration />;

    case 'subscriptioncodes':
      return <SubscriptionCodesManagement />;

    default:
      return (
        <div className="flex flex-col gap-6">
          <h1 className="text-2xl font-bold">Admin Panel</h1>
          <div className="text-muted-foreground">Select a tab from the sidebar to get started.</div>
        </div>
      );
  }
}

export function AdminPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotFound, setShowNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('submissions');
  const [currentUser, setCurrentUser] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdminAccess = async () => {
      try {
        // Check if user is authenticated and has admin access
        const authResponse = await getJson('/auth/me');
        if (!authResponse || !authResponse.user) {
          navigate('/auth');
          return;
        }

        setCurrentUser(authResponse.user);

        // Check if user has admin access
        if (!authResponse.user.is_admin && !authResponse.user.isAdmin) {
          console.warn('Non-admin user attempted to access admin panel');
          setShowNotFound(true);
          setLoading(false);
          return;
        }

        // Set CSRF token for admin operations
        if (authResponse.csrfToken) {
          (window as any).__csrf = authResponse.csrfToken;
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Admin access check failed:', err);
        setError('Access denied or authentication failed');
        setLoading(false);
        // Redirect to auth page after a delay
        setTimeout(() => navigate('/auth'), 2000);
      }
    };

    checkAdminAccess();
  }, [navigate]);

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout', {
        method: 'POST',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });
      // Clear cached data after successful logout
      try {
        (window as any).__authMe = null;
        (window as any).__csrf = '';
        localStorage.clear();
      } catch (_) {}
      // Use window.location.href for full page reload to ensure clean state
      window.location.href = '/auth';
    } catch (err) {
      console.error('Logout failed:', err);
      // Even if logout request fails, clear client state and redirect
      try {
        (window as any).__authMe = null;
        (window as any).__csrf = '';
        localStorage.clear();
      } catch (_) {}
      window.location.href = '/auth';
    }
  };

  if (loading) {
    return (
      <PageLayout showProfile={false}>
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      </PageLayout>
    );
  }

  // Show NotFound component for non-admin users (hide admin panel existence)
  if (showNotFound) {
    return <NotFound />;
  }

  if (error) {
    return (
      <PageLayout showProfile={false}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-destructive mb-4">{error}</p>
            <Button onClick={() => navigate('/auth')}>Go to Login</Button>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout
      showProfile={false}
      actions={
        <div className="flex items-center gap-4">
          {currentUser && (
            <span className="text-sm text-muted-foreground">Welcome, {currentUser.username}</span>
          )}
          <Button
            onClick={() => navigate('/dashboard')}
            variant="ghost"
            size="sm"
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Button>
          <Button onClick={handleLogout} variant="outline" size="sm">
            Logout
          </Button>
        </div>
      }
      sidebar={<AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} />}
      fluid
    >
      <AdminTabContent activeTab={activeTab} />
    </PageLayout>
  );
}
