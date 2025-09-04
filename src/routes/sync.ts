import { Router, Request, Response } from 'express';
import { SyncService } from '../services/syncService';

import { Database } from '../db/database';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  
  const syncService = new SyncService(db);

  // Manual sync trigger
  router.post('/sync', async (_req: Request, res: Response) => {
    try {
      const isConnected = await syncService.checkConnectivity();
      if (!isConnected) {
        return res.status(503).json({ error: 'No connectivity' });
      }

      const result = await syncService.sync();
      return res.json(result); // ✅ ensure return
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Check sync status
  router.get('/status', async (_req: Request, res: Response) => {
    try {
      const pendingCount = await syncService.getPendingCount();
      const lastSync = await syncService.getLastSyncTime();
      const isConnected = await syncService.checkConnectivity();

      return res.json({
        pending: pendingCount,
        lastSync,
        connected: isConnected,
      });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Batch sync (server-side)
  router.post('/batch', async (req: Request, res: Response) => {
    try {
      const { operations } = req.body;
      if (!operations || !Array.isArray(operations)) {
        return res.status(400).json({ error: 'Invalid batch request' });
      }

      const response = await syncService.processBatchServer(operations);
      return res.json(response); // ✅ ensure return
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Health check
  router.get('/health', async (_req: Request, res: Response) => {
    return res.json({ status: 'ok', timestamp: new Date() });
  });

  return router;
}
