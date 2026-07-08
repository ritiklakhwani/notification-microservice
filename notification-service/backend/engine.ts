import { Resend } from "resend";
import { redis } from "./redis";
import type { EmailJob } from "./iterator";

/**
 * The engine is the worker side of the service. It pulls jobs off the priority
 * queues, sends them through Resend, and keeps a status record for each job.
 * Failures are retried with backoff and eventually parked in a dead-letter
 * queue so a single bad job never blocks the pipeline.
 */

const resend = new Resend(process.env.RESEND_API_KEY!);
const FROM = process.env.EMAIL_FROM!;
const RATE_LIMIT = Number(process.env.EMAIL_RATE_PER_MIN ?? 60);
const MAX_RETRIES = 3;
const DAY_IN_SECONDS = 86400;

// Highest priority first: p0 drains before p1, p1 before p2.
const QUEUES = ["queue:p0", "queue:p1", "queue:p2"];

async function popNextJob(): Promise<EmailJob | null> {
  for (const queue of QUEUES) {
    const raw = await redis.rPop(queue);
    if (raw) return JSON.parse(raw) as EmailJob;
  }
  return null;
}

// Simple fixed-window limiter shared across every worker through Redis. Each
// minute has its own counter so the send rate stays under the configured cap.
async function withinRateLimit(): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate:emails:${minute}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  return count <= RATE_LIMIT;
}

async function handleFailure(job: EmailJob, err: unknown) {
  const attempts = await redis.incr(`retry:${job.jobId}`);
  await redis.expire(`retry:${job.jobId}`, 3600);

  if (attempts < MAX_RETRIES) {
    const backoffMs = 500 * 2 ** attempts; // 1s, 2s, 4s
    console.warn(`[engine] retry ${attempts}/${MAX_RETRIES} for ${job.jobId}`, err);
    setTimeout(() => {
      redis.lPush(`queue:p${job.priority}`, JSON.stringify(job)).catch(console.error);
    }, backoffMs);
    return;
  }

  console.error(`[engine] giving up on ${job.jobId}, moving to dead-letter queue`, err);
  await redis.lPush("queue:dlq", JSON.stringify(job));
  await redis.set(`status:${job.jobId}`, "dead", { EX: DAY_IN_SECONDS });
  await redis.del(`retry:${job.jobId}`);
}

async function processJob(job: EmailJob) {
  // Over the send budget for this minute. Return the job to the front of its
  // queue and pause so we pick it up again once the window resets.
  if (!(await withinRateLimit())) {
    await redis.rPush(`queue:p${job.priority}`, JSON.stringify(job));
    await Bun.sleep(1000);
    return;
  }

  await redis.set(`status:${job.jobId}`, "processing", { EX: DAY_IN_SECONDS });

  try {
    const { data, error } = await resend.emails.send({
      from: FROM,
      to: job.to,
      subject: job.subject,
      html: job.html,
    });
    if (error) throw error;

    await redis.set(`status:${job.jobId}`, "sent", { EX: DAY_IN_SECONDS });
    await redis.del(`retry:${job.jobId}`);
    console.log(`[engine] sent ${job.jobId} (resend id: ${data?.id})`);
  } catch (err) {
    await handleFailure(job, err);
  }
}

async function main() {
  console.log("[engine] started");
  while (true) {
    const job = await popNextJob();
    if (!job) {
      await Bun.sleep(200);
      continue;
    }
    await processJob(job);
  }
}

main().catch((err) => {
  console.error("[engine] fatal", err);
  process.exit(1);
});
