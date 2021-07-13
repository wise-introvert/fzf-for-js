import * as Comlink from "comlink";

import { fzfQuick } from "../../lib/main";

// import list from "../../list.json";
const list = new Array(90000).fill("aaaaaaaaaaaaaaaaaaaaaaaaa");

Comlink.expose({
  find: async (
    slice: [startIdx: number, endIdx: number],
    query: string,
    cancel: () => Promise<boolean>
  ) => {
    const fzf = fzfQuick(query);
    const result = [];
    for (let i = slice[0]; i < slice[1]; i++) {
      const cancelled = await cancel();
      if (cancelled) {
        return Promise.reject("stopped an fzf chunk");
      }
      result.push(fzf(list[i]));
    }
    return result.filter((v) => v.result.score !== 0);
  },
});
