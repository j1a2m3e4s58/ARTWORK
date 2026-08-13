import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';

let connection = null;
let queue = null;
let worker = null;
let handlers = {};
let onDeadLetter = null;
let onCompleted = null;
let redisDisabledReason = '';

const numberFromEnv = (name, fallback, minimum) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? Math.max(minimum, value) : fallback;
};

const isRedisLimitError = error => /max requests limit exceeded|monthly request count limit|budget.*exceeded/i.test(String(error?.message || error || ''));

async function disableRedisQueue(error) {
  if (redisDisabledReason) return;
  redisDisabledReason = String(error?.message || error || 'Redis queue unavailable.').slice(0, 240);
  const activeWorker = worker;
  const activeQueue = queue;
  const activeConnection = connection;
  worker = null;
  queue = null;
  connection = null;
  await Promise.allSettled([
    activeWorker?.close(true),
    activeQueue?.close(),
    activeConnection?.quit(),
  ]);
}

export async function initializeJobQueue(options = {}) {
  handlers = options.handlers || {};
  onDeadLetter = options.onDeadLetter || null;
  onCompleted = options.onCompleted || null;
  if (!process.env.REDIS_URL || queue) return { configured: Boolean(queue), mode: queue ? 'bullmq' : 'direct' };
  redisDisabledReason = '';
  connection = new IORedis(process.env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
  connection.on('error', error => {
    if (isRedisLimitError(error)) void disableRedisQueue(error);
  });
  queue = new Queue('reigns-background-jobs', { connection, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1500 }, removeOnComplete: 250, removeOnFail: 500 } });
  queue.on('error', error => {
    if (isRedisLimitError(error)) void disableRedisQueue(error);
  });
  worker = new Worker('reigns-background-jobs', async job => {
    const handler = handlers[job.name];
    if (!handler) throw new Error(`No handler is registered for ${job.name}.`);
    return handler(job.data, job);
  }, {
    connection,
    concurrency: numberFromEnv('JOB_WORKER_CONCURRENCY', 3, 1),
    // BullMQ defaults to polling an empty queue every five seconds. A longer
    // block keeps small request-metered Redis plans useful for actual work.
    drainDelay: numberFromEnv('JOB_WORKER_DRAIN_DELAY_SECONDS', 300, 5),
    stalledInterval: numberFromEnv('JOB_WORKER_STALLED_INTERVAL_MS', 300_000, 30_000),
  });
  worker.on('error', error => {
    if (isRedisLimitError(error)) void disableRedisQueue(error);
  });
  worker.on('failed', (job, error) => {
    if (job && job.attemptsMade >= Number(job.opts.attempts || 1)) Promise.resolve(onDeadLetter?.(job, error)).catch(() => {});
  });
  worker.on('completed', (job, result) => { Promise.resolve(onCompleted?.(job, result)).catch(() => {}); });
  try {
    await queue.waitUntilReady();
    return { configured: true, mode: 'bullmq' };
  } catch (error) {
    if (!isRedisLimitError(error)) throw error;
    await disableRedisQueue(error);
    return { configured: false, mode: 'direct', degradedReason: redisDisabledReason };
  }
}

export async function enqueueJob(name, data, options = {}) {
  if (!queue) {
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler is registered for ${name}.`);
    return handler(data, { id: `direct-${Date.now()}`, name, attemptsMade: 0 });
  }
  try {
    const job = await queue.add(name, data, options);
    return { queued: true, id: job.id };
  } catch (error) {
    if (!isRedisLimitError(error)) throw error;
    await disableRedisQueue(error);
    const handler = handlers[name];
    if (!handler) throw new Error(`No handler is registered for ${name}.`);
    return handler(data, { id: `direct-${Date.now()}`, name, attemptsMade: 0 });
  }
}

export async function jobQueueHealth() {
  if (!queue) return { configured: false, mode: 'direct', waiting: 0, failed: 0, ...(redisDisabledReason ? { degradedReason: redisDisabledReason } : {}) };
  try {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
    return { configured: true, mode: 'bullmq', ...counts };
  } catch (error) {
    if (!isRedisLimitError(error)) throw error;
    await disableRedisQueue(error);
    return { configured: false, mode: 'direct', waiting: 0, failed: 0, degradedReason: redisDisabledReason };
  }
}

export async function closeJobQueue() {
  await worker?.close();
  await queue?.close();
  await connection?.quit();
}
