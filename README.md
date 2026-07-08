# Notification Microservice

An event driven notification system built with Bun, Redis, and Postgres. A REST
backend handles the application logic such as authentication, wallet top ups,
and marketing sends. Whenever something happens that a user should be told
about, the backend publishes a small notification event and returns immediately.
A separate notification service listens for those events and does the slow work
in the background, which means resolving the recipients, rendering the email,
and delivering it. The request path stays fast, and the email workload scales
independently of the API.

## Architecture

<!-- Paste your architecture diagram image below this line. -->



## Table of contents

1. Overview
2. How it works
3. Repository structure
4. Backend API
5. Notification payload
6. Templates and priorities
7. Reliability
8. Redis keys
9. Environment variables
10. Running the system
11. Trying it out
12. Possible improvements

## Overview

The project is split into two independent services that talk to each other only
through Redis. Neither service calls the other over HTTP, so either one can be
restarted, scaled, or deployed on its own without breaking the other.

The backend owns users, wallets, and the public API. Its only job in the
notification flow is to publish an event describing what happened. It does not
render templates or send email, and it does not wait for delivery.

The notification service owns everything about turning an event into a delivered
email. It subscribes to the event channel, expands the event into one job per
recipient, renders the correct template, and pushes each job onto a priority
queue. A worker then drains those queues and sends each email through Resend.

Redis plays two roles in the middle. It is the pub/sub channel that carries the
event from the backend to the notification service, and it is the queue and
state store that the notification service uses internally.

## How it works

The end to end flow for a single notification looks like this.

1. A client calls a backend route, for example `POST /auth/signup`.
2. The controller runs its business logic, then calls `enqueueNotification`,
   which assigns an incrementing id and publishes a JSON payload to the Redis
   channel `notification:incoming`. The controller returns its API response
   right away without waiting for the email.
3. The notification service subscriber receives the message and validates it
   against a zod schema. A malformed message is logged and dropped so it can
   never crash the listener.
4. The iterator resolves the recipients. A normal notification targets a single
   user. A marketing notification with `user: "ALL"` fans out to every user in
   the database, producing one job per user.
5. For each recipient the iterator renders the template into final HTML, then
   claims the job in Redis with a `SET NX` marker. If that job was already
   claimed, it is skipped, which means a replayed event never sends a duplicate.
6. The job is pushed onto one of three priority queues based on the payload.
7. The engine pops the next job, always checking the critical queue before the
   normal queue and the normal queue before the bulk queue, and sends it through
   Resend. It records the job status in Redis as it moves through its lifecycle.

## Repository structure

```
root/
  backend/                      REST API and the event publisher
    prisma/schema.prisma        User, Wallet, and Role models
    src/controllers/            route handlers that call enqueueNotification
    src/middleware/auth.ts      JWT and admin guards
    src/routes/index.ts         route definitions
    src/notify.ts               publishes the event to Redis
    src/index.ts                Express entry point
  notification-service/
    backend/
      index.ts                  subscriber, entry point of the service
      iterator.ts               recipient fan out, render, and routing
      engine.ts                 queue worker that sends the email
      redis.ts                  shared Redis client
      template/                 HTML templates and the renderer
  frontend/                     Bun and React starter, not part of the flow yet
  README.md
```

Each service also has its own README. The internals of the notification service
are documented in `notification-service/backend/README.md`.

## Backend API

The backend runs on port 3000 by default.

| Method | Route            | Auth        | Purpose                              |
| ------ | ---------------- | ----------- | ------------------------------------ |
| POST   | /auth/signup     | none        | Create a user and send a welcome mail |
| POST   | /auth/login      | none        | Authenticate and return a JWT         |
| POST   | /wallet/onramp   | JWT         | Credit a wallet and notify the user   |
| POST   | /email/marketing | ADMIN JWT   | Send a broadcast to all users         |
| GET    | /health          | none        | Health check                          |

`/wallet/onramp` requires a valid JWT in the request. `/email/marketing`
requires a token that belongs to a user with the `ADMIN` role.

## Notification payload

Each event the backend publishes has the following shape.

```json
{
  "id": 1,
  "user": 12,
  "template": "signup-success",
  "service": "EMAIL",
  "priority": 1
}
```

| Field    | Type               | Description                                          |
| -------- | ------------------ | ---------------------------------------------------- |
| id       | number             | Unique notification id, assigned by the backend      |
| user     | number or "ALL"    | Target user id, or "ALL" for a marketing broadcast   |
| template | string             | Which template to render                             |
| service  | "EMAIL"            | Delivery channel, currently email only               |
| priority | 0, 1, or 2         | Queue selector, where 0 is the most urgent           |
| data     | object, optional   | Extra values used by the template, such as an amount |

## Templates and priorities

Three templates are supported today. Each maps to an HTML file in the
notification service `template` folder, and placeholders written as `{{name}}`
are filled in per recipient.

| Template               | Used for                        | Extra data       |
| ---------------------- | ------------------------------- | ---------------- |
| signup-success         | Welcome email after signup      | none             |
| wallet-onramp-success  | Confirmation of a wallet credit | amount           |
| marketing-email        | Broadcast to all users          | subject, message |

Priority decides which queue a job lands on. Critical mail such as a signup
confirmation should never wait behind a large marketing send, so the engine
always drains the higher priority queues first.

| Priority | Queue      | Typical use                    |
| -------- | ---------- | ------------------------------ |
| 0        | queue:p0   | Critical and time sensitive    |
| 1        | queue:p1   | Normal transactional mail      |
| 2        | queue:p2   | Bulk and marketing             |

## Reliability

The pipeline is designed so that one bad message or one failing send cannot take
down the whole system.

Idempotency is handled with a Redis `SET NX` claim per job. The job key is built
from the notification id and the user id, so the same event delivered twice only
produces one email. The claim carries a one day expiry so the markers clean up
on their own.

Failed sends are retried up to three times with exponential backoff. The retry
count lives in Redis so it survives across attempts. When a job exhausts its
retries it is moved to a dead-letter queue rather than being lost or blocking the
worker.

Sending is rate limited per minute using a shared Redis counter, so multiple
engine instances stay under the same global cap. When the limit is reached the
current job is returned to its queue and the worker pauses until the window
resets.

## Redis keys

| Key pattern            | Purpose                                              |
| ---------------------- | --------------------------------------------------- |
| notification:incoming  | Pub/sub channel that carries events from the backend |
| counter:notification   | Incrementing source of notification ids              |
| status:{id}:{userId}   | Lifecycle status of a single job                     |
| queue:p0, p1, p2       | Priority job queues                                  |
| queue:dlq              | Dead-letter queue for jobs that exhausted retries    |
| retry:{id}:{userId}    | Retry attempt counter for a job                      |
| rate:emails:{minute}   | Per minute send counter for rate limiting            |

## Environment variables

Backend, in `backend/.env`.

| Variable      | Description                              |
| ------------- | ---------------------------------------- |
| DATABASE_URL  | Postgres connection string               |
| JWT_SECRET    | Secret used to sign and verify tokens    |
| REDIS_URL     | Redis connection used to publish events  |
| PORT          | API port, defaults to 3000               |

Notification service, in `notification-service/backend/.env`.

| Variable            | Description                                     |
| ------------------- | ----------------------------------------------- |
| REDIS_URL           | Redis connection for pub/sub and the queues     |
| DATABASE_URL        | Postgres connection used to read users          |
| RESEND_API_KEY      | API key for the Resend email provider           |
| EMAIL_FROM          | Verified sender address for outgoing mail        |
| EMAIL_RATE_PER_MIN  | Maximum emails to send per minute               |

## Running the system

You need Bun, a running Redis instance, and a Postgres database. Resend is only
required if you want real emails to be delivered.

Start Redis first.

```
redis-server
```

Start the backend from the `backend` folder.

```
cd backend
bun install
bunx prisma generate
bun run dev
```

Start the notification service from `notification-service/backend`. It runs as
two processes, so use two terminals.

```
cd notification-service/backend
bun install
bun run dev
bun run engine
```

Copy `backend/.env.example` to `backend/.env` and fill in the values, then
create `notification-service/backend/.env` using the table above.

## Trying it out

With every process running, call a backend route and watch the email flow
through. For example, a signup.

```
curl -X POST http://localhost:3000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@example.com","password":"secret123"}'
```

The backend publishes the event, the subscriber picks it up, the iterator
renders and queues the job, and the engine sends it. You can watch the engine
logs to see each job move from queued to sent.

## Possible improvements

The service is complete as a backend system, and there are a few natural next
steps. A small demo frontend could trigger the flow from a browser instead of
curl. Additional channels such as SMS or push could be added alongside email.
The dead-letter queue could gain a small tool to inspect and replay failed jobs.

## Tech stack

Bun for the runtime, Express for the API, Redis for pub/sub and queues, Prisma
with Postgres for data, zod for validation, and Resend for email delivery.
