import app from './app';
import { Logger } from './utils/logger';

const PORT = process.env.PORT || 3000;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  Logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  Logger.error('Unhandled Rejection', { reason: String(reason) });
  process.exit(1);
});

// Start the server
app.listen(PORT, () => {
  Logger.info('Server started', { port: PORT });
});
