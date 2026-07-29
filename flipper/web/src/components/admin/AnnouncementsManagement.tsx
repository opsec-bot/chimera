import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Plus,
  Edit,
  Trash2,
  Send,
  Eye,
  EyeOff,
  Calendar,
  Users,
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Clock,
  Filter,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

interface Announcement {
  id?: number;
  title: string;
  message: string;
  isActive?: boolean;
  isPermanent?: boolean;
  expiresAt: string | null;
  createdAt?: string;
  createdBy?: number;
  createdByUsername?: string;
  updatedAt?: string;
  // Legacy fields for compatibility
  content?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  active?: boolean;
  priority?: 'low' | 'medium' | 'high';
  target_audience?: 'all' | 'premium' | 'free' | 'admins';
  views?: number;
  author?: string;
}

const ANNOUNCEMENT_TYPES = [
  { value: 'info', label: 'Information', icon: MessageSquare, color: 'bg-info' },
  { value: 'warning', label: 'Warning', icon: AlertCircle, color: 'bg-warning' },
  { value: 'success', label: 'Success', icon: CheckCircle, color: 'bg-success' },
  { value: 'error', label: 'Error', icon: AlertCircle, color: 'bg-destructive' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-muted-foreground' },
  { value: 'medium', label: 'Medium', color: 'bg-info' },
  { value: 'high', label: 'High', color: 'bg-destructive' },
];

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All Users' },
  { value: 'premium', label: 'Premium Users' },
  { value: 'free', label: 'Free Users' },
  { value: 'admins', label: 'Admins Only' },
];

export function AnnouncementsManagement() {
  const [loading, setLoading] = useState(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [filteredAnnouncements, setFilteredAnnouncements] = useState<Announcement[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterAudience, setFilterAudience] = useState<string>('all');

  // Form state
  const [formData, setFormData] = useState<{
    title: string;
    message: string;
    duration_days: number; // Duration in days
  }>({
    title: '',
    message: '',
    duration_days: 0, // Default to permanent
  });

  useEffect(() => {
    loadAnnouncements();
  }, []);

  useEffect(() => {
    filterAnnouncements();
  }, [announcements, searchTerm, filterStatus]); // Removed filterType, filterAudience - commented out for now

  const loadAnnouncements = async () => {
    try {
      setLoading(true);
      const response = await fetch('/admin/api/announcements', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to load announcements');
      }

      const data = await response.json();
      // The backend returns an array of announcements
      const announcements = data.announcements || [];
      setAnnouncements(announcements);
    } catch (error) {
      console.error('Error loading announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const filterAnnouncements = () => {
    let filtered = announcements;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (announcement) =>
          announcement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (announcement.message || announcement.content || '')
            .toLowerCase()
            .includes(searchTerm.toLowerCase()),
      );
    }

    // TODO: Type filter - implement later
    // if (filterType !== 'all') {
    //   filtered = filtered.filter((announcement) => announcement.type === filterType);
    // }

    // Status filter
    if (filterStatus !== 'all') {
      filtered = filtered.filter((announcement) => {
        const isActive = announcement.isActive ?? announcement.active ?? false;
        if (filterStatus === 'active') return isActive;
        if (filterStatus === 'inactive') return !isActive;
        if (filterStatus === 'expired') {
          return announcement.expiresAt && new Date(announcement.expiresAt) < new Date();
        }
        return true;
      });
    }

    // TODO: Audience filter - implement later
    // if (filterAudience !== 'all') {
    //   filtered = filtered.filter(
    //     (announcement) => (announcement.target_audience || 'all') === filterAudience,
    //   );
    // }

    setFilteredAnnouncements(filtered);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
      duration_days: 0,
    });
  };

  const handleCreate = async () => {
    try {
      if (!formData.title.trim() || !formData.message.trim()) {
        toast.error('Title and message are required');
        return;
      }

      if (formData.duration_days < 0) {
        toast.error('Duration cannot be negative (use 0 for permanent)');
        return;
      }

      // Send data directly to backend - let backend calculate expiresAt
      const payload = {
        title: formData.title,
        message: formData.message,
        duration_days: formData.duration_days,
      };

      const response = await fetch('/admin/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to create announcement');
      }

      toast.success('Announcement created successfully');
      setCreateDialogOpen(false);
      resetForm();
      loadAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error('Failed to create announcement');
    }
  };

  const handleEdit = async () => {
    try {
      if (!selectedAnnouncement || !formData.title.trim() || !formData.message.trim()) {
        toast.error('Title and message are required');
        return;
      }

      if (formData.duration_days < 0) {
        toast.error('Duration cannot be negative (use 0 for permanent)');
        return;
      }

      // Since there's no PUT endpoint, we create a new announcement (which deactivates the old one)
      const payload = {
        title: formData.title,
        message: formData.message,
        duration_days: formData.duration_days,
      };

      const response = await fetch('/admin/api/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Failed to update announcement');
      }

      toast.success('Announcement updated successfully');
      setEditDialogOpen(false);
      setSelectedAnnouncement(null);
      resetForm();
      loadAnnouncements();
    } catch (error) {
      console.error('Error updating announcement:', error);
      toast.error('Failed to update announcement');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch('/admin/api/announcements', {
        method: 'DELETE',
        headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to delete announcement');
      }

      toast.success('Announcement deleted successfully');
      loadAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error('Failed to delete announcement');
    }
  };

  const openEditDialog = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);

    // Calculate duration_days from expiresAt
    let duration_days = 0; // Default to permanent
    if (announcement.expiresAt && !announcement.isPermanent) {
      const expiresAt = new Date(announcement.expiresAt);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();
      duration_days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24))); // Convert to days
    }

    setFormData({
      title: announcement.title,
      message: announcement.message || announcement.content || '',
      duration_days: duration_days,
    });
    setEditDialogOpen(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const isExpired = (expiresAt: string | null) => {
    return expiresAt && new Date(expiresAt) < new Date();
  };

  const getTypeIcon = (type: string) => {
    const typeData = ANNOUNCEMENT_TYPES.find((t) => t.value === type);
    return typeData ? typeData.icon : MessageSquare;
  };

  const getTypeColor = (type: string) => {
    const typeData = ANNOUNCEMENT_TYPES.find((t) => t.value === type);
    return typeData ? typeData.color : 'bg-muted-foreground';
  };

  const getPriorityColor = (priority: string) => {
    const priorityData = PRIORITY_OPTIONS.find((p) => p.value === priority);
    return priorityData ? priorityData.color : 'bg-muted-foreground';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Announcements Management</h1>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Create Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Announcement</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Title *</label>
                <Input
                  placeholder="Announcement title"
                  value={formData.title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Message *</label>
                <Textarea
                  placeholder="Announcement content"
                  rows={4}
                  value={formData.message}
                  onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Duration (days) - 0 for permanent *</label>
                <Input
                  type="number"
                  min="0"
                  placeholder="1 (0 for permanent)"
                  value={formData.duration_days}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      duration_days: parseInt(e.target.value) || 0,
                    }))
                  }
                />
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={handleCreate} className="flex-1">
                  Create Announcement
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{announcements.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <Eye className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">
              {announcements.filter((a) => a.isActive ?? a.active ?? false).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">
              {announcements.filter((a) => isExpired(a.expiresAt)).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Views</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {announcements.reduce((sum, a) => sum + (a.views || 0), 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search announcements..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* TODO: Implement Type filter later */}
            {/* <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Type</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {ANNOUNCEMENT_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* TODO: Implement Audience filter later */}
            {/* <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Audience</label>
              <Select value={filterAudience} onValueChange={setFilterAudience}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Audiences</SelectItem>
                  {AUDIENCE_OPTIONS.map((audience) => (
                    <SelectItem key={audience.value} value={audience.value}>
                      {audience.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('');
                  // setFilterType('all'); // Commented out - filter not visible
                  setFilterStatus('all');
                  // setFilterAudience('all'); // Commented out - filter not visible
                }}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Announcements List */}
      <Card>
        <CardHeader>
          <CardTitle>Announcements ({filteredAnnouncements.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {filteredAnnouncements.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No announcements found</div>
            ) : (
              filteredAnnouncements.map((announcement) => {
                const TypeIcon = getTypeIcon(announcement.type || 'info');
                const expired = isExpired(announcement.expiresAt);
                const isActive = announcement.isActive ?? announcement.active ?? false;

                return (
                  <div key={announcement.id || 0} className="border rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`p-2 rounded-full ${getTypeColor(announcement.type || 'info')}`}
                        >
                          <TypeIcon className="h-4 w-4 text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{announcement.title}</h3>
                            <Badge variant={isActive && !expired ? 'default' : 'secondary'}>
                              {isActive ? (expired ? 'Expired' : 'Active') : 'Inactive'}
                            </Badge>
                            {announcement.priority && (
                              <Badge
                                variant="outline"
                                className={`${getPriorityColor(announcement.priority)} text-white`}
                              >
                                {announcement.priority}
                              </Badge>
                            )}
                            {announcement.isPermanent && (
                              <Badge variant="outline" className="bg-accent text-accent-foreground">
                                Permanent
                              </Badge>
                            )}
                          </div>

                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {announcement.message || announcement.content}
                          </p>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>
                              Target:{' '}
                              {AUDIENCE_OPTIONS.find(
                                (a) => a.value === (announcement.target_audience || 'all'),
                              )?.label || 'All Users'}
                            </span>
                            {announcement.views !== undefined && (
                              <span>Views: {announcement.views}</span>
                            )}
                            {announcement.createdAt && (
                              <span>Created: {formatDate(announcement.createdAt)}</span>
                            )}
                            {announcement.expiresAt && (
                              <span>Expires: {formatDate(announcement.expiresAt)}</span>
                            )}
                            {announcement.createdByUsername && (
                              <span>By: {announcement.createdByUsername}</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditDialog(announcement)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="outline">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Announcement</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{announcement.title}"? This action
                                cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(announcement.id || 0)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Title *</label>
              <Input
                placeholder="Announcement title"
                value={formData.title}
                onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Message *</label>
              <Textarea
                placeholder="Announcement content"
                rows={4}
                value={formData.message}
                onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Duration (days) - 0 for permanent *</label>
              <Input
                type="number"
                min="0"
                placeholder="1 (0 for permanent)"
                value={formData.duration_days}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, duration_days: parseInt(e.target.value) || 0 }))
                }
              />
            </div>

            <div className="flex gap-4 pt-4">
              <Button onClick={handleEdit} className="flex-1">
                Update Announcement
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setSelectedAnnouncement(null);
                  resetForm();
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
