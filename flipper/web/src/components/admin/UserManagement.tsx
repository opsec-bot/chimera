import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Search,
  RefreshCw,
  Key,
  Trash2,
  Calendar,
  Users,
  Shield,
  ChevronLeft,
  ChevronRight,
  Gift,
  DollarSign,
  Unlink,
} from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: number;
  username: string;
  is_admin: number;
  created_at: string;
  last_login: string | null;
  ip_address: string;
  invited_by: number | null;
  invited_by_username: string | null;
  invites_created: number;
  users_invited: number;
  has_active_subscription: number;
  subscription_end_date: string | null;
  telegram_username: string | null;
  telegram_user_id: string | null;
}
const isSoftDeleted = (u: User) => u.username.startsWith('__deleted__');

interface UserFilters {
  search: string;
  subscription: 'all' | 'active' | 'inactive';
  lastLoginAfter: string;
  lastLoginBefore: string;
}

interface UserManagementProps {
  // Props can be added here if needed
}

interface Filters {
  search: string;
  subscription: 'all' | 'active' | 'inactive';
  admin: 'all' | 'admin' | 'user';
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    subscription: 'all',
    admin: 'all',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [usersPerPage] = useState(10);

  // Modals
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showGrantDialog, setShowGrantDialog] = useState(false);
  const [showInvoicesDialog, setShowInvoicesDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [subscriptionType, setSubscriptionType] = useState<'WEEK' | 'MONTH' | 'THREE_MONTHS'>(
    'MONTH',
  );
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [invoicesPage, setInvoicesPage] = useState(1);
  const invoicesPerPage = 10;
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    applyFilters();
    setCurrentPage(1); // Reset to first page when filters change
  }, [users, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await fetch('/admin/api/users', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        toast.error('Failed to load users');
      }
    } catch (error) {
      console.error('Error loading users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = users;

    // Search filter
    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter((user) => {
        return (
          user.username.toLowerCase().includes(search) ||
          user.ip_address.toLowerCase().includes(search) ||
          (user.telegram_username && user.telegram_username.toLowerCase().includes(search))
        );
      });
    }

    // Subscription filter
    if (filters.subscription !== 'all') {
      filtered = filtered.filter((user) => {
        if (filters.subscription === 'active') return user.has_active_subscription === 1;
        if (filters.subscription === 'inactive') return user.has_active_subscription === 0;
        return true;
      });
    }

    // Admin filter
    if (filters.admin !== 'all') {
      filtered = filtered.filter((user) => {
        if (filters.admin === 'admin') return user.is_admin === 1;
        if (filters.admin === 'user') return user.is_admin === 0;
        return true;
      });
    }

    setFilteredUsers(filtered);
  };

  const resetPassword = async () => {
    if (!selectedUser || !newPassword.trim()) {
      toast.error('Please enter a new password');
      return;
    }

    try {
      const response = await fetch(`/admin/api/users/${selectedUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ newPassword: newPassword.trim() }),
      });

      if (response.ok) {
        toast.success(`Password reset for ${selectedUser.username}`);
        setShowResetDialog(false);
        setSelectedUser(null);
        setNewPassword('');
      } else {
        throw new Error('Failed to reset password');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error('Failed to reset password');
    }
  };

  const deleteUser = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/admin/api/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
      });

      if (response.ok) {
        toast.success(`User ${selectedUser.username} deleted`);
        setShowDeleteDialog(false);
        setSelectedUser(null);
        loadUsers(); // Reload the users list
      } else {
        throw new Error('Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const grantSubscription = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/admin/api/users/${selectedUser.id}/grant-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ subscription_type: subscriptionType }),
      });

      if (response.ok) {
        toast.success(`${subscriptionType} subscription granted to ${selectedUser.username}`);
        setShowGrantDialog(false);
        setSelectedUser(null);
        setSubscriptionType('MONTH');
        loadUsers(); // Reload to show updated subscription status
      } else {
        throw new Error('Failed to grant subscription');
      }
    } catch (error) {
      console.error('Error granting subscription:', error);
      toast.error('Failed to grant subscription');
    }
  };
  const openInvoices = async (user: User) => {
    setSelectedUser(user);
    setShowInvoicesDialog(true);
    setLoadingInvoices(true);
    setInvoicesPage(1);
    try {
      const resp = await fetch(`/admin/api/users/${user.id}/payments`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        setInvoices(data.payments || []);
      } else {
        toast.error('Failed to load invoices');
      }
    } catch (e) {
      console.error('Error loading invoices', e);
      toast.error('Failed to load invoices');
    } finally {
      setLoadingInvoices(false);
    }
  };

  const unlinkTelegram = async (user: User) => {
    if (!user) return;
    setUnlinkingId(user.id);
    try {
      const resp = await fetch(`/admin/api/users/${user.id}/telegram/unlink`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Failed');
      toast.success(`Telegram unlinked for ${user.username}`);
      await loadUsers();
    } catch (e) {
      toast.error('Failed to unlink telegram');
    } finally {
      setUnlinkingId(null);
    }
  };
  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US');
  };

  const getStatusBadge = (user: User) => {
    if (isSoftDeleted(user)) {
      return (
        <Badge variant="secondary">
          Deleted
        </Badge>
      );
    }
    if (user.is_admin === 1) {
      return (
        <Badge variant="destructive" className="gap-1">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      );
    }
    if (user.has_active_subscription === 1) {
      return (
        <Badge variant="success">Premium</Badge>
      );
    }
    return <Badge variant="secondary">Free</Badge>;
  };

  const getTelegramBadge = (user: User) => {
    if (user.telegram_user_id || user.telegram_username) {
      return (
        <div className="flex flex-col gap-1">
          {user.telegram_username && (
            <Badge variant="outline" className="text-info">
              @{user.telegram_username}
            </Badge>
          )}
          {user.telegram_user_id && (
            <div className="text-xs text-muted-foreground">ID: {user.telegram_user_id}</div>
          )}
        </div>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not linked
      </Badge>
    );
  };

  // Pagination calculations
  const totalPages = Math.ceil(filteredUsers.length / usersPerPage);
  const startIndex = (currentPage - 1) * usersPerPage;
  const endIndex = startIndex + usersPerPage;
  const currentUsers = filteredUsers.slice(startIndex, endIndex);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">User Management</h1>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users ({filteredUsers.length} total)
            </CardTitle>
            <Button onClick={loadUsers} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  placeholder="Username, IP, or Telegram..."
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Subscription Status</label>
              <Select
                value={filters.subscription}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, subscription: value as any }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  <SelectItem value="active">Premium</SelectItem>
                  <SelectItem value="inactive">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">User Type</label>
              <Select
                value={filters.admin}
                onValueChange={(value) => setFilters((prev) => ({ ...prev, admin: value as any }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="admin">Admins</SelectItem>
                  <SelectItem value="user">Regular Users</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">User</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Telegram</th>
                      <th className="text-left p-2">Invites</th>
                      <th className="text-left p-2">Subscription</th>
                      <th className="text-left p-2">Last Login</th>
                      <th className="text-left p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentUsers.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50">
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="font-medium">{user.username}</div>
                            <div className="text-xs text-muted-foreground">
                              ID: {user.id} | IP: {user.ip_address}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Created: {formatDate(user.created_at)}
                            </div>
                          </div>
                        </td>
                        <td className="p-2">{getStatusBadge(user)}</td>
                        <td className="p-2">{getTelegramBadge(user)}</td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm">Created: {user.invites_created}</div>
                            <div className="text-sm">Used: {user.users_invited}</div>
                            {user.invited_by_username && (
                              <div className="text-xs text-muted-foreground">
                                Invited by: {user.invited_by_username}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="text-sm">
                              {user.has_active_subscription === 1 ? 'Premium' : 'Free'}
                            </div>
                            {user.subscription_end_date && (
                              <div className="text-xs text-muted-foreground">
                                Until: {formatDate(user.subscription_end_date)}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="text-sm">{formatDate(user.last_login)}</div>
                        </td>
                        <td className="p-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openInvoices(user)}
                              title="View Invoices"
                            >
                              <DollarSign className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={unlinkingId === user.id}
                              onClick={() => unlinkTelegram(user)}
                              title="Unlink Telegram"
                              className={
                                user.telegram_username || user.telegram_user_id ? '' : 'hidden'
                              }
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                            {!isSoftDeleted(user) && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowResetDialog(true);
                                  }}
                                  title="Reset Password"
                                >
                                  <Key className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowGrantDialog(true);
                                  }}
                                  title="Grant Subscription"
                                >
                                  <Gift className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUser(user);
                                    setShowDeleteDialog(true);
                                  }}
                                  title="Delete User"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Reset password for user: {selectedUser?.username}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button onClick={resetPassword} disabled={!newPassword.trim()}>
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete user "{selectedUser?.username}"? This action cannot be
              undone and will remove all associated data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteUser} className="bg-destructive hover:bg-destructive/90">
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grant Subscription Dialog */}
      <Dialog open={showGrantDialog} onOpenChange={setShowGrantDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Grant Subscription</DialogTitle>
            <DialogDescription>
              Grant a subscription to user: {selectedUser?.username}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <label className="text-sm font-medium">Subscription Type</label>
              <Select
                value={subscriptionType}
                onValueChange={(value) =>
                  setSubscriptionType(value as 'WEEK' | 'MONTH' | 'THREE_MONTHS')
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEEK">1 Week</SelectItem>
                  <SelectItem value="MONTH">1 Month</SelectItem>
                  <SelectItem value="THREE_MONTHS">3 Months</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGrantDialog(false)}>
              Cancel
            </Button>
            <Button onClick={grantSubscription}>
              Grant Subscription
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Invoices Dialog */}
      <Dialog open={showInvoicesDialog} onOpenChange={setShowInvoicesDialog}>
        <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Invoices for {selectedUser?.username}</DialogTitle>
            <DialogDescription>
              Listing paid, pending, and expired invoices for this user (latest first)
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 border rounded-md overflow-hidden flex flex-col">
            {loadingInvoices ? (
              <div className="flex items-center justify-center p-8">
                <LoadingSpinner />
              </div>
            ) : invoices.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No invoices found.</div>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted z-10">
                      <tr className="border-b">
                        <th className="text-left p-2 min-w-[60px]">ID</th>
                        <th className="text-left p-2 min-w-[80px]">Amount</th>
                        <th className="text-left p-2 min-w-[70px]">Status</th>
                        <th className="text-left p-2 min-w-[80px]">Type</th>
                        <th className="text-left p-2 min-w-[60px]">Invites</th>
                        <th className="text-left p-2 min-w-[100px]">Track ID</th>
                        <th className="text-left p-2 min-w-[90px]">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices
                        .slice((invoicesPage - 1) * invoicesPerPage, invoicesPage * invoicesPerPage)
                        .map((inv) => (
                          <tr key={inv.id} className="border-b hover:bg-muted/50">
                            <td className="p-2">{inv.id}</td>
                            <td className="p-2 font-medium">
                              {inv.amount} {inv.currency || 'USD'}
                            </td>
                            <td className="p-2">
                              <Badge
                                variant={
                                  inv.status === 'PAID'
                                    ? 'default'
                                    : inv.status === 'PENDING'
                                      ? 'secondary'
                                      : 'outline'
                                }
                                className="text-xs px-2 py-1"
                              >
                                {inv.status}
                              </Badge>
                            </td>
                            <td className="p-2">{inv.payment_type || '-'}</td>
                            <td className="p-2">{inv.invite_count ?? '-'}</td>
                            <td className="p-2">
                              <div
                                className="font-mono text-xs max-w-[100px] truncate"
                                title={inv.oxapay_track_id}
                              >
                                {inv.oxapay_track_id || '-'}
                              </div>
                            </td>
                            <td className="p-2 text-xs">
                              {inv.created_at ? new Date(inv.created_at).toLocaleDateString() : '-'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {invoices.length > invoicesPerPage && (
                  <div className="flex-shrink-0 border-t bg-muted/30 p-3 flex flex-col gap-2">
                    <div className="text-center text-[11px] text-muted-foreground">
                      {invoices.length} invoices • Page {invoicesPage} of{' '}
                      {Math.ceil(invoices.length / invoicesPerPage)}
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setInvoicesPage((p) => Math.max(1, p - 1));
                            }}
                          />
                        </PaginationItem>
                        {Array.from({
                          length: Math.min(6, Math.ceil(invoices.length / invoicesPerPage)),
                        }).map((_, i) => {
                          const page = i + 1;
                          return (
                            <PaginationItem key={page}>
                              <PaginationLink
                                href="#"
                                isActive={page === invoicesPage}
                                onClick={(e) => {
                                  e.preventDefault();
                                  setInvoicesPage(page);
                                }}
                              >
                                {page}
                              </PaginationLink>
                            </PaginationItem>
                          );
                        })}
                        {Math.ceil(invoices.length / invoicesPerPage) > 6 && (
                          <PaginationItem>
                            <span className="px-2 text-xs">…</span>
                          </PaginationItem>
                        )}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setInvoicesPage((p) =>
                                Math.min(Math.ceil(invoices.length / invoicesPerPage), p + 1),
                              );
                            }}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="flex-shrink-0">
            <Button variant="outline" onClick={() => setShowInvoicesDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
