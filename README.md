# Notification Microservice Assignment

This repo keeps the backend simple for students. The backend creates notification payloads and returns them in API responses. It does not store notifications and does not communicate with `notification-service`.

## Structure

```txt
root/
├── backend/
│   ├── prisma/schema.prisma
│   ├── src/controllers/index.ts
│   ├── src/middleware/auth.ts
│   ├── src/routes/index.ts
│   └── src/index.ts
├── notification-service/
└── README.md
```

## Backend Routes

- `POST /auth/signup`
- `POST /auth/login`
- `POST /wallet/onramp`
- `POST /email/marketing`
- `GET /health`

`/wallet/onramp` needs a JWT token. `/email/marketing` needs an `ADMIN` user token.

## Notification Payloads

The backend returns payloads like this:

```json
{
  "id": 1,
  "user": 12,
  "template": "signup-success",
  "service": "EMAIL",
  "priority": 1
}
```

These payloads are not stored in the database.

## Setup

```bash
cd backend
bun install
bunx prisma generate
bun run dev
```

Create `backend/.env` from `backend/.env.example`.
