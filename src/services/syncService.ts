import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  Task,
  SyncQueueItem,
  SyncResult,
  SyncError,
  BatchSyncRequest,
  BatchSyncResponse,
} from '../types';
import { Database } from '../db/database';


/**
 * SyncService handles syncing tasks between local DB and server.
 * Responsibilities:
 * - Adding operations to sync queue
 * - Processing sync queue
 * - Handling batch sync
 * - Conflict resolution
 * - Connectivity checks
 */
export class SyncService {
  private apiUrl: string;
  private BATCH_SIZE: number;

 constructor(private db: Database){
    this.apiUrl = process.env.API_BASE_URL || 'http://localhost:3000/api';
    this.BATCH_SIZE = parseInt(process.env.SYNC_BATCH_SIZE || '50', 10);
   }

  /**
   * Add operation to local sync queue
   */
  async addToSyncQueue(
    taskId: string,
    operation: 'create' | 'update' | 'delete',
    data: Partial<Task>
  ): Promise<void> {
    // To avoid duplicate operations for the same task, we can either replace the existing one
    // or just add to the queue. Replacing is often safer.
    await this.db.run(`DELETE FROM sync_queue WHERE task_id = ?`, [taskId]);
    
    const item: SyncQueueItem = {
      id: uuidv4(),
      task_id: taskId,
      operation,
      data,
      created_at: new Date(),
      retry_count: 0,
    };

    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data, created_at, retry_count) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, item.task_id, item.operation, JSON.stringify(item.data), item.created_at.toISOString(), item.retry_count]
    );
  }

  /**
   * Process all items in sync queue and push to server
   */
  async sync(): Promise<SyncResult> {
    const items: SyncQueueItem[] = await this.db.all(
      `SELECT * FROM sync_queue WHERE retry_count < 3 ORDER BY created_at ASC`
    );

    if (items.length === 0) {
      return { success: true, synced_items: 0, failed_items: 0, conflicts: 0, errors: [] };
    }

    let synced = 0;
    let failed = 0;
    let conflicts = 0;
    const errors: SyncError[] = [];

    for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
      const batch = items.slice(i, i + this.BATCH_SIZE);

      try {
        const response = await this.processBatchServer(batch);

        for (const res of response.processed_items) {
          if (res.status === 'success') {
            await this.updateSyncStatus(res.client_id, 'synced', res.resolved_data);
            synced++;
          } else if (res.status === 'conflict' && res.resolved_data) {
            // A conflict was detected by the server.
            // FIX: Use type assertion `as Task` instead of a generic.
            const localTask = await this.db.get('SELECT * FROM tasks WHERE id = ?', [res.client_id]) as Task;
            if (localTask) {
              const winningTask = this.resolveConflict(localTask, res.resolved_data as Task);
              // Update local data with the winning version and mark as synced
              await this.updateSyncStatus(winningTask.id, 'synced', winningTask);
              conflicts++;
              synced++; // A resolved conflict is considered a successful sync
            } else {
              // Local task doesn't exist, but server reports conflict? This is an edge case.
              // We'll treat it as a failure for now.
              failed++;
            }
          } else {
            // Handle 'error' status
            const item = batch.find((it) => it.task_id === res.client_id);
            if (item) {
              await this.handleSyncError(item, new Error(res.error || 'Unknown error from server'));
              failed++;
              errors.push({
                task_id: item.task_id,
                operation: item.operation,
                error: res.error || 'Unknown error from server',
                timestamp: new Date(),
              });
            }
          }
        }
      } catch (err) {
        // Handle batch-level errors (e.g., network failure)
        for (const item of batch) {
          const errorObj = err instanceof Error ? err : new Error('Unknown batch error');
          await this.handleSyncError(item, errorObj);
          failed++;
          errors.push({
            task_id: item.task_id,
            operation: item.operation,
            error: errorObj.message,
            timestamp: new Date(),
          });
        }
      }
    }

    return {
      success: failed === 0,
      synced_items: synced,
      failed_items: failed,
      conflicts,
      errors,
    };
  }

  /**
   * Send batch to server API
   */
  async processBatchServer(items: SyncQueueItem[]): Promise<BatchSyncResponse> {
    const payload: BatchSyncRequest = {
      items,
      client_timestamp: new Date(),
    };

    const { data } = await axios.post<BatchSyncResponse>(
      `${this.apiUrl}/sync/batch`,
      payload
    );

    return data;
  }

  /**
   * Update sync status locally after success or error
   */
  private async updateSyncStatus(
    taskId: string,
    status: 'synced' | 'error',
    serverData?: Partial<Task>
  ) {
    if (status === 'synced') {
      // Prepare the fields to update from the server data.
      const updateData = { ...serverData };
      delete updateData.id; // Don't try to update the primary key

      const setClauses = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
      
      const params = [
          ...Object.values(updateData),
          'synced', // for sync_status
          new Date().toISOString(), // for last_synced_at
          taskId, // for WHERE clause
      ];

      if (setClauses) {
          await this.db.run(
              `UPDATE tasks SET ${setClauses}, sync_status = ?, last_synced_at = ? WHERE id = ?`,
              params
          );
      } else {
          // Fallback if serverData is empty for some reason
          await this.db.run(
              `UPDATE tasks SET sync_status = ?, last_synced_at = ? WHERE id = ?`,
              ['synced', new Date().toISOString(), taskId]
          );
      }
      
      await this.db.run(`DELETE FROM sync_queue WHERE task_id = ?`, [taskId]);

    } else {
      // status is 'error'
      await this.db.run(`UPDATE tasks SET sync_status = ? WHERE id = ?`, [
        status,
        taskId,
      ]);
    }
  }

  /**
   * Handle sync queue item error and retries
   */
  private async handleSyncError(item: SyncQueueItem, error: Error) {
    const newRetryCount = item.retry_count + 1;
    const maxRetries = 3;

    if (newRetryCount >= maxRetries) {
      await this.db.run(`UPDATE tasks SET sync_status = 'error' WHERE id = ?`, [
        item.task_id,
      ]);
      // Note: We might want to remove it from the queue after max retries
      // or leave it for manual inspection. Leaving it for now.
    }
    
    await this.db.run(
      `UPDATE sync_queue SET retry_count = ?, error_message = ? WHERE id = ?`,
      [newRetryCount, error.message, item.id]
    );
  }

  /**
   * Check if server is reachable
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get count of pending items in sync queue
   */
  async getPendingCount(): Promise<number> {
    // FIX: Use type assertion `as { count: number }` instead of a generic.
    const result = await this.db.get(`SELECT COUNT(*) as count FROM sync_queue`) as { count: number };
    return result?.count ?? 0;
  }

  /**
   * Get timestamp of last successful sync
   */
  async getLastSyncTime(): Promise<Date | null> {
    // FIX: Use type assertion `as { lastSync: string }` instead of a generic.
    const row = await this.db.get(
      `SELECT MAX(last_synced_at) as lastSync FROM tasks WHERE sync_status = 'synced'`
    ) as { lastSync: string };
    return row?.lastSync ? new Date(row.lastSync) : null;
  }
  
  /**
   * Resolves conflict between local and server task using "last write wins"
   */
  private resolveConflict(localTask: Task, serverTask: Task): Task {
    const localUpdated = new Date(localTask.updated_at).getTime();
    const serverUpdated = new Date(serverTask.updated_at).getTime();

    if (localUpdated >= serverUpdated) {
      console.log(`Conflict resolved for task ${localTask.id}: Local version won.`);
      return localTask;
    } else {
      console.log(`Conflict resolved for task ${serverTask.id}: Server version won.`);
      return serverTask;
    }
  }
}