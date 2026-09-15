export interface Ticket {
  readonly gain: number;
}

interface Entry extends Ticket {
  stop(): void;
}

/** Bounds how many voices sound at once, giving way to louder ones. */
export class VoiceCap {
  private readonly active = new Set<Entry>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get size(): number {
    return this.active.size;
  }

  /** Admits a voice, stopping the quietest if full; `null` when the new voice is the quietest. */
  admit(gain: number, stop: () => void): Ticket | null {
    if (this.active.size >= this.max) {
      let quietest: Entry | undefined;
      for (const entry of this.active) {
        if (!quietest || entry.gain < quietest.gain) quietest = entry;
      }
      if (!quietest || gain < quietest.gain) return null;
      this.active.delete(quietest);
      quietest.stop();
    }
    const entry: Entry = { gain, stop };
    this.active.add(entry);
    return entry;
  }

  release(ticket: Ticket): void {
    this.active.delete(ticket as Entry);
  }
}
