import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import {
  Download,
  Database,
  Users,
  CreditCard,
  MessageSquare,
  RefreshCw,
  Settings,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

interface ExportStats {
  total_users: number;
  total_subscriptions: number;
  total_submissions: number;
  total_announcements: number;
  database_size: string;
  last_backup: string | null;
}

type ExportJob = {
  id: string;
  type: string;
  status: string;
  parameters: { format?: string };
  created_at: string;
  completed_at?: string;
  file_size?: number;
  progress?: number;
  error_message?: string;
  download_url?: string;
};

const EXPORT_TYPES = [
  {
    value: 'users',
    label: 'Users',
    description: 'Export all user data including profiles and settings',
    icon: Users,
    color: 'bg-info',
  },
  {
    value: 'subscriptions',
    label: 'Subscriptions',
    description: 'Export subscription data and payment history',
    icon: CreditCard,
    color: 'bg-success',
  },
  {
    value: 'submissions',
    label: 'Submissions',
    description: 'Export submission data (browser, filesearch, wallets)',
    icon: Database,
    color: 'bg-accent',
  },
  {
    value: 'announcements',
    label: 'Announcements',
    description: 'Export announcement data and statistics',
    icon: MessageSquare,
    color: 'bg-warning',
  },
  {
    value: 'system',
    label: 'System Logs',
    description: 'Export system logs and configuration',
    icon: Settings,
    color: 'bg-muted-foreground',
  },
  {
    value: 'full',
    label: 'Full Database',
    description: 'Complete database backup (all data)',
    icon: Database,
    color: 'bg-destructive',
  },
];

const DATE_RANGES = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'Last 7 Days' },
  { value: 'month', label: 'Last 30 Days' },
  { value: 'quarter', label: 'Last 3 Months' },
  { value: 'year', label: 'Last Year' },
  { value: 'custom', label: 'Custom Range' },
];

const FORMATS = [
  { value: 'csv', label: 'CSV', description: 'Comma-separated values' },
  { value: 'json', label: 'JSON', description: 'JavaScript Object Notation' },
  { value: 'xlsx', label: 'Excel', description: 'Microsoft Excel format' },
  { value: 'sql', label: 'SQL', description: 'SQL dump (database only)' },
];

export function DataExportManagement() {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [stats, setStats] = useState<ExportStats | null>(null);

  // Export form state
  const [exportType, setExportType] = useState('users');
  const [dateRange, setDateRange] = useState('all');
  const [format, setFormat] = useState('csv');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);

  useEffect(() => {
    loadExportJobs();
    loadStats();

    // Set up polling for job status updates
    const interval = setInterval(() => {
      loadExportJobs();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadExportJobs = async () => {
    try {
      // Since we're using direct export, no jobs to load
      // Just set loading to false
      setJobs([]);
    } catch (error) {
      console.error('Error loading export jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch('/admin/api/export/stats', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading export stats:', error);
    }
  };

  const startExport = async () => {
    try {
      setExporting(true);

      // Validate custom date range
      if (dateRange === 'custom') {
        if (!startDate || !endDate) {
          toast.error('Start and end dates are required for custom range');
          return;
        }
        if (new Date(startDate) > new Date(endDate)) {
          toast.error('Start date must be before end date');
          return;
        }
      }

      const exportParams: any = {
        type: exportType,
        format,
        date_range: dateRange,
        include_deleted: includeDeleted,
      };

      if (dateRange === 'custom') {
        exportParams.start_date = startDate;
        exportParams.end_date = endDate;
      }

      const response = await fetch('/admin/api/export/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          format,
          dataTypes: [exportType],
          filters: {
            dateFrom: dateRange === 'custom' ? startDate : undefined,
            dateTo: dateRange === 'custom' ? endDate : undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to export data');
      }

      // Since the backend returns the file directly, trigger download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `admin_export_${exportType}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Export completed successfully');
    } catch (error: any) {
      console.error('Error exporting data:', error);
      toast.error(error.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const downloadExport = async (job: ExportJob) => {
    // Since we're using direct exports, this triggers a new export
    if (!job.type) return;

    setExporting(true);
    try {
      const response = await fetch('/admin/api/export/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          format: 'json',
          dataTypes: [job.type],
          filters: {},
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to export data');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_${job.type}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export downloaded successfully');
    } catch (error) {
      console.error('Error downloading export:', error);
      toast.error('Failed to download export');
    } finally {
      setExporting(false);
    }
  };

  const deleteJob = async (jobId: string) => {
    // Since we're using direct exports, no jobs to delete
    // This function is kept for compatibility but does nothing
    toast.info('No jobs to delete with direct export');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return CheckCircle;
      case 'processing':
        return Clock;
      case 'failed':
        return AlertCircle;
      default:
        return Clock;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'text-success';
      case 'processing':
        return 'text-info';
      case 'failed':
        return 'text-destructive';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTypeConfig = (type: string) => {
    return EXPORT_TYPES.find((t) => t.value === type) || EXPORT_TYPES[0];
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
        <h1 className="text-2xl font-bold">Data Export Management</h1>
        <Button onClick={loadExportJobs} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_users.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Subscriptions</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_subscriptions.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Submissions</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_submissions.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Announcements</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_announcements.toLocaleString()}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">DB Size</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{stats.database_size}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-0 pb-2">
              <CardTitle className="text-sm font-medium">Last Backup</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">
                {stats.last_backup ? formatDate(stats.last_backup) : 'Never'}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Export Form */}
      <Card>
        <CardHeader>
          <CardTitle>Create New Export</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Export Type</label>
                <Select value={exportType} onValueChange={setExportType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPORT_TYPES.map((type) => {
                      const Icon = type.icon;
                      return (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {getTypeConfig(exportType).description}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Format</label>
                <Select value={format} onValueChange={setFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.filter((f) => {
                      if (exportType === 'full') return f.value === 'sql';
                      return f.value !== 'sql';
                    }).map((format) => (
                      <SelectItem key={format.value} value={format.value}>
                        <div>
                          <div className="font-medium">{format.label}</div>
                          <div className="text-xs text-muted-foreground">{format.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Date Range</label>
                <Select value={dateRange} onValueChange={setDateRange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_RANGES.map((range) => (
                      <SelectItem key={range.value} value={range.value}>
                        {range.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Start Date</label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">End Date</label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Options</label>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeDeleted}
                      onChange={(e) => setIncludeDeleted(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm">Include deleted records</span>
                  </label>
                </div>
              </div>

              <Button onClick={startExport} disabled={exporting} className="w-full">
                {exporting ? (
                  <>
                    <LoadingSpinner size="sm" className="mr-2" />
                    Starting Export...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Start Export
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Export History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {jobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No export jobs found</div>
            ) : (
              jobs.map((job) => {
                const StatusIcon = getStatusIcon(job.status);
                const typeConfig = getTypeConfig(job.type);
                const TypeIcon = typeConfig.icon;

                return (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${typeConfig.color}`}>
                          <TypeIcon className="h-4 w-4 text-white" />
                        </div>

                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium">{typeConfig.label} Export</h3>
                            <StatusIcon className={`h-4 w-4 ${getStatusColor(job.status)}`} />
                            <span className={`text-sm capitalize ${getStatusColor(job.status)}`}>
                              {job.status}
                            </span>
                          </div>

                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Format: {job.parameters.format?.toUpperCase()}</span>
                            <span>Created: {formatDate(job.created_at)}</span>
                            {job.completed_at && (
                              <span>Completed: {formatDate(job.completed_at)}</span>
                            )}
                            {job.file_size && <span>Size: {formatFileSize(job.file_size)}</span>}
                          </div>

                          {job.status === 'processing' && (
                            <div className="mt-2">
                              <div className="w-full bg-muted-foreground/20 rounded-full h-2">
                                <div
                                  className="bg-info h-2 rounded-full transition-all duration-300"
                                  style={{ width: `${job.progress}%` }}
                                ></div>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {job.progress}% complete
                              </div>
                            </div>
                          )}

                          {job.error_message && (
                            <div className="mt-2 text-sm text-destructive">
                              Error: {job.error_message}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {job.status === 'completed' && job.download_url && (
                          <Button size="sm" onClick={() => downloadExport(job)}>
                            <Download className="h-4 w-4 mr-2" />
                            Download
                          </Button>
                        )}

                        <Button size="sm" variant="outline" onClick={() => deleteJob(job.id)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
