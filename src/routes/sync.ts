import { Router, Request, Response, NextFunction } from 'express';
import { Database } from '../db/database';
import { TaskService } from '../services/taskService';
import { SyncQueueItem, Task, BatchSyncResponse } from '../types';

export function createSyncRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);

  /**
   * POST /api/sync/batch
   * This is the main endpoint for the client to send its batch of offline changes.
   */
  router.post('/sync/batch', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const items: SyncQueueItem[] = req.body.items;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: 'Request body must contain an array of items.' });
      }

      const response: BatchSyncResponse = {
        processed_items: [],
      };

      for (const item of items) {
        try {
          // FIX 2: Initialize as `undefined` instead of `null`.
          let resolved_data: Task | undefined = undefined;
          let server_id = item.task_id; // Default to client's ID
          const clientData = item.data as Partial<Task>;

          switch (item.operation) {
            case 'create':
              const createdTask = await taskService.createTask({
                title: clientData.title || 'Untitled',
                description: clientData.description,
              });
              // FIX 2: Convert null to undefined.
              resolved_data = createdTask || undefined;
              if (resolved_data) {
                server_id = resolved_data.id;
              }
              break;

            case 'update':
              const serverTask = await taskService.getTask(item.task_id);
              if (!serverTask) {
                throw new Error(`Task with id ${item.task_id} not found on server.`);
              }
              
              const clientUpdateTime = new Date(clientData.updated_at!).getTime();
              const serverUpdateTime = new Date(serverTask.updated_at!).getTime();

              if (clientUpdateTime > serverUpdateTime) {
                const updatedTask = await taskService.updateTask(item.task_id, clientData);
                // FIX 2: Convert null to undefined.
                resolved_data = updatedTask || undefined;
              } else {
                resolved_data = serverTask;
              }
              break;

            case 'delete':
              await taskService.deleteTask(item.task_id);
              resolved_data = undefined; // No data to return on delete
              break;
          }
          
          response.processed_items.push({
            client_id: item.task_id,
            // FIX 1: Add the required server_id property.
            server_id,
            status: 'success',
            resolved_data,
          });

        } catch (err) {
          response.processed_items.push({
            client_id: item.task_id,
            // FIX 1: Add the required server_id property, even for errors.
            server_id: item.task_id || '',
            status: 'error',
            error: (err as Error).message,
          });
        }
      }

      return res.status(200).json(response);

    } catch (err) {
      return next(err);
    }
  });

  /**
   * GET /api/health
   * A simple health check endpoint.
   */
  router.get('/health', (_req: Request, res: Response) => {
    return res.status(200).json({ status: 'ok', timestamp: new Date() });
  });

  return router;
}