import multer from 'multer';
import path from 'path';
import { Request } from 'express';
import fs from 'fs';

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create user-specific upload directory
    const userId = (req as any).user?.id || 'unknown';
    const userDir = path.join(__dirname, '../../uploads/users', userId.toString());
    try {
      fs.mkdirSync(userDir, { recursive: true });
    } catch (err) {
      return cb(err as Error, '');
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const newName = `${timestamp}_${file.originalname}`;
    cb(null, newName);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 60 * 1024 * 1024 }, // 60MB limit
  fileFilter: (req, file, cb) => {
    // Accept all files for now, add validation as needed
    cb(null, true);
  },
});

/**
 * Save uploaded file (for controller use)
 * @param req Express request with user info
 * @param fieldName Field name for file
 */
export async function saveUploadedFile(
  req: Request,
  fieldName: string,
): Promise<string | undefined> {
  if (req.file) {
    return req.file.filename;
  }
  return undefined;
}
