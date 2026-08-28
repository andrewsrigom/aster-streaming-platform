import type { ProcessingFailure } from "../../domain/media-processing.js";

export class MediaProcessingError extends Error {
  constructor(
    readonly failure: ProcessingFailure,
    message: string,
  ) {
    super(message);
  }
}
