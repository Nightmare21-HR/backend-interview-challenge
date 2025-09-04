import { Router, Request, Response } from 'express';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';
import { Task } from '../types';

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);

  // Get all tasks
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const tasks: Task[] = await taskService.getAllTasks();
      return res.json(tasks);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Get single task by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const task: Task | null = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json(task);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Create new task
  router.post('/', async (req: Request, res: Response) => {
    try {
      const { title, description } = req.body;

      if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required and must be a string' });
      }

      const task: Task = await taskService.createTask({ title, description });
      return res.status(201).json(task);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update task by ID
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const updates: Partial<Task> = req.body;
      const updatedTask: Task | null = await taskService.updateTask(req.params.id, updates);

      if (!updatedTask) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.json(updatedTask);
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  // Soft delete task by ID
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const deleted: boolean = await taskService.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Task not found' });
      }

      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}
