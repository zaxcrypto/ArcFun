// Queue to enforce strict 1 request per second for Arc Testnet RPC
const arcQueue: (() => void)[] = [];
let isArcProcessing = false;
let lastArcRequestTime = 0;
const ARC_RATE_LIMIT_DELAY = 1050; // 1.05 seconds between requests

async function processArcQueue() {
  if (isArcProcessing) return;
  isArcProcessing = true;
  
  while (arcQueue.length > 0) {
    const now = Date.now();
    const timeToWait = ARC_RATE_LIMIT_DELAY - (now - lastArcRequestTime);
    
    if (timeToWait > 0) {
      await new Promise(r => setTimeout(r, timeToWait));
    }
    
    const next = arcQueue.shift();
    if (next) {
      lastArcRequestTime = Date.now();
      next();
    }
  }
  
  isArcProcessing = false;
}

let isPatched = false;

/**
 * A drop-in replacement for `fetch` that intercepts requests to Arc Testnet
 * and enforces a strict 1 request per second rate limit via a Mutex queue.
 * Automatically rewrites any dead `rpc.testnet.arc.network` URLs to the working Alchemy RPC.
 */
export function rateLimitedFetch(input: RequestInfo | URL, init?: RequestInit, originalFetch?: typeof fetch): Promise<Response> {
  const workingArcRpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || "https://5042002.rpc.thirdweb.com";
  let url = typeof input === 'string' ? input : (input as Request).url || input.toString();
  let finalInput: RequestInfo | URL = input;

  if (url.includes('rpc.testnet.arc.network')) {
    url = url.replace(/https?:\/\/rpc\.testnet\.arc\.network\/?/g, workingArcRpc);
    if (typeof input === 'string') {
      finalInput = url;
    } else if (typeof Request !== 'undefined' && input instanceof Request) {
      finalInput = new Request(url, input);
    } else if (typeof URL !== 'undefined' && input instanceof URL) {
      finalInput = new URL(url);
    } else {
      finalInput = url;
    }
  }

  const fetcher = originalFetch || fetch;
  
  // NEVER throttle fast providers like Alchemy or Thirdweb
  const isFastProvider = url.includes('alchemy.com') || url.includes('thirdweb.com');
  if (!isFastProvider && (url.includes('arcscan') || url.includes('arc.network'))) {
    return new Promise((resolve, reject) => {
      arcQueue.push(async () => {
        try {
          const res = await fetcher(finalInput, init);
          
          if (res.status === 429) {
            reject(new Error("429 Too Many Requests"));
            return;
          }
          
          resolve(res);
        } catch(e) { 
          reject(e); 
        }
      });
      processArcQueue();
    });
  }
  
  return fetcher(finalInput, init);
}

/**
 * Globally monkeys-patches window.fetch to ensure ALL libraries (Viem, AppKit, etc)
 * go through the rate-limiting queue for Arc Testnet.
 */
export function applyGlobalArcFetchPatch() {
  if (typeof window !== 'undefined' && !isPatched) {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      return rateLimitedFetch(args[0], args[1], originalFetch);
    };
    isPatched = true;
    console.log("🔒 Global Arc Testnet rate-limiter applied to window.fetch");
  }
}
