const cbToken = require('../lib/cbToken');
const pollPoOut = require('./pollPoOut');
const pollAckOut = require('./pollAckOut');
const flushAckOut = require('./flushAckOut');
const timeoutMonitor = require('./timeoutMonitor');

function startAll() {
  cbToken.start();          // CB-token ophalen + 3.5h refresh
  pollPoOut.start();        // BB-poller
  pollAckOut.start();       // OB-poller
  flushAckOut.start();      // Retry voor unsent ACKs (sent_to_cb=0)
  timeoutMonitor.start();   // 1u-timeout-monitor
}

const manualRoutes = {
  'poll-po-out':   () => pollPoOut.runOnce(),
  'poll-ack-out':  () => pollAckOut.runOnce(),
  'flush-ack-out': () => flushAckOut.runOnce(),
  'timeout':       () => timeoutMonitor.runOnce(),
  'cb-token':      () => cbToken.refresh(),
};

module.exports = { startAll, manualRoutes };
