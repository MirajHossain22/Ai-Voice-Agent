import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = buildApp(config);

try {
  await app.listen({
    host: config.host,
    port: config.port,
  });
} catch (error: unknown) {
  app.log.error(error, 'Failed to start server');
  process.exitCode = 1;
}
