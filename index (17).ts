import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createApp } from './app.js';
import { createDb } from './db/index.js';
import { migrate } from './db/migrate.js';
import { config } from './config.js';

const db = await createDb();
await migrate(db);
const { app, game, parties } = createApp(db);

const server = serve({ fetch: app.fetch, port: config.port }, async (i) => {
  const { networkInterfaces } = await import('node:os');
  const lan = Object.values(networkInterfaces()).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).map((n) => n!.address);
  console.log(`\n  ${config.appName} is running (${config.databaseUrl ? 'PostgreSQL' : 'embedded database'}).`);
  console.log(`  On this computer:   http://localhost:${i.port}`);
  for (const ip of lan) console.log(`  On your Wi-Fi:      http://${ip}:${i.port}`);
  console.log('');
});

// Party Rooms run over WebSockets at /ws?token=… (the token identifies the player, so reconnects keep their seat).
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
(server as any).on('upgrade', async (req: any, socket: any, head: any) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws') return socket.destroy();
    const player = await game.playerByToken(url.searchParams.get('token') ?? undefined);
    wss.handleUpgrade(req, socket, head, (ws) => parties.connect(ws, player.id));
  } catch {
    socket.destroy();
  }
});

const shutdown = () => { server.close(); db.close().finally(() => process.exit(0)); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
