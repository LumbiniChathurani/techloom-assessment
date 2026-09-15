# Techloom.ai Intern Assessment — POS & E-Commerce System

**Live Deployments:**
- Backend API: https://techloom-pos-backend.onrender.com
- Task 01 (POS Admin): https://techloom-assessment-pi.vercel.app
- Task 02 (Storefront): https://techloom-assessment-c6yn.vercel.app

**Repository:** https://github.com/LumbiniChathurani/techloom-assessment

> Note: the backend is on Render's free tier and may take 20–30 seconds to respond on the first request after inactivity (cold start).

## Tech Stack
- **Backend:** Node.js, Express, Prisma ORM
- **Database:** PostgreSQL (hosted on Neon)
- **Frontend:** React (Vite)
- **Deployment:** Render (backend), Vercel (both frontends)

## Architecture
Task 01 and Task 02 share a single backend (`/task-01/backend`), since both tasks require the same core logic: product inventory, concurrency-safe stock reservation, mock payments, and order lifecycle management. Task 02 adds search/filter and refund functionality on top of the same API. Each task has its own separate frontend.

## Repository Structure
/task-01
/backend → Express API + Prisma (shared by both tasks)
/frontend → POS admin UI
/task-02
/frontend → Customer storefront UI


## Setup (Local Development)

### Backend
```bash
cd task-01/backend
npm install
npx prisma generate
```
Create a `.env` file with:
DATABASE_URL=postgresql://neondb_owner:npg_UQqY05OraMoC@ep-purple-boat-aez17ocg-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require

Run:
```bash
npm run dev
```
Server runs on `http://localhost:5000`.

### Frontend (either task)
```bash
cd task-01/frontend   # or task-02/frontend
npm install
npm run dev
```

## Environment Variables
| Variable | Where | Description |
|---|---|---|
| `DATABASE_URL` | backend | PostgreSQL connection string |

## How to Test Each Feature

**Product CRUD:** `GET/POST/PUT/DELETE /products`

**Stock reservation & concurrency safety:** Call `POST /orders` to create an order, then `POST /orders/:id/checkout` to reserve stock. Concurrent checkout attempts on the same low-stock product are handled safely using `SELECT ... FOR UPDATE` row locking inside a database transaction — verified by firing simultaneous requests at a 1-stock item; only one succeeds.

**Reservation expiry (5 min):** A background job (`node-cron`, runs every 30s) automatically releases any reservation whose 5-minute window has passed, restoring stock and marking the order `EXPIRED`.

**Mock payments:** `POST /orders/:id/pay` with body `{ "outcome": "success" | "failure" | "timeout" }`.
- `success` → order marked `PAID`, stock stays consumed
- `failure` → stock released immediately, order marked `FAILED`
- `timeout` → left for the expiry job to resolve naturally

**Duplicate submission prevention:** Pass an `idempotencyKey` in the `POST /orders` body — resending the same key returns the original order instead of creating a duplicate.

**Order cancellation:** `POST /orders/:id/cancel` — restores any reserved stock.

**Refunds (Task 02):** `POST /orders/:id/refund` on a `PAID` order.

**Search/filter (Task 02):** `GET /products?search=&category=&minPrice=&maxPrice=&available=true`

**Order history (Task 02):** `GET /orders`

Both frontends include an "Activity Log" panel showing live API responses as you interact with them, useful for demonstrating each feature visually without needing Postman.