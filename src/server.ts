import { AppDataSource } from './data-source';
import { startServer } from './app';
import logger from './config/logger';

const bootstrap = async () => {
  try {
    logger.info('🔄 Initializing database connection...');
    await AppDataSource.initialize();
    logger.info('✅ Database connection established');

    logger.info('🚀 Starting server...');
    await startServer();

    logger.info('🎉 CSSD Trace System started successfully');
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

bootstrap();
