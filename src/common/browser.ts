// Type imports for browser extension APIs
/// <reference types="webextension-polyfill" />

// Declare global variables for TypeScript
/* eslint-disable no-var, vars-on-top */
declare global {
  var browser: typeof import('webextension-polyfill');
  var IS_FIREFOX: boolean;
  var VIOLENTMONKEY: string;
  var logging: { error: (...args: any[]) => void };
  var safePush: (arr: any[], item: any) => void;
  var safeApply: (func: (...args: any[]) => any, thisArg: any, args: any[]) => any;
  var isPromise: (val: any) => val is Promise<any>;
  var isFunction: (val: any) => val is (...args: any[]) => any;
  var isObject: (val: any) => val is object;
  var hasOwnProperty: (obj: object, prop: string | number | symbol) => boolean;
  var SafePromise: PromiseConstructor;
  var SafeError: ErrorConstructor;
  /* eslint-enable no-var, vars-on-top */
}


let browserInstance = global.browser;
const kAddListener = 'addListener';
const kRemoveListener = 'removeListener';

// Since this also runs in a content script we'll guard against implicit global variables
// for DOM elements with 'id' attribute which is a standard feature, more info:
// https://github.com/mozilla/webextension-polyfill/pull/153
// https://html.spec.whatwg.org/multipage/window-object.html#named-access-on-the-window-object
if (!IS_FIREFOX && !browserInstance?.runtime) {
  const { Proxy: SafeProxy } = global as any; // Cast global to any to access Proxy
  const MESSAGE = 'message';
  const STACK = 'stack';

  const isSyncMethodName = (key: string) => key === kAddListener
    || key === kRemoveListener
    || key === 'hasListener'
    || key === 'hasListeners';

  /** API types or enums or literal constants */
  const proxifyValue = (target: any, key: string, src: any, metaVal: any): any => {
    const srcVal = src[key];
    if (srcVal === undefined) return;
    let res;
    if (isFunction(metaVal)) {
      res = metaVal(src, srcVal);
    } else if (isFunction(srcVal)) {
      res = metaVal === 0 || isSyncMethodName(key) || !hasOwnProperty(src, key)
        ? srcVal.bind(src) // Replaced ::bind operator
        : wrapAsync(src, srcVal);
    } else if (isObject(srcVal) && metaVal !== 0) {
      res = proxifyGroup(srcVal, metaVal);
    } else {
      res = srcVal;
    }
    target[key] = res;
    return res;
  };

  const proxifyGroup = (src: any, meta: any): any => new SafeProxy({ __proto__: null }, {
    __proto__: null,
    get: (group: any, key: string) => group[key] ?? proxifyValue(group, key, src, meta?.[key]),
  });

  type WrapAsyncPreprocessorFunc = (resolve: (value?: any) => void, response: any) => (string[] | undefined | void);

  const wrapAsync = (thisArg: any, func: (...args: any[]) => any, preprocessorFunc?: WrapAsyncPreprocessorFunc) => (
    (...args: any[]) => {
      let resolve: (value?: any) => void;
      let reject: (reason?: any) => void;
      const promise = new SafePromise((_resolve, _reject) => {
        resolve = _resolve;
        reject = _reject;
      });
      const stackInfo = new SafeError(`callstack before invoking ${func.name || 'chrome API'}:`) as any;
      const cb = (result: any) => {
        const runtimeErr = global.chrome?.runtime?.lastError;
        const err = runtimeErr || (
          preprocessorFunc
            ? preprocessorFunc(resolve, result)
            : resolve(result)
        );
        if (err) {
          if (!runtimeErr) stackInfo[STACK] = `${(err as any)[1]}\n${stackInfo[STACK]}`;
          stackInfo[MESSAGE] = runtimeErr ? (err as any)[MESSAGE] : `${(err as any)[0]}`;
          stackInfo.isRuntime = !!runtimeErr;
          reject(stackInfo);
        }
      };
      if (process.env.IS_INJECTED) {
        safePush(args, cb);
        try {
          safeApply(func, thisArg, args);
        } catch (e: any) {
          if (e[MESSAGE] === 'Extension context invalidated.') {
            logging.error(`Please reload the tab to restore ${VIOLENTMONKEY} API for userscripts.`);
          } else {
            throw e;
          }
        }
      } else {
        func.apply(thisArg, [...args, cb]); // Replaced ::func operator
      }
      if (process.env.DEBUG) promise.catch(err => console.warn(args, err?.[MESSAGE] || err));
      return promise;
    }
  );

  const wrapResponse = (result?: any, error?: any): [any, (string[] | undefined)] => {
    if (process.env.DEBUG) console[error ? 'warn' : 'log']('sendResponse', error || result);
    return [
      result ?? null,
      error && (
        error[MESSAGE]
          ? [error[MESSAGE], error[STACK]]
          : [error.toString(), new SafeError().stack]
      ),
    ];
  };

  const sendResponseAsync = async (resultPromise: Promise<any>, sendResponse: (response: any) => void) => {
    try {
      sendResponse(wrapResponse(await resultPromise));
    } catch (err) {
      sendResponse(wrapResponse(undefined, err));
    }
  };

  const onMessageListener = (
    listener: (message: any, sender: browser.runtime.MessageSender) => any,
    message: any,
    sender: browser.runtime.MessageSender,
    sendResponse: (response: any) => void
  ) => {
    if (process.env.DEBUG) console.info('receive', message);
    try {
      const result = listener(message, sender);
      if (result && (
        process.env.IS_INJECTED
          ? isPromise(result)
          : result instanceof Promise
      )) {
        sendResponseAsync(result, sendResponse);
        return true;
      } else if (result !== undefined) {
        sendResponse(wrapResponse(result));
      }
    } catch (err) {
      sendResponse(wrapResponse(undefined, err));
    }
  };

  const unwrapResponse: WrapAsyncPreprocessorFunc = (resolve, response) => {
    if (!response) return ['null response', new SafeError().stack];
    if (response[1]) return response[1]; // error created in wrapResponse
    resolve(response[0]); // result created in wrapResponse
  };


  const wrapSendMessage = (runtime: any, sendMessage: any) => (
    wrapAsync(runtime, sendMessage, unwrapResponse)
  );

  browserInstance = global.browser = proxifyGroup(global.chrome, {
    extension: 0,
    i18n: 0,
    runtime: {
      connect: 0,
      getManifest: 0,
      getURL: 0,
      onMessage: {
        [kAddListener]: (onMessage: any, addListener: any) => (
          (listener: (message: any, sender: browser.runtime.MessageSender) => any) => {
            if (process.env.DEV
            && !process.env.IS_INJECTED
            && listener.constructor.name === 'AsyncFunction') { // Checking for async function
              throw new SafeError('onMessage listener cannot be async');
            }
            return addListener.call(onMessage, onMessageListener.bind(null, listener)); // Replaced ::addListener and ::bind
          }
        ),
      },
      sendMessage: wrapSendMessage,
    },
    tabs: !process.env.IS_INJECTED && {
      connect: 0,
      sendMessage: wrapSendMessage,
    },
  }) as any; // Cast to any as the proxified object doesn't perfectly match browser types
} else if (process.env.DEBUG && IS_FIREFOX) {
  let counter = 0;
  const { runtime } = browserInstance;
  const { sendMessage, onMessage } = runtime;
  const log = (type: string, args: any[], id: number, isResponse?: boolean) => console.info(
    `${type}Message#%d${isResponse ? ' response' : ''}`,
    id,
    ...args,
  );
  (runtime as any).sendMessage = (...args: any[]) => { // Cast runtime to any to assign sendMessage
    counter += 1;
    const id = counter;
    log('send', args, id);
    const promise = sendMessage.apply(runtime, args); // Replaced ::sendMessage
    promise.then((data: any) => log('send', [data], id, true), console.warn);
    return promise;
  };
  const { addListener } = onMessage;
  (onMessage as any).addListener = (listener: (...args: any[]) => any) => addListener.call(onMessage, (msg: any, sender: browser.runtime.MessageSender) => { // Replaced ::addListener and ::addListener
    counter += 1;
    const id = counter;
    const { frameId, tab, url } = sender;
    log('on', [msg, { frameId, tab, url }], id);
    const result = listener(msg, sender);
    (isFunction(result?.then) ? result : SafePromise.resolve(result))
    .then((data: any) => log('on', [data], id, true), console.warn);
    return result;
  });
}


export default browserInstance;

export function listenOnce(this: browser.events.Event<(...args: any[]) => void>, cb: (...args: any[]) => void): void {
  // eslint-disable-next-line @typescript-eslint/no-this-alias
  const event = this;
  const onceFn = (...data: any[]) => {
    event[kRemoveListener](onceFn as any); // Cast onceFn to any for removeListener
    cb(...data);
  };
  event[kAddListener](onceFn as any); // Cast onceFn to any for addListener
}
