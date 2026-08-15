import {
  STUDIO_CONTRACT_VERSION,
  type MediaUploadAcceptedAsset,
  type MediaUploadPlan,
  type MediaUploadRequestDescriptor,
  type MediaUploadSession,
  type MediaUploadSessionState,
  type MessageReference,
} from '@kumwe/studio-protocol';

export const MEDIA_UPLOAD_FAILURE: Readonly<MessageReference> = Object.freeze({
  defaultMessage: 'The upload could not be completed.',
  key: 'studio.media/upload-failed',
});

export const MEDIA_UPLOAD_TOO_LARGE: Readonly<MessageReference> = Object.freeze({
  defaultMessage: 'The file is larger than the host allows for this upload.',
  key: 'studio.media/upload-too-large',
});

export interface MediaUploadChunk {
  data: Blob;
  offset: number;
  sessionId: string;
}

/**
 * Host adapter for the upload lifecycle in `docs/contracts/media.md`. The
 * host owns authorization, custody, verification, and acceptance; Studio
 * only orchestrates the canonical media-upload-session state machine.
 */
export interface MediaUploadTransport {
  /** Best-effort server-side cancellation; rejections are ignored. */
  abort(sessionId: string): Promise<void>;
  authorize(request: MediaUploadRequestDescriptor, signal?: AbortSignal): Promise<MediaUploadPlan>;
  finalize(sessionId: string, signal?: AbortSignal): Promise<MediaUploadAcceptedAsset>;
  transfer(chunk: MediaUploadChunk, signal?: AbortSignal): Promise<void>;
}

export interface MediaUploadControllerOptions {
  sessionId?: (request: MediaUploadRequestDescriptor) => string;
}

export type MediaUploadListener = (session: MediaUploadSession) => void;

const ACTIVE_STATES: ReadonlySet<MediaUploadSessionState> = new Set<MediaUploadSessionState>([
  'authorized',
  'requested',
  'transferring',
  'verifying',
]);

export class MediaUploadController {
  readonly #listeners = new Set<MediaUploadListener>();
  readonly #sessionId: (request: MediaUploadRequestDescriptor) => string;
  readonly #transport: MediaUploadTransport;
  #abortController?: AbortController;
  #file?: Blob;
  #session?: MediaUploadSession;

  public constructor(transport: MediaUploadTransport, options?: MediaUploadControllerOptions) {
    this.#transport = transport;
    this.#sessionId = options?.sessionId ?? ((): string => crypto.randomUUID());
  }

  public get session(): MediaUploadSession {
    if (this.#session === undefined) {
      throw new Error('No upload session has been started.');
    }
    return structuredClone(this.#session);
  }

  public cancel(): void {
    const current = this.#session;
    if (current === undefined || !ACTIVE_STATES.has(current.state)) {
      return;
    }
    this.#abortController?.abort();
    this.#setSession({ ...structuredClone(current), state: 'cancelled' });
    void this.#transport.abort(current.id).catch(() => undefined);
  }

  public async retry(): Promise<MediaUploadSession> {
    const current = this.#session;
    const file = this.#file;
    if (current?.state !== 'failed' || file === undefined) {
      throw new Error('Only a failed upload session can be retried.');
    }
    return this.#run(file, structuredClone(current.request));
  }

  public subscribe(listener: MediaUploadListener): () => void {
    this.#listeners.add(listener);
    if (this.#session !== undefined) {
      listener(this.session);
    }
    return (): void => {
      this.#listeners.delete(listener);
    };
  }

  public async upload(
    file: Blob,
    request: Omit<MediaUploadRequestDescriptor, 'byteSize'>,
  ): Promise<MediaUploadSession> {
    if (this.#session !== undefined && ACTIVE_STATES.has(this.#session.state)) {
      throw new Error('An upload session is already in progress.');
    }
    if (file.size < 1) {
      throw new Error('Cannot upload an empty file.');
    }
    const descriptor: MediaUploadRequestDescriptor = {
      byteSize: file.size,
      filename: request.filename,
      mediaType: request.mediaType,
      purpose: request.purpose,
    };
    if (request.checksum !== undefined) {
      descriptor.checksum = request.checksum;
    }
    this.#file = file;
    return this.#run(file, descriptor);
  }

  #fail(): void {
    const current = this.#session;
    if (current === undefined) {
      return;
    }
    const failed: MediaUploadSession = {
      contractVersion: current.contractVersion,
      failure: {
        code: 'studio.media/upload-failed',
        message: { ...MEDIA_UPLOAD_FAILURE },
        severity: 'error',
      },
      id: current.id,
      kind: 'media-upload-session',
      progress: { ...current.progress },
      request: { ...current.request },
      state: 'failed',
    };
    if (current.plan !== undefined) {
      failed.plan = { ...current.plan };
    }
    this.#setSession(failed);
  }

  async #run(file: Blob, request: MediaUploadRequestDescriptor): Promise<MediaUploadSession> {
    const controller = new AbortController();
    this.#abortController = controller;
    const totalBytes = request.byteSize;
    const base: Omit<MediaUploadSession, 'progress' | 'state'> = {
      contractVersion: STUDIO_CONTRACT_VERSION,
      id: this.#sessionId(request),
      kind: 'media-upload-session',
      request,
    };
    this.#setSession({
      ...base,
      progress: { totalBytes, transferredBytes: 0 },
      state: 'requested',
    });

    try {
      const plan = await this.#transport.authorize(request, controller.signal);
      if (controller.signal.aborted) {
        return this.session;
      }
      if (totalBytes > plan.maximumBytes) {
        this.#setSession({
          ...base,
          failure: {
            code: 'studio.media/upload-too-large',
            message: { ...MEDIA_UPLOAD_TOO_LARGE },
            parameters: { byteSize: totalBytes, maximumBytes: plan.maximumBytes },
            severity: 'error',
          },
          plan,
          progress: { totalBytes, transferredBytes: 0 },
          state: 'failed',
        });
        return this.session;
      }
      this.#setSession({
        ...base,
        plan,
        progress: { totalBytes, transferredBytes: 0 },
        state: 'authorized',
      });
      this.#setSession({
        ...base,
        plan,
        progress: { totalBytes, transferredBytes: 0 },
        state: 'transferring',
      });
      const chunkBytes = Math.max(1, plan.chunkBytes ?? totalBytes);
      let transferredBytes = 0;
      while (transferredBytes < totalBytes) {
        const data = file.slice(
          transferredBytes,
          Math.min(transferredBytes + chunkBytes, totalBytes),
        );
        await this.#transport.transfer(
          { data, offset: transferredBytes, sessionId: base.id },
          controller.signal,
        );
        if (controller.signal.aborted) {
          return this.session;
        }
        transferredBytes = Math.min(transferredBytes + data.size, totalBytes);
        this.#setSession({
          ...base,
          plan,
          progress: { totalBytes, transferredBytes },
          state: 'transferring',
        });
      }
      this.#setSession({
        ...base,
        plan,
        progress: { totalBytes, transferredBytes: totalBytes },
        state: 'verifying',
      });
      const asset = await this.#transport.finalize(base.id, controller.signal);
      if (controller.signal.aborted) {
        return this.session;
      }
      this.#setSession({
        ...base,
        asset,
        plan,
        progress: { totalBytes, transferredBytes: totalBytes },
        state: 'complete',
      });
    } catch {
      if (!controller.signal.aborted) {
        this.#fail();
      }
    }
    return this.session;
  }

  #setSession(session: MediaUploadSession): void {
    this.#session = session;
    for (const listener of this.#listeners) {
      listener(this.session);
    }
  }
}
