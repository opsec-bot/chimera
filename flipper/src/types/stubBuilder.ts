export interface BuildRequest {
  accessKey: string;
}

export interface BuildCustomization {
  fileDescription?: string;
  productName?: string;
  productVersion?: string;
  companyName?: string;
  originalFilename?: string;
  internalName?: string;
  // Path to a temporary uploaded icon file (.ico). If provided it will replace template icon.ico
  iconPath?: string;
  // Raw icon buffer (preferred to avoid race with temp cleanup)
  iconBuffer?: Buffer;
}

export interface BuildResponse {
  buildId: string;
  status: 'building' | 'completed' | 'failed';
  downloadUrl?: string;
  error?: string;
  expiresAt?: string;
}

export interface BuildJob {
  id: string;
  userId: number;
  accessKey: string;
  status: 'building' | 'completed' | 'failed';
  workingDirectory: string;
  executablePath?: string;
  downloadUrl?: string;
  createdAt: Date;
  completedAt?: Date;
  expiresAt: Date;
  downloaded: boolean;
  error?: string;
  customization?: BuildCustomization;
}

export interface DownloadToken {
  token: string;
  buildId: string;
  expiresAt: Date;
  used: boolean;
}
