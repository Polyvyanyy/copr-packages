import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createApplication } from './app';
import { ConfigurationError, loadApplicationConfig } from './config';

if (existsSync('.env')) process.loadEnvFile('.env');
process.umask(0o077);

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function start() {
  const port = Number(argument('--port') ?? process.env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigurationError('PORT must be an integer between 1 and 65535.');
  }
  const host = argument('--host') ?? process.env.HOST ?? '0.0.0.0';
  const application = await createApplication(loadApplicationConfig());
  const server = createServer(application.app);
  let closeFrontend: (() => Promise<void>) | undefined;
  if (application.config.environment === 'development') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    application.app.use(vite.middlewares);
    closeFrontend = () => vite.close();
  } else {
    const directory = fileURLToPath(new URL('../dist/', import.meta.url));
    if (!existsSync(resolve(directory, 'index.html'))) {
      application.close();
      throw new ConfigurationError('The application must be built with npm run build before npm start.');
    }
    application.app.use('/assets', express.static(resolve(directory, 'assets'), { immutable: true, maxAge: '1y' }));
    application.app.use(express.static(directory, { maxAge: 0, index: false }));
    application.app.get('/{*path}', (_request, response) => {
      response.setHeader('Cache-Control', 'no-cache');
      response.sendFile(resolve(directory, 'index.html'));
    });
  }
  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolveListening);
  });
  console.info(JSON.stringify({ event: 'server_started', port, environment: application.config.environment }));

  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10_000);
    deadline.unref();
    await closeFrontend?.();
    await new Promise<void>((resolveClosed) => server.close(() => resolveClosed()));
    application.close();
    clearTimeout(deadline);
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
}

void start().catch((error: unknown) => {
  console.error(JSON.stringify({
    event: 'startup_failed',
    message: error instanceof ConfigurationError ? error.message : 'Server initialization failed; check configuration and database availability.',
  }));
  process.exitCode = 1;
});
