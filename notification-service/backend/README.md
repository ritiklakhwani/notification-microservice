# Notification Service

A small, asynchronous notification service built with Bun, Redis, and Prisma.
The main application never sends emails on the request path. It publishes a
lightweight event and this service does the slow work in the background:
resolve the recipients, render the correct template, and deliver the email
through Resend. The result is that user facing requests such as signup stay
fast, and notification volume can scale on its own.

## How it works

```
  Main backend (publisher)
        |
        |   redis.publish("notification:incoming", payload)
        v
  ===================================================================
  |                       NOTIFICATION SERVICE                      |
  |                                                                 |
  |   Subscriber                                                    |
  |   receives the message and validates it with zod               |
  |        |                                                        |
  |        v                                                        |
  |   Iterator            <---->   Postgres    (user email, balance)|
  |   resolve recipients  <---->   Templates   (render the HTML)    |
  |   claim + route       <---->   Redis       (dedupe with SET NX) |
  |        |                                                        |
  |        |   one job per recipient, placed on a priority queue    |
  |        v                                                        |
  |   queue:p0            queue:p1            queue:p2              |
  |   (critical)          (normal)            (bulk / marketing)    |
  |        \                  |                  /                  |
  |         +-----------------+-----------------+                   |
  |                           |                                     |
  |                           v                                     |
  |   Engine                                                        |
  |   drains highest priority first                                 |
  |   rate limits, retries with backoff, dead-letters on give up    |
  |                           |                                     |
  ===========================|=====================================
                             |   resend.emails.send(...)
                             v
                          Resend  ----->  Recipient inbox
```

The service runs as two long lived processes that share one Redis instance.
The subscriber accepts work and prepares it. The engine sends it. Redis sits in
the middle as both the message channel and the job queue.

## Components

| Part       | File            | What it does                                                        |
| ---------- | --------------- | ------------------------------------------------------------------- |
| Subscriber | `index.ts`      | Listens on the Redis channel, validates each payload, calls the iterator |
| Iterator   | `iterator.ts`   | Resolves recipients, renders the template, claims and enqueues each job |
| Templates  | `template/`     | HTML files plus `renderTemplate`, which fills in `{{placeholders}}`  |
| Engine     | `engine.ts`     | Pops jobs by priority, sends through Resend, handles retries and failures |
| Redis      | `redis.ts`      | Shared client for the pub/sub channel, the queues, and status keys  |

## Request flow

1. A controller in the main backend calls its `enqueueNotification` helper,
   which assigns an id and publishes the payload to `notification:incoming`.
2. The subscriber receives the message and parses it against a zod schema.
   Anything malformed is logged and dropped instead of crashing the listener.
3. The iterator resolves the recipients. A normal notification targets one
   user. A marketing notification with `user: "ALL"` fans out to every user.
4. For each recipient it renders the template, then claims the job with
   `SET NX`. If the same job was already claimed, it is skipped, so a replayed
   event never sends a duplicate email.
5. The job is pushed onto `queue:p0`, `queue:p1`, or `queue:p2` based on its
   priority.
6. The engine pops the next job, checking `p0` before `p1` before `p2`, and
   sends it through Resend. It updates a status key along the way
   (`queued`, `processing`, `sent`, or `dead`).

## Priority and reliability

Splitting the work into three queues keeps a large marketing send from delaying
a time sensitive signup or wallet email. The engine always looks at the
critical queue first, so important mail moves ahead of bulk mail.

The engine also protects the pipeline from a single bad job. Every send is rate
limited per minute against a shared Redis counter. A failed send is retried up
to three times with exponential backoff, and if it still fails it is moved to a
dead-letter queue (`queue:dlq`) rather than blocking everything behind it.

## Environment

Create a `.env` file in this directory:

```
REDIS_URL=redis://localhost:6379
DATABASE_URL=postgres://user:password@localhost:5432/yourdb
RESEND_API_KEY=your_resend_api_key
EMAIL_FROM=notifications@yourdomain.com
EMAIL_RATE_PER_MIN=60
```

## Running

Install dependencies:

```
bun install
```

Start the two processes in separate terminals:

```
bun run dev       # subscriber (accepts and prepares work)
bun run engine    # engine (sends the email)
```

Both commands watch for file changes. For a plain run without watching, use
`bun run start` and `bun run start:engine`.

## Tech stack

Bun for the runtime and scripts, Redis for pub/sub and the job queues, Prisma
for reading users from Postgres, zod for payload validation, and Resend for
email delivery.
