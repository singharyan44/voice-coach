// AttemptRecorder — owns the Start/Finish/final-Turn boundary race for M1.
//
// Problem it solves: "Finish attempt" used to submit immediately, but
// AssemblyAI final Turns for already-spoken audio can arrive AFTER the click.
// This recorder implements:
//
//   Finish clicked
//     → if the last Turn seen was already a final boundary → submit now
//     → otherwise wait for the next end_of_turn boundary, include it, then submit
//
// States: idle → recording → finishing → submitted.
// Only end_of_turn (final) Turns advance finalization; partials never submit.
// No timeouts: the AssemblyAI turn boundary is the single source of truth.
//
// turn_order guard: Turn events carry turn_order. Orders seen while idle are
// remembered so a stale final for pre-Start speech arriving after Start is
// excluded. Events without turn_order are accepted (cannot be filtered).
//
// UMD: browser global via <script> tag, require()-able in Node for tests.

class AttemptRecorder {
  constructor() {
    this.state = 'idle';
    this.turns = [];
    this.startTime = 0;
    this.finishTime = 0;
    this.seenTurn = false;
    this.lastWasFinal = false;
    this.maxIdleOrder = -1;
  }

  start(nowMs) {
    this.state = 'recording';
    this.turns = [];
    this.startTime = nowMs;
    this.finishTime = 0;
    this.seenTurn = false;
    this.lastWasFinal = false;
    return true;
  }

  resetToIdle() {
    this.state = 'idle';
    this.turns = [];
    this.startTime = 0;
    this.finishTime = 0;
    this.seenTurn = false;
    this.lastWasFinal = false;
  }

  isRecording() { return this.state === 'recording'; }
  isFinishing() { return this.state === 'finishing'; }

  _acceptOrder(order) {
    return order == null || order > this.maxIdleOrder;
  }

  // Route EVERY Turn event through here. Returns a submit payload
  // { transcript, turnCount, durationMs } exactly once per attempt, else null.
  onTurn({ text, final, order }) {
    if (this.state === 'idle') {
      if (final && order != null && order > this.maxIdleOrder) {
        this.maxIdleOrder = order;
      }
      return null;
    }
    if (this.state === 'submitted') return null;

    if (!final) {
      if (this.state === 'recording') this.seenTurn = true;
      return null;
    }

    // Final (end_of_turn) boundary.
    if (!this._acceptOrder(order)) return null; // stale pre-Start final
    this.seenTurn = true;
    this.lastWasFinal = true;
    const t = (text || '').trim();
    if (t) this.turns.push(t);

    if (this.state === 'finishing') {
      const transcript = this.turns.join(' ').trim();
      if (transcript) return this._submit(this.finishTime);
      // Only empty finals so far — keep waiting for a genuine final.
      return null;
    }
    return null;
  }

  // Returns { status:'submitted', attempt } | { status:'waiting' } |
  //         { status:'empty' } | { status:'duplicate' } | { status:'invalid' }
  finish(nowMs) {
    if (this.state === 'finishing' || this.state === 'submitted') {
      return { status: 'duplicate' };
    }
    if (this.state !== 'recording') return { status: 'invalid' };

    const transcript = this.turns.join(' ').trim();
    if (!transcript && !this.seenTurn) {
      return { status: 'empty' }; // never spoke: nothing will ever arrive
    }
    this.finishTime = nowMs;
    if (this.lastWasFinal) {
      if (!transcript) return { status: 'empty' };
      return { status: 'submitted', attempt: this._submit(nowMs) };
    }
    this.state = 'finishing';
    return { status: 'waiting' };
  }

  _submit(atMs) {
    const attempt = {
      transcript: this.turns.join(' ').trim(),
      turnCount: this.turns.length,
      durationMs: Math.max(0, atMs - this.startTime),
    };
    this.state = 'submitted';
    return attempt;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AttemptRecorder };
}
