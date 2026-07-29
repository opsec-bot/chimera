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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Search,
  RefreshCw,
  Plus,
  Trash2,
  Copy,
  Calendar,
  Users,
  Clock,
  TrendingUp,
  Gift,
} from 'lucide-react';
import { toast } from 'sonner';

interface SubscriptionCode {
  id: number;
  code: string;
  state: 'active' | 'used' | 'expired';
  oneTimeUse: boolean;
  redeemedBy: string | null;
  redeemerUsernames?: Array<{ id: number; username: string }>;
  createdBy: number;
  createdAt: string;
  expiresAt: string | null;
  timeValueDays: number;
  eligibleUsers: 'all' | 'premium' | 'active_subscribers' | 'new_users';
  maxRedemptions: number | null;
  redemptionCount: number;
  specificUserIds: string | null;
  searchVector: string | null;
}

interface SubscriptionCodeStats {
  total: number;
  active: number;
  used: number;
  expired: number;
  totalDaysGranted: number;
}

interface CreateCodeRequest {
  timeValueDays: number;
  expiresAt?: string;
  oneTimeUse: boolean;
  eligibleUsers: 'all' | 'premium' | 'active_subscribers' | 'new_users';
  maxRedemptions?: number;
  specificUserIds?: number[];
}

interface BulkCreateCodeRequest extends CreateCodeRequest {
  count: number;
}

export function SubscriptionCodesManagement() {
  const [codes, setCodes] = useState<SubscriptionCode[]>([]);
  const [stats, setStats] = useState<SubscriptionCodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterState, setFilterState] = useState<string>('all');
  const [filterEligible, setFilterEligible] = useState<string>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showBulkCreateDialog, setShowBulkCreateDialog] = useState(false);

  // Create code form state
  const [createForm, setCreateForm] = useState<CreateCodeRequest>({
    timeValueDays: 30,
    oneTimeUse: true,
    eligibleUsers: 'all',
    maxRedemptions: undefined,
    specificUserIds: undefined,
  });

  // Bulk create form state
  const [bulkCreateForm, setBulkCreateForm] = useState<BulkCreateCodeRequest>({
    count: 10,
    timeValueDays: 30,
    oneTimeUse: true,
    eligibleUsers: 'all',
    maxRedemptions: undefined,
    specificUserIds: undefined,
  });

  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    loadCodes();
    loadStats();
  }, []);

  const loadCodes = async () => {
    try {
      const response = await fetch('/subscription-codes/admin/all', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setCodes(data.codes || []);
      } else {
        toast.error('Failed to load subscription codes');
      }
    } catch (error) {
      toast.error('Error loading subscription codes');
      console.error('Load codes error:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/subscription-codes/admin/stats', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Load stats error:', error);
    }
  };

  const createCode = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/subscription-codes/admin/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(createForm),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Subscription code created successfully');
        setShowCreateDialog(false);
        loadCodes();
        loadStats();
        // Reset form
        setCreateForm({
          timeValueDays: 30,
          oneTimeUse: true,
          eligibleUsers: 'all',
        });
      } else {
        toast.error(data.message || 'Failed to create subscription code');
      }
    } catch (error) {
      toast.error('Error creating subscription code');
      console.error('Create code error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const bulkCreateCodes = async () => {
    setIsCreating(true);
    try {
      const response = await fetch('/subscription-codes/admin/bulk-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(bulkCreateForm),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`${bulkCreateForm.count} subscription codes created successfully`);
        setShowBulkCreateDialog(false);
        loadCodes();
        loadStats();
        // Reset form
        setBulkCreateForm({
          count: 10,
          timeValueDays: 30,
          oneTimeUse: true,
          eligibleUsers: 'all',
        });
      } else {
        toast.error(data.message || 'Failed to create subscription codes');
      }
    } catch (error) {
      toast.error('Error creating subscription codes');
      console.error('Bulk create codes error:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteCode = async (codeId: number) => {
    try {
      const response = await fetch(`/subscription-codes/admin/${codeId}`, {
        method: 'DELETE',
        headers: {
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Subscription code deleted successfully');
        loadCodes();
        loadStats();
      } else {
        toast.error(data.message || 'Failed to delete subscription code');
      }
    } catch (error) {
      toast.error('Error deleting subscription code');
      console.error('Delete code error:', error);
    }
  };

  const copyCodeToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('Code copied to clipboard');
    } catch (error) {
      toast.error('Failed to copy code');
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'active':
        return 'bg-success/15 text-success';
      case 'used':
        return 'bg-info/15 text-info';
      case 'expired':
        return 'bg-destructive/20 text-destructive';
      default:
        return 'bg-card text-card-foreground';
    }
  };

  const getEligibilityColor = (eligibility: string) => {
    switch (eligibility) {
      case 'premium':
        return 'bg-accent text-accent-foreground';
      case 'active_subscribers':
        return 'bg-success/15 text-success';
      case 'new_users':
        return 'bg-info/15 text-info';
      default:
        return 'bg-card text-card-foreground';
    }
  };

  const getEligibilityLabel = (eligibility: string) => {
    switch (eligibility) {
      case 'premium':
        return 'Premium History';
      case 'active_subscribers':
        return 'Active Subs';
      case 'new_users':
        return 'New Users';
      case 'all':
      default:
        return 'All Users';
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never expires';
    return new Date(dateString).toLocaleDateString();
  };

  const getRedeemedCount = (redeemedBy: string | null) => {
    if (!redeemedBy) return 0;
    try {
      const redeemed = JSON.parse(redeemedBy);
      return Array.isArray(redeemed) ? redeemed.length : 0;
    } catch {
      return 0;
    }
  };

  const renderRedeemedBy = (code: SubscriptionCode) => {
    // First check if we have enhanced redeemer usernames data
    if (code.redeemerUsernames && code.redeemerUsernames.length > 0) {
      if (code.redeemerUsernames.length === 1) {
        const redeemer = code.redeemerUsernames[0];
        return <span className="text-sm font-medium">{redeemer.username}</span>;
      } else {
        return (
          <div className="text-sm">
            <span className="font-medium">{code.redeemerUsernames.length} users</span>
          </div>
        );
      }
    }

    // Check if code has been redeemed at all
    const hasBeenRedeemed = (code.redemptionCount && code.redemptionCount > 0) || code.redeemedBy;

    if (!hasBeenRedeemed) {
      return <span className="text-muted-foreground text-sm">Not redeemed</span>;
    }

    // Try to parse redeemedBy for user IDs (prioritize this over just showing "Redeemed")
    if (code.redeemedBy) {
      try {
        // Handle both string and already-parsed array cases
        let redeemedUserIds;
        if (typeof code.redeemedBy === 'string') {
          redeemedUserIds = JSON.parse(code.redeemedBy);
        } else {
          redeemedUserIds = code.redeemedBy;
        }

        if (Array.isArray(redeemedUserIds) && redeemedUserIds.length > 0) {
          if (redeemedUserIds.length === 1) {
            return <span className="text-sm font-medium">User #{redeemedUserIds[0]}</span>;
          } else {
            return (
              <div className="text-sm">
                <span className="font-medium">{redeemedUserIds.length} users</span>
              </div>
            );
          }
        }
      } catch (error) {
        console.log(
          'Error parsing redeemedBy for code',
          code.code,
          ':',
          error,
          'Data:',
          code.redeemedBy,
        );
        // Continue to fallback
      }
    }

    // Special case: If redemptionCount > 0 but no redeemedBy data (legacy codes)
    if (code.redemptionCount && code.redemptionCount > 0) {
      // For used one-time codes, we know someone redeemed it but don't have the user data
      if (code.oneTimeUse && code.state === 'used' && code.redemptionCount === 1) {
        return <span className="text-sm text-warning">Redeemed (user data missing)</span>;
      } else {
        return (
          <span className="text-sm">
            {code.redemptionCount === 1
              ? 'Redeemed (1 user)'
              : `${code.redemptionCount} redemptions`}
          </span>
        );
      }
    }

    return <span className="text-muted-foreground text-sm">Invalid data</span>;
  };

  // Filter codes based on search and filters
  const filteredCodes = codes.filter((code) => {
    const matchesSearch = code.code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesState = filterState === 'all' || code.state === filterState;
    const matchesEligible = filterEligible === 'all' || code.eligibleUsers === filterEligible;

    return matchesSearch && matchesState && matchesEligible;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Subscription Codes</h3>
          <p className="text-sm text-muted-foreground">
            Manage subscription extension codes for users
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create Subscription Code</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Duration (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={createForm.timeValueDays}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, timeValueDays: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Expiration Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={createForm.expiresAt || ''}
                    onChange={(e) =>
                      setCreateForm({ ...createForm, expiresAt: e.target.value || undefined })
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={createForm.oneTimeUse}
                    onCheckedChange={(checked) =>
                      setCreateForm({ ...createForm, oneTimeUse: checked })
                    }
                  />
                  <Label>One-time use only</Label>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Eligible Users</Label>
                  <Select
                    value={createForm.eligibleUsers}
                    onValueChange={(
                      value: 'all' | 'premium' | 'active_subscribers' | 'new_users',
                    ) => setCreateForm({ ...createForm, eligibleUsers: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="premium">Users with Subscription History</SelectItem>
                      <SelectItem value="active_subscribers">Active Subscribers Only</SelectItem>
                      <SelectItem value="new_users">New Users Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Max Redemptions - only for universal codes */}
                {!createForm.oneTimeUse && (
                  <div className="flex flex-col gap-2">
                    <Label>Max Redemptions (Universal Codes)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10000"
                      placeholder="Leave empty for unlimited"
                      value={createForm.maxRedemptions || ''}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          maxRedemptions: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                    />
                    <div className="text-xs text-muted-foreground">
                      Limits how many times this universal code can be redeemed
                    </div>
                  </div>
                )}

                {/* Specific User IDs */}
                <div className="flex flex-col gap-2">
                  <Label>Specific User IDs (Optional)</Label>
                  <Input
                    placeholder="Enter comma-separated user IDs (e.g., 1, 5, 10)"
                    value={createForm.specificUserIds ? createForm.specificUserIds.join(', ') : ''}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (!value) {
                        setCreateForm({ ...createForm, specificUserIds: undefined });
                      } else {
                        const userIds = value
                          .split(',')
                          .map((id) => parseInt(id.trim()))
                          .filter((id) => !isNaN(id) && id > 0);
                        setCreateForm({
                          ...createForm,
                          specificUserIds: userIds.length > 0 ? userIds : undefined,
                        });
                      }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    Restrict code to specific users only (overrides eligibility settings)
                  </div>
                </div>

                <Button onClick={createCode} disabled={isCreating} className="w-full">
                  {isCreating ? <LoadingSpinner /> : 'Create Code'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showBulkCreateDialog} onOpenChange={setShowBulkCreateDialog}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Users className="h-4 w-4 mr-2" />
                Bulk Create
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Bulk Create Subscription Codes</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label>Number of Codes</Label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={bulkCreateForm.count}
                    onChange={(e) =>
                      setBulkCreateForm({ ...bulkCreateForm, count: parseInt(e.target.value) || 1 })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Duration (Days)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="365"
                    value={bulkCreateForm.timeValueDays}
                    onChange={(e) =>
                      setBulkCreateForm({
                        ...bulkCreateForm,
                        timeValueDays: parseInt(e.target.value) || 1,
                      })
                    }
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Expiration Date (Optional)</Label>
                  <Input
                    type="datetime-local"
                    value={bulkCreateForm.expiresAt || ''}
                    onChange={(e) =>
                      setBulkCreateForm({
                        ...bulkCreateForm,
                        expiresAt: e.target.value || undefined,
                      })
                    }
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={bulkCreateForm.oneTimeUse}
                    onCheckedChange={(checked) =>
                      setBulkCreateForm({ ...bulkCreateForm, oneTimeUse: checked })
                    }
                  />
                  <Label>One-time use only</Label>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Eligible Users</Label>
                  <Select
                    value={bulkCreateForm.eligibleUsers}
                    onValueChange={(
                      value: 'all' | 'premium' | 'active_subscribers' | 'new_users',
                    ) => setBulkCreateForm({ ...bulkCreateForm, eligibleUsers: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="premium">Users with Subscription History</SelectItem>
                      <SelectItem value="active_subscribers">Active Subscribers Only</SelectItem>
                      <SelectItem value="new_users">New Users Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Max Redemptions - only for universal codes */}
                {!bulkCreateForm.oneTimeUse && (
                  <div className="flex flex-col gap-2">
                    <Label>Max Redemptions per Code (Universal Codes)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="10000"
                      placeholder="Leave empty for unlimited"
                      value={bulkCreateForm.maxRedemptions || ''}
                      onChange={(e) =>
                        setBulkCreateForm({
                          ...bulkCreateForm,
                          maxRedemptions: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                    />
                    <div className="text-xs text-muted-foreground">
                      Limits how many times each universal code can be redeemed
                    </div>
                  </div>
                )}

                {/* Specific User IDs */}
                <div className="flex flex-col gap-2">
                  <Label>Specific User IDs (Optional)</Label>
                  <Input
                    placeholder="Enter comma-separated user IDs (e.g., 1, 5, 10)"
                    value={
                      bulkCreateForm.specificUserIds
                        ? bulkCreateForm.specificUserIds.join(', ')
                        : ''
                    }
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      if (!value) {
                        setBulkCreateForm({ ...bulkCreateForm, specificUserIds: undefined });
                      } else {
                        const userIds = value
                          .split(',')
                          .map((id) => parseInt(id.trim()))
                          .filter((id) => !isNaN(id) && id > 0);
                        setBulkCreateForm({
                          ...bulkCreateForm,
                          specificUserIds: userIds.length > 0 ? userIds : undefined,
                        });
                      }
                    }}
                  />
                  <div className="text-xs text-muted-foreground">
                    Restrict all codes to specific users only (overrides eligibility settings)
                  </div>
                </div>

                <Button onClick={bulkCreateCodes} disabled={isCreating} className="w-full">
                  {isCreating ? <LoadingSpinner /> : `Create ${bulkCreateForm.count} Codes`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Gift className="h-4 w-4 text-muted-foreground" />
                <div className="text-2xl font-bold">{stats.total}</div>
              </div>
              <p className="text-xs text-muted-foreground">Total Codes</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-success" />
                <div className="text-2xl font-bold">{stats.active}</div>
              </div>
              <p className="text-xs text-muted-foreground">Active</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-info" />
                <div className="text-2xl font-bold">{stats.used}</div>
              </div>
              <p className="text-xs text-muted-foreground">Used</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-destructive" />
                <div className="text-2xl font-bold">{stats.expired}</div>
              </div>
              <p className="text-xs text-muted-foreground">Expired</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-foreground" />
                <div className="text-2xl font-bold">{stats.totalDaysGranted}</div>
              </div>
              <p className="text-xs text-muted-foreground">Total Days</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>

            <Select value={filterState} onValueChange={setFilterState}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="used">Used</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterEligible} onValueChange={setFilterEligible}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Eligibility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={loadCodes}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Codes Table */}
      <Card>
        <CardHeader>
          <CardTitle>Subscription Codes ({filteredCodes.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">State</th>
                  <th className="text-left py-2">Duration</th>
                  <th className="text-left py-2">Eligibility</th>
                  <th className="text-left py-2">Usage</th>
                  <th className="text-left py-2">Redeemed By</th>
                  <th className="text-left py-2">Expires</th>
                  <th className="text-left py-2">Created</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCodes.map((code) => (
                  <tr key={code.id} className="border-b">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                          {code.code}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyCodeToClipboard(code.code)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                    <td className="py-2">
                      <Badge className={getStateColor(code.state)}>{code.state}</Badge>
                    </td>
                    <td className="py-2">{code.timeValueDays} days</td>
                    <td className="py-2">
                      <Badge className={getEligibilityColor(code.eligibleUsers)}>
                        {getEligibilityLabel(code.eligibleUsers)}
                      </Badge>
                    </td>
                    <td className="py-2">
                      {code.oneTimeUse
                        ? `${code.redemptionCount || 0}/1`
                        : `${code.redemptionCount || 0}/${code.maxRedemptions || '∞'}`}
                      {code.specificUserIds && (
                        <div className="text-xs text-muted-foreground mt-1">
                          Specific users only
                        </div>
                      )}
                    </td>
                    <td className="py-2">{renderRedeemedBy(code)}</td>
                    <td className="py-2 text-sm">{formatDate(code.expiresAt)}</td>
                    <td className="py-2 text-sm">{formatDate(code.createdAt)}</td>
                    <td className="py-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Subscription Code</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete code "{code.code}"? This action cannot
                              be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteCode(code.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredCodes.length === 0 && (
            <div className="text-center py-8">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No subscription codes found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || filterState !== 'all' || filterEligible !== 'all'
                  ? 'No codes match your current filters.'
                  : 'Create your first subscription code to get started.'}
              </p>
              {!searchTerm && filterState === 'all' && filterEligible === 'all' && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create First Code
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
