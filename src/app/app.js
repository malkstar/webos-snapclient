/* Snapclient webOS control UI - Pattern B: all privileged actions go through
 * the Homebrew Channel's public root exec API (org.webosbrew.hbchannel.service
 * /exec). No custom Luna service, no elevation step, the snapclient binary is
 * byte-identical to the upstream Debian armel build. */
(function () {
  'use strict';
  var ID = 'com.github.malkstar.snapclient';
  var APPDIR = '/media/developer/apps/usr/palm/applications/' + ID;
  var STATE = '/var/lib/webosbrew/' + ID;
  var EXEC = 'org.webosbrew.hbchannel.service/exec';

  function $(id) { return document.getElementById(id); }
  function shQuote(s) { return "'" + String(s).split("'").join("'\\''") + "'"; }
  function exec(command, timeoutMs) {
    // hbchannel.service/exec answers with stdoutString/stderrString
    return lunaCall(EXEC, { command: command }, timeoutMs || 15000)
      .then(function (r) { return (r && (r.stdoutString || r.stdout || '')) || ''; });
  }

  // client-side validation before anything reaches a root shell
  function collect() {
    var server = $('server').value.trim();
    var port = $('port').value.trim() || '1704';
    var latency = $('latency').value.trim() || '0';
    var player = $('player').value;
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(server)) throw 'Server address contains invalid characters.';
    if (!/^[0-9]{1,5}$/.test(port)) throw 'Port must be numeric.';
    if (!/^-?[0-9]{1,4}$/.test(latency)) throw 'Latency must be a whole number of ms.';
    if (['pulse', 'sdl2', 'alsa'].indexOf(player) < 0) throw 'Unknown player.';
    return { server: server, port: port, player: player, latency: latency };
  }

  function saveConfig(c) {
    var body = 'SERVER=' + shQuote(c.server) + '\nPORT=' + c.port +
               '\nPLAYER=' + c.player + '\nLATENCY=' + c.latency + '\n';
    return exec('mkdir -p ' + STATE + " && cat > " + STATE + '/config <<"EOCFG"\n' + body + 'EOCFG');
  }

  function loadConfig() {
    return exec('cat ' + STATE + '/config 2>/dev/null || true').then(function (txt) {
      var m;
      if ((m = txt.match(/^SERVER='?([^'\n]*)'?/m))) $('server').value = m[1];
      if ((m = txt.match(/^PORT=([^'\n]*)/m))) $('port').value = m[1];
      if ((m = txt.match(/^PLAYER=([^'\n]*)/m))) $('player').value = m[1];
      if ((m = txt.match(/^LATENCY=([^'\n]*)/m))) $('latency').value = m[1];
    });
  }

  function setAutostart(on) {
    return on
      ? exec('mkdir -p /var/lib/webosbrew/init.d && ln -sfn ' + APPDIR + '/bin/autostart.sh /var/lib/webosbrew/init.d/' + ID)
      : exec('rm -f /var/lib/webosbrew/init.d/' + ID);
  }
  function autostartEnabled() {
    return exec('readlink /var/lib/webosbrew/init.d/' + ID + ' 2>/dev/null || true')
      .then(function (r) { $('autostart').checked = r.trim().length > 0; });
  }

  // status + log: one exec round trip per poll; status derived from the log
  // tail so it says what snapclient actually experiences (synced / waiting /
  // retrying), not just "a process exists"
  var logOpen = false, lastLog = '';

  function setStatus(dotCls, text) {
    $('status').innerHTML = '<span class="dot ' + dotCls + '"></span>' + text;
  }

  function renderStatus(pidRaw, log) {
    var pid = (pidRaw || '').trim().split(/\s+/)[0] || '';
    $('start').disabled = !!pid; $('stop').disabled = !pid;
    if (window.Snapnav) window.Snapnav.repaint();
    if (!pid) { setStatus('off', 'daemon: stopped'); return; }
    var lines = (log || '').split('\n'), msg = null;
    for (var i = lines.length - 1; i >= 0 && !msg; i--) {
      var L = lines[i], m;
      if ((m = L.match(/diff to server \[ms\]: (-?[\d.]+(?:e[+-]?\d+)?)/))) {
        var d = parseFloat(m[1]);
        msg = (isFinite(d) && Math.abs(d) < 1000)
          ? { dot: 'on', txt: 'daemon: playing \u00b7 sync \u00b1' + Math.abs(d).toFixed(1) + ' ms' }
          : { dot: 'warn', txt: 'daemon: synchronising clock\u2026' };
        break;
      }
      if (/Time ref sync done/.test(L)) { msg = { dot: 'on', txt: 'daemon: playing \u00b7 server sync ok' }; break; }
      if (/Chunk available|PulsePlayer\) Start/.test(L)) { msg = { dot: 'on', txt: 'daemon: playing' }; break; }
      if (/No chunks available/.test(L)) { msg = { dot: 'warn', txt: 'daemon: connected \u2014 waiting for server stream' }; break; }
      if (/Connection (failed|refused|error)|[Dd]isconnect|connection closed|Broken pipe|resolve/i.test(L))
        { msg = { dot: 'warn', txt: 'daemon: waiting for server\u2026' }; break; }
    }
    if (!msg) msg = { dot: 'on', txt: 'daemon: running (pid ' + pid + ')' };
    setStatus(msg.dot, msg.txt);
  }

  function poll() {
    return exec('pidof snapclient 2>/dev/null || true; echo @@@; tail -n 40 ' + STATE + '/snapclient.log 2>/dev/null || true')
      .then(function (out) {
        var i = out.indexOf('@@@');
        var pidRaw = i >= 0 ? out.slice(0, i) : out;
        lastLog = i >= 0 ? out.slice(i + 3) : '';
        renderStatus(pidRaw, lastLog);
        if (logOpen) $('log').textContent = lastLog.trim() || '(no log yet)';
      });
  }

  function setLogOpen(on) {
    logOpen = on;
    $('log').style.display = on ? 'block' : 'none';
    $('logtoggle').textContent = on ? 'Hide log' : 'Show log';
    if (on) $('log').textContent = lastLog.trim() || '(no log yet)';
    if (window.Snapnav) window.Snapnav.repaint();
  }

  function refresh() {
    poll().catch(function () {});
    autostartEnabled().catch(function () {});
  }

  function showErr(msg) {
    $('status').innerHTML = '<span class="dot off"></span>error: ' + msg;
    try { alert(String(msg)); } catch (e) {} // dialogs unreliable on TV builds
  }
  function guard(fn) {
    return function () {
      try { fn().catch(function (e) { showErr(String(e && e.message || e)); refresh(); }); }
      catch (e) { showErr(String(e)); }
    };
  }

  $('save').onclick = guard(function () {
    return saveConfig(collect()).then(function () {
      return setAutostart($('autostart').checked);
    }).then(function () { $('save').textContent = 'Saved \u2713'; setTimeout(function () { $('save').textContent = 'Save'; }, 1500); });
  });
  $('start').onclick = guard(function () {
    return saveConfig(collect()).then(function () { return setAutostart($('autostart').checked); })
      .then(function () { return exec('sh ' + APPDIR + '/bin/start-daemon.sh'); })
      .then(function () { setTimeout(refresh, 1200); });
  });
  $('stop').onclick = guard(function () { return exec('pkill -x snapclient || true').then(function () { setTimeout(refresh, 800); }); });
  $('refresh').onclick = function () { refresh(); };
  $('logtoggle').onclick = function () { setLogOpen(!logOpen); };

  // advanced panel: port/player/latency/autostart stay hidden until asked
  var advOpen = false;
  function setAdvOpen(on) {
    advOpen = on;
    $('adv').style.display = on ? 'block' : 'none';
    $('advanced').textContent = on ? 'Hide advanced' : 'Show advanced';
    if (window.Snapnav) window.Snapnav.focus(on ? 'port' : 'advanced');
  }
  $('advanced').onclick = function () { setAdvOpen(!advOpen); };

  // server scan: mDNS (_snapcast._tcp) via dns-sd, TCP sweep fallback
  function renderFound(out) {
    var box = $('found');
    box.innerHTML = '';
    var lines = (out || '').split('\n').map(function (l) { return l.replace(/^\s+|\s+$/g, ''); })
      .filter(function (l) { return /^[A-Za-z0-9._:-]+ [0-9]+ /.test(l); });
    if (!lines.length) {
      $('status').innerHTML = '<span class="dot off"></span>scan: no Snapcast servers found on this network';
      return;
    }
    setStatus('on', 'scan: found ' + lines.length + ' Snapcast server' + (lines.length > 1 ? 's' : ''));
    var head = document.createElement('p');
    head.className = 'hint';
    head.textContent = 'Found \u2014 OK picks the highlighted one:';
    box.appendChild(head);
    lines.slice(0, 8).forEach(function (line, i) {
      var m = line.match(/^(\S+) (\d+) ?(.*)$/);
      var ip = m[1], port = m[2], name = (m[3] || '').trim();
      var b = document.createElement('button');
      b.id = 'found' + i; b.className = 'sec dynav';
      b.textContent = ip + ':' + port + (name ? '  \u2014  ' + name : '');
      b.onclick = function () {
        $('server').value = ip;
        $('port').value = port;
        box.innerHTML = '';
        if (window.Snapnav) { window.Snapnav.focus('save'); window.Snapnav.repaint(); }
      };
      box.appendChild(b);
    });
    if (window.Snapnav) window.Snapnav.focus('found0');
  }

  var scanBusy = false;
  $('scan').onclick = guard(function () {
    if (scanBusy) return Promise.resolve();
    scanBusy = true;
    $('scan').disabled = true;
    $('found').innerHTML = '<p class="hint">Scanning the network (mDNS + port sweep)&hellip;</p>';
    if (window.Snapnav) window.Snapnav.repaint();
    var p = ($('port').value.trim() || '1704').replace(/[^0-9]/g, '').slice(0, 5);
    return exec('sh ' + APPDIR + '/bin/scan-servers.sh ' + p, 120000)
      .then(function (out) { renderFound(out); },
            function (e) { $('found').innerHTML = ''; scanBusy = false; $('scan').disabled = false; throw e; })
      .then(function () { scanBusy = false; $('scan').disabled = false; if (window.Snapnav) window.Snapnav.repaint(); });
  });

  // boot: probe Homebrew Channel reachability, load config, start status poll
  exec('true').then(function () { loadConfig(); }, function () { $('banner').style.display = 'block'; });
  refresh();
  setInterval(function () { poll().catch(function () {}); }, 4000);
})();
