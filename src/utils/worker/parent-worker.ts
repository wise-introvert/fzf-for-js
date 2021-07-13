import * as Comlink from "comlink";

import { WorkerPool } from "../worker-pool";
import Worker from "./child-worker?worker";
import type { FzfResultItem } from "../../lib/main";

// import list from "../../list.json";
const list = new Array(90000).fill("aaaaaaaaaaaaaaaaaaaaaaaaa");

// Idea of these constansts is taken from
// https://github.com/junegunn/fzf/blob/7191ebb615f5d6ebbf51d598d8ec853a65e2274d/src/matcher.go#L42
const MAX_PARTITIONS = 32;
const PARTITIONS = 32;

const sliceList = () => {
  const slices = new Array(PARTITIONS);
  const slicelen = Math.floor(list.length / PARTITIONS);

  for (let i = 0; i < PARTITIONS; i++) {
    const startIdx = i * slicelen;
    let endIdx = startIdx + slicelen;
    if (i === PARTITIONS - 1) {
      endIdx = list.length;
    }
    slices[i] = [startIdx, endIdx];
  }

  return slices;
};

const slices = sliceList();

const workerFactory = () => new Worker();
const pool = new WorkerPool(workerFactory, PARTITIONS);

// TODO replace `any`
const resultOrAbort = <T>(promises: Promise<T>) => {
  let signal = false;
  const abort = () => {
    signal = true;
  };

  const promise = Promise.race<Promise<T>>([
    promises,
    new Promise((_, rej) => {
      const checkSignal = () => {
        if (signal) {
          rej("didn't waited for all chunks to give result");
          return;
        }
        requestAnimationFrame(checkSignal);
      };

      checkSignal();
    }),
  ]);

  return {
    promise,
    abort,
  };
};

type query = string;
const cache: Record<query, FzfResultItem[]> = {};

let abortPrevJob = () => {};

let lastJobId = "";

const fzfFindAsync = async (query: string) => {
  const jobId = `fzf::${query}::${Date.now()}`;
  lastJobId = jobId;
  // TODO cancel previous query
  pool.jobs = [];
  abortPrevJob();

  const cachedResult = cache[query];
  if (cachedResult !== undefined) {
    return cachedResult;
  }

  try {
    let signals = {
      stop: false,
    };

    const partialResultsPromise = Promise.all<FzfResultItem[]>(
      slices.map((slice) => {
        return pool.callFn("find")(
          slice,
          query,
          Comlink.proxy(() => signals.stop)
        ) as Promise<FzfResultItem[]>;
      })
    );

    const { promise, abort } = resultOrAbort(partialResultsPromise);
    abortPrevJob = () => {
      signals.stop = true;
      abort();
    };
    const partialResults = await promise;

    if (jobId !== lastJobId) return null;

    let result = partialResults.flat();
    result.sort((a, b) => b.result.score - a.result.score);

    if (jobId !== lastJobId) return null;

    result = result.slice(0, 32);

    console.log(pool.pool);

    // cache[query] = result;
    return result;
  } catch (error) {
    // TODO null ain't the best return, maybe throw reject w/ error?
    // same for early returns in try blcok?
    console.log("scratched results for", query, { error });
    return null;
  }
};

Comlink.expose({ fzfFindAsync });
