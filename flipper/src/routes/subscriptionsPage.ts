import express from 'express';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

// Subscriptions page is handled by the frontend. Keep this as an API endpoint to
// verify auth/state when needed.
router.get('/', requireAuth, (req, res) => {
  res.json({
    message: 'Subscriptions frontend is served separately. Authenticate to access API endpoints.',
  });
});

export default router;
