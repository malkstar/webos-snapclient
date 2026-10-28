// Luna bus caller for webOS. Primary path: PalmServiceBridge, the object
// WAM injects into every webview on LG closed firmware. The old
// ws://localhost:3000/api/luna endpoint exists only on webOS Open Source
// Edition (emulator/rpi), never on a shipping TV — kept as fallback.
(function () {
  'use strict';

  function bridgeCall(method, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var done = false, b;
      try { b = new PalmServiceBridge(); } catch (e) { reject(e); return; }
      var timer = setTimeout(function () {
        if (!done) { done = true; try { b.cancel(); } catch (e) {} reject(new Error('timeout: ' + method)); }
      }, timeoutMs || 8000);
      b.onservicecallback = function (raw) {
        if (done) return;
        done = true; clearTimeout(timer);
        try { b.cancel(); } catch (e) {}
        var data;
        try { data = JSON.parse(raw); } catch (e) { reject(e); return; }
        if (data && data.returnValue === false) {
          reject(new Error((data.errorText || data.errorCode || 'error') + ' [' + method + ']'));
          return;
        }
        resolve(data);
      };
      try { b.call('luna://' + method, JSON.stringify(params || {}), timeoutMs || 8000); }
      catch (e) { if (!done) { done = true; clearTimeout(timer); reject(e); } }
    });
  }

  function wsCall(method, params, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var ws, done = false;
      try { ws = new WebSocket('ws://localhost:3000/api/luna/' + method); }
      catch (e) { reject(e); return; }
      var timer = setTimeout(function () {
        if (!done) { done = true; try { ws.close(); } catch (e) {} reject(new Error('timeout: ' + method)); }
      }, timeoutMs || 8000);
      ws.onopen = function () { ws.send(JSON.stringify(params || {})); };
      ws.onmessage = function (ev) {
        if (done) return;
        done = true; clearTimeout(timer);
        try { ws.close(); } catch (e) {}
        var data;
        try { data = JSON.parse(ev.data); } catch (e) { reject(e); return; }
        if (data.friendlyText && data.error) { reject(new Error(data.error + ': ' + data.friendlyText)); return; }
        resolve(data);
      };
      ws.onerror = function () { if (!done) { done = true; clearTimeout(timer); reject(new Error('ws error: ' + method)); } };
    });
  }

  // one-shot (non-subscribed) call; resolves with the parsed reply object
  window.lunaCall = function (method, params, timeoutMs) {
    return (typeof PalmServiceBridge === 'function' ? bridgeCall : wsCall)(method, params, timeoutMs);
  };

  // subscription: cb(payloadObject) until it returns false or cancel() is
  // called; returns a cancel handle. Bridge-only (no OSE fallback needed yet).
  window.lunaSubscribe = function (method, params, cb) {
    if (typeof PalmServiceBridge !== 'function') { cb({ returnValue: false, errorText: 'no bridge' }); return { cancel: function () {} }; }
    var b = new PalmServiceBridge(), stopped = false;
    b.onservicecallback = function (raw) {
      if (stopped) return;
      var data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      if (cb(data) === false || data.subscribed === false) { stopped = true; try { b.cancel(); } catch (e) {} }
    };
    var p = {}; for (var k in params) p[k] = params[k]; p.subscribe = true;
    b.call('luna://' + method, JSON.stringify(p));
    return { cancel: function () { stopped = true; try { b.cancel(); } catch (e) {} } };
  };
})();
