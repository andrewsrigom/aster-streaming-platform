import { MetricReader, type CollectionResult } from "@opentelemetry/sdk-metrics";

export class ManualMetricReader extends MetricReader {
  constructor(cardinalityLimit: number) {
    super({ cardinalitySelector: () => cardinalityLimit });
  }

  async read(): Promise<CollectionResult> {
    return this.collect();
  }

  protected override async onForceFlush(): Promise<void> {
    await Promise.resolve();
  }

  protected override async onShutdown(): Promise<void> {
    await Promise.resolve();
  }
}
