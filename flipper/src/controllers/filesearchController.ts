import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/accessKey';
import { SubmissionService, SubmissionType } from '../services/submissionService';
import { Logger } from '../utils/logger';

const filesearchDataSchema = z.object({
  data: z.array(
    z.object({
      pattern: z.string(),
      file: z.string(),
      line: z.string(),
    }),
  ),
  mnemonic: z.string().optional(),
});

export const filesearchController = {
  /**
   * Handles uploading filesearch data.
   * Saves each result to the filesearch_submissions table.
   */
  uploadFilesearchData: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      let data: string | undefined;
      let filePath: string | undefined;
      let fileName: string | undefined;

      // Handle file upload
      if (req.file) {
        filePath = req.file.path;
        fileName = req.file.filename;
      }

      // Handle JSON data
      if (req.body && Object.keys(req.body).length > 0) {
        const parsedData = filesearchDataSchema.parse(req.body);
        data = JSON.stringify(parsedData);
      }

      if (!data && !filePath) {
        return res.status(400).json({ error: 'No data or file provided' });
      }

      // Save submission to database
      await SubmissionService.createSubmission(
        req.user!.id,
        'filesearch',
        data,
        filePath,
        fileName,
        ipAddress,
      );

      res.status(200).json({ message: 'Filesearch data received successfully' });
    } catch (error: any) {
      Logger.error('Filesearch upload error', {
        userId: req.user?.id,
        hasFile: !!req.file,
        hasBody: !!req.body,
        error: error.message,
      });
      res.status(400).json({ error: 'Invalid request data' });
    }
  },
};
