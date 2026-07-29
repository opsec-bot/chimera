import express from 'express';
import path from 'path';
import fs from 'fs';
import { requireAccessKey, AuthenticatedRequest } from '../middleware/accessKey';
import { Logger } from '../utils/logger';

const router = express.Router();

/**
 * GET /asar - Download exodus.asar file with access key authentication
 *
 * Query parameters:
 * - file: The ASAR filename (must be 'exodus.asar')
 * - key: Valid access key from the database
 *
 * Example: /api/asar?file=exodus.asar&key=12345-ABCDE
 */
router.get('/', requireAccessKey, async (req: AuthenticatedRequest, res) => {
  try {
    const { file } = req.query;

    // Validate file parameter
    if (!file || file !== 'exodus.asar') {
      return res.status(400).json({
        error: 'Invalid file parameter. Only exodus.asar is supported.',
        usage: 'GET /api/asar?file=exodus.asar&key=YOUR_ACCESS_KEY',
      });
    }

    // Construct file path
    const assetsDir = path.join(__dirname, '../../assets');
    const filePath = path.join(assetsDir, 'exodus.asar');

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      Logger.error('ASAR file not found', {
        filePath,
        requestedBy: req.user?.username,
        accessKey: req.query.key ? String(req.query.key).substring(0, 4) + '****' : 'none',
      });

      return res.status(404).json({
        error: 'File not found',
        message: 'The requested ASAR file is not available',
      });
    }

    // Log the download request
    Logger.info('ASAR file download requested', {
      file: file as string,
      userId: req.user?.id,
      username: req.user?.username,
      accessKey: req.query.key ? String(req.query.key).substring(0, 4) + '****' : 'none',
      ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
    });

    // Get file stats
    const stats = fs.statSync(filePath);

    // Set appropriate headers for file download
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${file}"`);
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (error) => {
      Logger.error('Error streaming ASAR file', {
        error: error.message,
        filePath,
        userId: req.user?.id,
        username: req.user?.username,
      });

      if (!res.headersSent) {
        res.status(500).json({ error: 'Error reading file' });
      }
    });

    fileStream.pipe(res);

    // Log successful completion
    fileStream.on('end', () => {
      Logger.info('ASAR file download completed', {
        file: file as string,
        userId: req.user?.id,
        username: req.user?.username,
        fileSize: stats.size,
      });
    });
  } catch (error) {
    Logger.error('ASAR download error', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id,
      username: req.user?.username,
      query: req.query,
    });

    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process download request',
    });
  }
});

export default router;
