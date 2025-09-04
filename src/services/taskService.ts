import { v4 as uuidv4 } from 'uuid';
import { Task } from '../types';
import { Database } from '../db/database';

/**
 * TaskService handles all database operations for tasks.
 * Responsibilities:
 * - CRUD operations
 * - Sync metadata management
 * - Adding operations into the sync_queue for syncing
 */
export class TaskService {
  constructor(private db: Database) {}

  async createTask(taskData: Partial<Task>): Promise<Task> {
    // TODO: Implement task creation
    // 1. Generate UUID for the task
    const id = uuidv4();
    const created_at = new Date();
    const updated_at = created_at;

    // 2. Set default values (completed: false, is_deleted: false)
    const task: Task = {
      id,
      title: taskData.title || '',
      description: taskData.description || '',
      completed: false,
      created_at,
      updated_at,
      is_deleted: false,
      sync_status: 'pending', // 3. Set sync_status to 'pending'
      server_id: undefined,
      last_synced_at: undefined,
    };

    // 4. Insert into database
    await this.db.run(
      `INSERT INTO tasks 
       (id, title, description, completed, created_at, updated_at, is_deleted, sync_status, server_id, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.id,
        task.title,
        task.description,
        task.completed ? 1 : 0,
        task.created_at.toISOString(),
        task.updated_at.toISOString(),
        task.is_deleted ? 1 : 0,
        task.sync_status,
        task.server_id ?? null,
        task.last_synced_at ?? null,
      ]
    );

    // 5. Add to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), task.id, 'create', JSON.stringify(task)]
    );

    return task;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    // TODO: Implement task update
    // 1. Check if task exists
    const existing = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!existing) return null;

    // 2. Update task in database
    const updated_at = new Date();
    const updatedTask: Task = {
      ...existing,
      ...updates,
      updated_at,
      sync_status: 'pending', // 4. Set sync_status to 'pending'
    };

    await this.db.run(
      `UPDATE tasks 
       SET title = ?, description = ?, completed = ?, updated_at = ?, is_deleted = ?, sync_status = ?
       WHERE id = ?`,
      [
        updatedTask.title,
        updatedTask.description,
        updatedTask.completed ? 1 : 0,
        updatedTask.updated_at.toISOString(),
        updatedTask.is_deleted ? 1 : 0,
        updatedTask.sync_status,
        id,
      ]
    );

    // 5. Add update operation to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), id, 'update', JSON.stringify(updatedTask)]
    );

    return updatedTask;
  }

  async deleteTask(id: string): Promise<boolean> {
    // TODO: Implement soft delete
    // 1. Check if task exists
    const existing = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);
    if (!existing) return false;

    // 2. Set is_deleted to true
    // 3. Update updated_at timestamp
    // 4. Set sync_status to 'pending'
    const updated_at = new Date();
    await this.db.run(
      `UPDATE tasks 
       SET is_deleted = 1, updated_at = ?, sync_status = 'pending'
       WHERE id = ?`,
      [updated_at.toISOString(), id]
    );

    // 5. Add delete operation to sync queue
    await this.db.run(
      `INSERT INTO sync_queue (id, task_id, operation, data)
       VALUES (?, ?, ?, ?)`,
      [uuidv4(), id, 'delete', JSON.stringify({ id })]
    );

    return true;
  }

  async getTask(id: string): Promise<Task | null> {
    // TODO: Implement get single task
    // 1. Query database for task by id
    const row = await this.db.get(`SELECT * FROM tasks WHERE id = ?`, [id]);

    // 2. Return null if not found or is_deleted is true
    if (!row || row.is_deleted) return null;

    return {
      ...row,
      completed: !!row.completed,
      is_deleted: !!row.is_deleted,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
    } as Task;
  }

  async getAllTasks(): Promise<Task[]> {
    // TODO: Implement get all non-deleted tasks
    // 1. Query database for all tasks where is_deleted = false
    const rows = await this.db.all(`SELECT * FROM tasks WHERE is_deleted = 0`);

    // 2. Map rows to Task objects
    return rows.map(
      (row) =>
        ({
          ...row,
          completed: !!row.completed,
          is_deleted: !!row.is_deleted,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
        } as Task)
    );
  }

  async getTasksNeedingSync(): Promise<Task[]> {
    // TODO: Get all tasks with sync_status = 'pending' or 'error'
    const rows = await this.db.all(
      `SELECT * FROM tasks WHERE sync_status IN ('pending', 'error')`
    );

    return rows.map(
      (row) =>
        ({
          ...row,
          completed: !!row.completed,
          is_deleted: !!row.is_deleted,
          created_at: new Date(row.created_at),
          updated_at: new Date(row.updated_at),
          last_synced_at: row.last_synced_at ? new Date(row.last_synced_at) : undefined,
        } as Task)
    );
  }
}
