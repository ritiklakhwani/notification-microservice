# Frontend Option

Students who want to focus on frontend can build a clean UI for the existing backend APIs.

The goal is not to implement notification-service logic from the frontend. The frontend should only call backend APIs and display useful responses.

## Pages To Build

### 1. Signup Page

Create a signup form with:

- email
- password
- role selection: `USER` or `ADMIN`

Call:

```txt
POST /auth/signup
```

After success, show the created user id and notification payload returned by backend.

### 2. Login Page

Create a login form with:

- email
- password

Call:

```txt
POST /auth/login
```

Store the returned JWT token in local state or localStorage.

### 3. Wallet Onramp Page

Create a wallet onramp form with:

- amount

Call:

```txt
POST /wallet/onramp
```

This route requires the JWT token in headers:

```txt
Authorization: Bearer <token>
```

After success, show:

- amount added
- updated wallet balance
- notification payload

### 4. Admin Marketing Email Page

Create an admin-only page to send marketing email notifications.

Form fields:

- subject
- message

Call:

```txt
POST /email/marketing
```

This route requires an `ADMIN` JWT token.

After success, show the marketing notification payload.

## Suggested UI

You can create:

- a simple navbar
- separate tabs or pages for each feature
- token preview section
- response preview using JSON formatting
- loading and error states

Keep the UI simple, readable, and easy to test.

## Backend Base URL

Use:

```txt
http://localhost:3000
```

## Setup

```bash
bun install
bun dev
```

## Expected Frontend Flow

```txt
Signup/Login -> Get JWT -> Wallet Onramp -> Admin Marketing Email
```

Focus on clean forms, correct API calls, JWT handling, and clear response display.
