'use strict';
const { EventEmitter } = require('events');

class RemoteBridge extends EventEmitter {
  constructor(opts = {}) {
    super();
    this._queue   = [];
    this._pollMs  = opts.pollInterval || 5000;
    this._timer   = null;
    this._running = false;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._timer = setInterval(() => this._poll(), this._pollMs).unref();
  }

  stop() {
    this._running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  enqueue(cmd) {
    this._queue.push({ ...cmd, enqueuedAt: Date.now() });
    this.emit('command', cmd);
  }

  async submitReview(ticket, result) {
    this.emit('review', { ticket, result, submittedAt: Date.now() });
  }

  _poll() {
    if (this._queue.length > 0) {
      const cmd = this._queue.shift();
      this.emit('process', cmd);
    }
  }
}

let _instance = null;
function getRemoteBridge(opts) {
  if (!_instance) _instance = new RemoteBridge(opts);
  return _instance;
}

module.exports = { RemoteBridge, getRemoteBridge };
