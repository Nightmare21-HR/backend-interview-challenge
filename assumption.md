# Backend Interview Challenge

## Overview

This project implements a task management backend with sync capabilities, built using **Node.js**, **TypeScript**, and **SQLite**.  
It supports:

- CRUD operations for tasks
- Task synchronization with conflict resolution
- Sync queue and batch processing
- Health checks

---

## Features

1. **Task Management**
   - Create, update, retrieve, and soft-delete tasks.
   - Tracks `sync_status`, `created_at`, `updated_at`, and `last_synced_at`.

2. **Sync Service**
   - Adds operations to a `sync_queue` for reliable syncing.
   - Handles conflicts using **last-write-wins** strategy.
   - Batch processing with error handling.
   - Reports `synced_items`, `failed_items`, and `errors`.

3. **Health Check**
   - Endpoint to verify service availability.

---

## API Endpoints

### Tasks

| Method | Endpoint       | Description                     |
|--------|----------------|---------------------------------|
| GET    | `/tasks`       | Get all non-deleted tasks       |
| GET    | `/tasks/:id`   | Get a single task by ID         |
| POST   | `/tasks`       | Create a new task               |
| PUT    | `/tasks/:id`   | Update an existing task         |
| DELETE | `/tasks/:id`   | Soft-delete a task              |

### Sync

| Method | Endpoint       | Description                              |
|--------|----------------|------------------------------------------|
| POST   | `/sync`        | Trigger manual sync                       |
| POST   | `/batch`       | Batch sync for multiple operations       |
| GET    | `/status`      | Get pending items count and last sync    |
| GET    | `/health`      | Check service health                      |

---

## Assumptions

1. **Database**
   - Using SQLite for simplicity.
   - All task timestamps are stored in ISO format.
   - Tasks are soft-deleted (`is_deleted = true`) instead of permanent deletion.

2. **Sync**
   - `sync_status` can be `pending`, `synced`, or `error`.
   - Conflicts resolved using **last-write-wins** based on `updated_at`.
   - Batch sync processes up to `BATCH_SIZE` items at a time.
   - Failed syncs are logged in `errors` array.

3. **Task Properties**
   - `completed` defaults to `false`.
   - `sync_status` defaults to `pending` on creation or update.
   - Optional fields: `description`, `server_id`, `last_synced_at`.

4. **Error Handling**
   - All endpoints return structured error responses: `{ error: string }`.
   - Unhandled exceptions return HTTP 500.

5. **Conflict Resolution**
   - Conflicts occur if the server version and client version differ.
   - `resolveConflict()` determines which task version wins:
     - Most recent `updated_at` wins.
     - Resolved task replaces the local version and is marked `synced`.

---

