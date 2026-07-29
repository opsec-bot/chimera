import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';

interface Invite {
  id: number;
  code: string;
  created_by: number;
  used_by: number | null;
  subscription_days: number | null;
  subscription_type: string | null;
  is_premium: boolean;
  target_user_id: number | null;
  created_at: string;
  used_at: string | null;
  is_active: boolean;
  created_by_username: string;
  used_by_username: string;
  target_user_username: string;
}

interface InviteFilters {
  search: string;
  status: 'all' | 'active' | 'used' | 'revoked';
  type: 'all' | 'premium' | 'assigned' | 'general';
}

export function InviteManagement() {
  const [loading, setLoading] = useState(true);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [filteredInvites, setFilteredInvites] = useState<Invite[]>([]);
  const [filters, setFilters] = useState<InviteFilters>({
    search: '',
    status: 'all',
    type: 'all',
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showRevokeDialog, setShowRevokeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedInvite, setSelectedInvite] = useState<Invite | null>(null);

  // Form states
  const [bulkCount, setBulkCount] = useState('');
  const [subscriptionType, setSubscriptionType] = useState('NONE');
  const [assignUsername, setAssignUsername] = useState('');
  const [availableUsers, setAvailableUsers] = useState<
    Array<{ id: number; username: string; email: string; created_at: string }>
  >([]);

  useEffect(() => {
    loadInvites();
    loadAvailableUsers();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [invites, filters]);

  const loadInvites = async () => {
    try {
      setLoading(true);

      const response = await fetch('/admin/api/invites', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load invites');
      }

      const data = await response.json();
      setInvites(data.invites || []);
    } catch (error) {
      console.error('Error loading invites:', error);
      toast.error('Failed to load invites');
    } finally {
      setLoading(false);
    }
  };

  const loadAvailableUsers = async () => {
    try {
      const response = await fetch('/admin/api/users/list', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setAvailableUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const applyFilters = () => {
    let filtered = invites;

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(
        (invite) =>
          invite.code.toLowerCase().includes(search) ||
          invite.created_by_username.toLowerCase().includes(search) ||
          invite.used_by_username.toLowerCase().includes(search) ||
          invite.target_user_username.toLowerCase().includes(search),
      );
    }

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter((invite) => {
        if (filters.status === 'active') return invite.is_active && !invite.used_by;
        if (filters.status === 'used') return !!invite.used_by;
        if (filters.status === 'revoked') return !invite.is_active;
        return true;
      });
    }

    if (filters.type && filters.type !== 'all') {
      filtered = filtered.filter((invite) => {
        if (filters.type === 'premium') return invite.is_premium;
        if (filters.type === 'assigned') return !!invite.target_user_id;
        if (filters.type === 'general') return !invite.is_premium && !invite.target_user_id;
        return true;
      });
    }

    setFilteredInvites(filtered);

    // Update pagination
    const newTotalPages = Math.ceil(filtered.length / pageSize);
    setTotalPages(newTotalPages);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      status: 'all',
      type: 'all',
    });
  };

  const createInvite = async () => {
    try {
      const response = await fetch('/admin/api/invites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to create invite');
      }

      const data = await response.json();
      toast.success(`Invite created: ${data.code}`);
      loadInvites();
    } catch (error) {
      console.error('Error creating invite:', error);
      toast.error('Failed to create invite');
    }
  };

  const createBulkInvites = async () => {
    try {
      const count = parseInt(bulkCount);
      if (isNaN(count) || count < 1 || count > 100) {
        toast.error('Please enter a valid number between 1 and 100');
        return;
      }

      const requestBody: any = { count };
      if (subscriptionType && subscriptionType !== 'NONE') {
        requestBody.subscription_type = subscriptionType;
      }

      const response = await fetch('/admin/api/invites/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('Failed to create bulk invites');
      }

      const data = await response.json();

      if (!data.invite_codes || !Array.isArray(data.invite_codes)) {
        throw new Error('Invalid response format: missing invite_codes array');
      }

      toast.success(`Created ${data.created_count || data.invite_codes.length} invites`);

      // Download the codes - use invite_codes from backend response
      downloadInviteCodes(data.invite_codes);

      setBulkCount('');
      setSubscriptionType('NONE');
      setShowBulkModal(false);
      loadInvites();
    } catch (error) {
      console.error('Error creating bulk invites:', error);
      toast.error('Failed to create bulk invites');
    }
  };

  const assignInvite = async () => {
    try {
      if (!assignUsername.trim()) {
        toast.error('Please enter a username');
        return;
      }

      // Find the user ID from the username
      const targetUser = availableUsers.find((user) => user.username === assignUsername.trim());
      if (!targetUser) {
        toast.error('User not found. Please select a valid username from the list.');
        return;
      }

      const response = await fetch('/admin/api/invites/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify({ targetUserId: targetUser.id }),
      });

      if (!response.ok) {
        throw new Error('Failed to assign invite');
      }

      const data = await response.json();
      toast.success(`Invite assigned to ${assignUsername}: ${data.code}`);
      loadInvites();
      setAssignUsername('');
      setShowAssignModal(false);
    } catch (error) {
      console.error('Error assigning invite:', error);
      toast.error('Failed to assign invite');
    }
  };
  const revokeInvite = async (inviteId: number) => {
    try {
      const response = await fetch(`/admin/api/invites/${inviteId}/revoke`, {
        method: 'POST',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to revoke invite');
      }

      toast.success('Invite revoked successfully');
      loadInvites();
    } catch (error) {
      console.error('Error revoking invite:', error);
      toast.error('Failed to revoke invite');
    } finally {
      setShowRevokeDialog(false);
      setSelectedInvite(null);
    }
  };

  const deleteInvite = async (inviteId: number) => {
    try {
      const response = await fetch(`/admin/api/invites/${inviteId}`, {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete invite');
      }

      toast.success('Invite deleted successfully');
      loadInvites();
    } catch (error) {
      console.error('Error deleting invite:', error);
      toast.error('Failed to delete invite');
    } finally {
      setShowDeleteDialog(false);
      setSelectedInvite(null);
    }
  };

  const openRevokeDialog = (invite: Invite) => {
    setSelectedInvite(invite);
    setShowRevokeDialog(true);
  };

  const openDeleteDialog = (invite: Invite) => {
    setSelectedInvite(invite);
    setShowDeleteDialog(true);
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Invite code copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const downloadInviteCodes = (codes: string[]) => {
    const content = codes.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invite-codes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getCurrentPageInvites = () => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return filteredInvites.slice(start, end);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getStatus = (invite: Invite): 'active' | 'used' | 'revoked' => {
    if (invite.used_by) return 'used';
    if (!invite.is_active) return 'revoked';
    return 'active';
  };

  const getType = (invite: Invite): 'premium' | 'assigned' | 'general' => {
    if (invite.is_premium) return 'premium';
    if (invite.target_user_id) return 'assigned';
    return 'general';
  };

  const getStatusBadge = (status: 'active' | 'used' | 'revoked') => {
    switch (status) {
      case 'active':
        return <Badge variant="info">Active</Badge>;
      case 'used':
        return <Badge variant="success">Used</Badge>;
      case 'revoked':
        return <Badge variant="destructive">Revoked</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: 'premium' | 'assigned' | 'general') => {
    switch (type) {
      case 'premium':
        return (
          <Badge variant="warning">Premium</Badge>
        );
      case 'assigned':
        return (
          <Badge variant="outline">Assigned</Badge>
        );
      case 'general':
        return <Badge variant="info">General</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invite Management</h1>
      </div>
      {/* Invites Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Invites ({filteredInvites.length})
            </CardTitle>
            <div className="flex gap-2">
              <Button onClick={createInvite} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Create Invite
              </Button>

              <Dialog open={showBulkModal} onOpenChange={setShowBulkModal}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Users className="h-4 w-4 mr-2" />
                    Bulk Create
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Bulk Invites</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm font-medium">Number of invites (1-100)</label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        value={bulkCount}
                        onChange={(e) => setBulkCount(e.target.value)}
                        placeholder="Enter number of invites"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">
                        Pre-load Subscription (Optional)
                      </label>
                      <Select value={subscriptionType} onValueChange={setSubscriptionType}>
                        <SelectTrigger>
                          <SelectValue placeholder="No subscription" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">No subscription</SelectItem>
                          <SelectItem value="WEEK">1 Week</SelectItem>
                          <SelectItem value="MONTH">1 Month</SelectItem>
                          <SelectItem value="THREE_MONTHS">3 Months</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={createBulkInvites} disabled={!bulkCount}>
                        Create Invites
                      </Button>
                      <Button variant="outline" onClick={() => setShowBulkModal(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    <UserPlus className="h-4 w-4 mr-2" />
                    Assign Invite
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Assign Invite to User</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm font-medium">Username</label>
                      <Input
                        value={assignUsername}
                        onChange={(e) => setAssignUsername(e.target.value)}
                        placeholder="Enter username"
                        list="available-users"
                      />
                      <datalist id="available-users">
                        {availableUsers.map((user) => (
                          <option key={user.id} value={user.username} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={assignInvite} disabled={!assignUsername.trim()}>
                        Assign Invite
                      </Button>
                      <Button variant="outline" onClick={() => setShowAssignModal(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              <Button onClick={() => loadInvites()} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Code, username..."
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select
                value={filters.status}
                onValueChange={(value: 'all' | 'active' | 'used' | 'revoked') =>
                  setFilters((prev) => ({ ...prev, status: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="used">Used</SelectItem>
                  <SelectItem value="revoked">Revoked</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Type</label>
              <Select
                value={filters.type}
                onValueChange={(value: 'all' | 'premium' | 'assigned' | 'general') =>
                  setFilters((prev) => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                  <SelectItem value="assigned">Assigned</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <Button onClick={applyFilters} size="sm">
              Apply Filters
            </Button>
            <Button onClick={clearFilters} variant="outline" size="sm">
              Clear Filters
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 font-medium">ID</th>
                      <th className="text-left p-2 font-medium">Code</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="text-left p-2 font-medium">Type</th>
                      <th className="text-left p-2 font-medium">Created</th>
                      <th className="text-left p-2 font-medium">Details</th>
                      <th className="text-left p-2 font-medium">Used At</th>
                      <th className="text-left p-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getCurrentPageInvites().map((invite) => (
                      <tr key={invite.id} className="border-b hover:bg-secondary/20">
                        <td className="p-2">{invite.id}</td>
                        <td className="p-2">
                          <code className="bg-secondary px-2 py-1 rounded text-sm">
                            {invite.code}
                          </code>
                        </td>
                        <td className="p-2">{getStatusBadge(getStatus(invite))}</td>
                        <td className="p-2">{getTypeBadge(getType(invite))}</td>
                        <td className="p-2">{formatDate(invite.created_at)}</td>
                        <td className="p-2">
                          <div className="flex flex-col gap-1">
                            <div className="text-xs text-muted-foreground">
                              Created by: {invite.created_by_username}
                            </div>
                            {invite.target_user_username && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-foreground">Assigned to:</span>
                                <span className="text-xs text-foreground font-medium">
                                  {invite.target_user_username}
                                </span>
                              </div>
                            )}
                            {invite.used_by_username && (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-success">Used by:</span>
                                <span className="text-xs text-success font-medium">
                                  {invite.used_by_username}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-2">{formatDate(invite.used_at)}</td>
                        <td className="p-2">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => copyToClipboard(invite.code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>

                            {getStatus(invite) === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openRevokeDialog(invite)}
                              >
                                <Trash2 className="h-3 w-3 text-warning" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex justify-between items-center mt-4">
                <div className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredInvites.length)} of{' '}
                  {filteredInvites.length} invites
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Revoke Confirmation Dialog */}
      <AlertDialog open={showRevokeDialog} onOpenChange={setShowRevokeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke invite "{selectedInvite?.code}"? This will make it
              unusable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedInvite && revokeInvite(selectedInvite.id)}
              className="bg-warning hover:bg-warning/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invite</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete invite "{selectedInvite?.code}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectedInvite && deleteInvite(selectedInvite.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
