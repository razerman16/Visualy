import type {FastifyInstance} from 'fastify';

type Worker = () => Promise<void>;
const queues = new WeakMap<FastifyInstance, {workers: Worker[]}>();

// PDF and video share one converter and one database lock. Independent timers
// can fire together forever: an empty PDF queue may win the lock on every tick.
// Run one job from each queue in turn; the DB lock still coordinates API instances.
export function registerImportWorker(api: FastifyInstance, worker: Worker) {
  let queue = queues.get(api);
  if (!queue) {
    queue = {workers: []};
    queues.set(api, queue);
    const current = queue;
    let stopped = false, running: Promise<void> | undefined;
    const timer = setInterval(() => {
      if (stopped || running) return;
      running = (async () => {
        for (const work of current.workers) {
          if (stopped) break;
          try { await work(); }
          catch (error) { api.log.error({err: error}, 'Import queue unavailable'); }
        }
      })().finally(() => { running = undefined; });
    }, 2000);
    timer.unref();
    api.addHook('onClose', async () => {
      stopped = true;
      clearInterval(timer);
      await running;
      queues.delete(api);
    });
  }
  queue.workers.push(worker);
}
