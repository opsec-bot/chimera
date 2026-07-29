import express from 'express';
import { requireAuth } from '../middleware/auth';
import { StubBuilderController } from '../controllers/stubBuilderController';
import multer from 'multer';

// Configure multer for icon uploads in memory; the icon is small and only
// needed during build request handling.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!/\.ico$/i.test(file.originalname)) {
      return cb(new Error('Only .ico files are allowed'));
    }
    cb(null, true);
  },
  limits: { fileSize: 300 * 1024 }, // 300KB limit
});

// Simple metadata sanitizer: allow basic printable chars, strip quotes/backticks and control chars, limit length
export function sanitizeMeta(value?: string, max = 80): string | undefined {
  if (!value) return undefined;
  let cleaned = value
    .replace(/[\r\n\t`"']/g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
  if (cleaned.length > max) cleaned = cleaned.slice(0, max);
  return cleaned || undefined;
}

const router = express.Router();

// Builder UI is a separate frontend. Expose an API-only entry that verifies auth
// and subscription state.
router.get('/', requireAuth, (req, res) => {
  res.json({ message: 'Builder frontend is served separately. Use API routes for builds.' });
});

// API Routes (all require authentication and active subscription)
router.post('/api/build', requireAuth, upload.single('icon'), StubBuilderController.startBuild);
router.get('/api/status', requireAuth, StubBuilderController.getUserBuildStatus);
router.get('/api/build/:buildId', requireAuth, StubBuilderController.getBuildStatus);

// Download route (no auth required for the token-based download)
router.get('/api/download/:token', StubBuilderController.downloadExecutable);

export default router;
