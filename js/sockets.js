let last_clock_drift = 0.0;
let last_latency = 0.0;

exports.ping = function(ws) {
  if (ws.readyState) {
    ws.send(`42["net/ping", { "client": ${Date.now()}, "drift": ${last_clock_drift}, "latency": ${last_latency} }]`);
  }
}

exports.handlePong = function(data) {
  let now = Date.now();
  let latency = now - data.client;
  let drift = ((now - latency / 2) - data.server);
  last_latency = latency;
  last_clock_drift = drift;
}

exports.getNetworkLatency = function() {
  return last_latency;
}

exports.getClockDrift = function() {
  return last_clock_drift;
}
