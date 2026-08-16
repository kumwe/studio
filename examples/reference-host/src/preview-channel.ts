import type {
  PreviewMessageListener,
  PreviewMessageSource,
  PreviewMessageTarget,
} from '@kumwe/studio-preview';

/**
 * One side of the in-page preview channel. An endpoint is simultaneously the
 * message source its side listens on and the target it posts to, so it plugs
 * directly into `PreviewClient`/`PreviewHost` as both `source` and `target`.
 */
export interface PreviewChannelEndpoint extends PreviewMessageSource, PreviewMessageTarget {}

export interface PreviewChannelPair {
  rendererEndpoint: PreviewChannelEndpoint;
  studioEndpoint: PreviewChannelEndpoint;
}

/**
 * Builds the reference host's preview transport over a real `MessageChannel`.
 *
 * The preview contract prescribes a sandboxed iframe with origin-checked
 * `postMessage` "or an equivalently isolated host mechanism". The reference
 * host serves shell and renderer from one origin under a CSP whose
 * `frame-src 'none'` keeps the page frameless, so it uses the equivalent
 * mechanism: a dedicated `MessageChannel` whose ports carry only
 * structured-clone JSON envelopes. Every delivered event is stamped with the
 * page's own origin and the receiving endpoint as its source window stand-in,
 * so `PreviewClient` and `PreviewHost` apply their full inbound filter —
 * pinned origin, expected source, canonical schema, channel ID, session
 * generation, and strictly increasing sequence — exactly as they would across
 * a frame boundary. Nothing is bypassed; the guards run against real
 * asynchronous message delivery.
 */
export function createPreviewChannel(origin: string): PreviewChannelPair {
  const channel = new MessageChannel();
  return {
    rendererEndpoint: createEndpoint(channel.port2, origin),
    studioEndpoint: createEndpoint(channel.port1, origin),
  };
}

function createEndpoint(port: MessagePort, origin: string): PreviewChannelEndpoint {
  const listeners = new Set<PreviewMessageListener>();
  const endpoint: PreviewChannelEndpoint = {
    addEventListener(type: 'message', listener: PreviewMessageListener): void {
      if (type === 'message') {
        listeners.add(listener);
      }
    },
    postMessage(message: unknown): void {
      port.postMessage(message);
    },
    removeEventListener(type: 'message', listener: PreviewMessageListener): void {
      if (type === 'message') {
        listeners.delete(listener);
      }
    },
  };
  port.addEventListener('message', (event: MessageEvent) => {
    for (const listener of [...listeners]) {
      listener({ data: event.data, origin, source: endpoint });
    }
  });
  port.start();
  return endpoint;
}
