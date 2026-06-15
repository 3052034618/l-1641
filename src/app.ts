import 'reflect-metadata';
import express, { Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import routes from './routes';
import errorHandler from './middleware/errorHandler';
import { WebSocketServer } from './sockets/WebSocketServer';
import { reportService } from './services/report.service';
import logger from './config/logger';

dotenv.config();

const app: Application = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.use(errorHandler);

app.use('*', (_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

export const startServer = async () => {
  const port = process.env.PORT || 3000;

  const server = app.listen(port, () => {
    logger.info(`🚀 Server is running on port ${port}`);
    logger.info(`📡 API Base URL: http://localhost:${port}/api`);
    logger.info(`🔗 WebSocket URL: ws://localhost:${port}`);
    logger.info(`📊 Health Check: http://localhost:${port}/health`);
  });

  const wsServer = WebSocketServer.getInstance();
  wsServer.initialize(server);

  await reportService.scheduleDailyReport();

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  return server;
};

export default app;
