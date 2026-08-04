import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';

let connection = null;
let queue = null;
let worker = null;
let handlers = {};
let onDeadLetter = null;

export async function initializeJobQueue(options = {}) {
  handlers = options.handlers || {};
  onDeadLetter = options.onDeadLetter || null;
  if (!process.env.REDIS_URL || queue) return { configured: Boolean(queue), mode: queue ? 'bullmq' : 'direct' };
  connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  queue = new Queue('reigns-background-jobs', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 250, removeOnFail: 500 } });
  worker = new Worker('reigns-background-jobs', async job => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`No handler is registered for ${job.name}.`);
    return handler(job.data, job);
  }, { connection, concurrency: Math.max(1, Number(process.env.JOB_WORKER_CONCURRENCY || 3)) });
  worker.on('failed', async (job, error) => {
    if (job && job.attemptsMade >= Number(job.opts.attempts || 1)) await onDeadLetter?.(job, error);
  });
  await queue.waitUntilReady();
  return { configured: true, mode: 'bullmq' };
}

export async function enqueueJob(name, data, options = {}) {
  if (!queue) {
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler is registered for ${name}.`);
    return handler(data, { id: `direct-${Date.now()}`, name, attemptsMade: 0 });
  }
  const job = await queue.add(name, data, options);
  return { queued: true, id: job.id };
}

export async function jobQueueHealth() {
  if (!queue) return { configured: false, mode: 'direct', waiting: 0, failed: 0 };
  const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
  return { configured: true, mode: 'bullmq', ...counts };
}

export async function closeJobQueue() {
  await worker?.close();
  await queue?.close();
  await connection?.quit();
}
