import { startServer } from '../scripts/serve.mjs';

export default async function globalSetup() {
  const server = await startServer({ port: 4173 });

  return async () => {
    await new Promise((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
    });
  };
}
