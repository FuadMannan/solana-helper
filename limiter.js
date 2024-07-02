class Limiter {
  constructor(tokens, interval) {
    this.tokens = tokens;
    this.interval = this.convertInterval(interval);
    this.taskQueue = [];
    this.recent = [];
    this.currentlyProcessing = 0;
    this.intervalID = null;
  }

  // Convert constructor parameter from "10s" format to milliseconds
  convertInterval(interval) {
    const unitIndex = interval.search(/[hms]/);
    const unit = interval[unitIndex];
    const unitValues = { h: 60 * 60 * 1000, m: 60 * 1000, s: 1000 };
    const newInterval = Number(interval.slice(0, unitIndex)) * unitValues[unit];
    return newInterval;
  }

  // Clear recent tasks queue and return true if more
  // tasks can be processed within the interval
  checkRecent() {
    const now = Date.now();
    for (let index = this.recent.length - 1; index >= 0; index--) {
      const taskCompletion = this.recent[index];
      if (now - taskCompletion > this.interval) {
        this.recent.pop();
      } else {
        break;
      }
    }
    return this.recent.length >= this.tokens;
  }

  // Processes next task in queue
  async processNext() {
    if (
      this.taskQueue.length == 0 ||
      this.currentlyProcessing >= this.tokens ||
      this.checkRecent()
    ) {
      return;
    }
    this.currentlyProcessing++;
    const { CONN, fn, params, resolve, reject } = this.taskQueue.shift();

    let result;
    let completed = false;
    let delay = 500;
    while (!completed) {
      try {
        result = await fn.apply(CONN, params);
        this.recent.push(Date.now());
        resolve(result);
        completed = true;
      } catch (error) {
        reject(error);
      }
      delay += 500;
    }
    this.currentlyProcessing--;
    if (this.taskQueue.length > 0) {
      this.processNext();
    } else {
      clearInterval(this.intervalID);
      this.intervalID = null;
    }
  }

  // Add task to queue
  enqueue(CONN, fn, params) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ CONN, fn, params, resolve, reject });
      if (!this.intervalID) {
        this.intervalID = setInterval(async () => {
          if (this.taskQueue.length > 0) this.processNext();
        }, this.interval);
      }
      this.processNext();
    });
  }
}

module.exports = Limiter;
