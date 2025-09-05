import { Router, Request, Response, NextFunction } from 'express';
import { TaskService } from '../services/taskService';
import { Database } from '../db/database';
import { Task } from '../types';

export function createTaskRouter(db: Database): Router {
  const router = Router();
  const taskService = new TaskService(db);

  // Get all tasks
  router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const tasks: Task[] = await taskService.getAllTasks();
      return res.json(tasks);
    } catch (err) {
      return next(err); // Pass error to the central handler
    }
  });

  // Get single task by ID
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const task: Task | null = await taskService.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json(task);
    } catch (err) {
      return next(err);
    }
  });

  // Create new task
  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { title, description } = req.body;

      if (!title || typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
      }

      const task: Task = await taskService.createTask({ title, description });
      return res.status(201).json(task);
    } catch (err) {
      return next(err);
    }
  });

  // Update task by ID
  router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const updates: Partial<Task> = req.body;
      delete updates.id;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'Request body must contain at least one field to update' });
      }

      const updatedTask: Task | null = await taskService.updateTask(req.params.id, updates);

      if (!updatedTask) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.json(updatedTask);
    } catch (err) {
      return next(err);
    }
  });

  // Soft delete task by ID
  router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const deleted: boolean = await taskService.deleteTask(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: 'Task not found' });
      }
      return res.status(204).send();
    } catch (err) {
      return next(err);
    }
  });

  return router;
}