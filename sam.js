var net = require('net');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// beginnings of a SAM client (http://www.i2p2.de/samv3.html)
// will handle the HELLO handshake and emit commands as events
// currently logging all data because, well, in-progress
var SAM = module.exports = function () {
  EventEmitter.call(this);
  this.sock = null;
  this.connectCallback = null;
  this.commandBuffer = '';
};

SAM.DEFAULT_PORT = 7656;
SAM.DEFAULT_HOST = 'localhost';

util.inherits(SAM, EventEmitter);
var proto = SAM.prototype;

proto.connect = function (port, host, callback) {
  port = (typeof port !== 'function' && port) || SAM.DEFAULT_PORT;
  host = (typeof host !== 'function' && host) || SAM.DEFAULT_HOST;
  callback = this.connectCallback = 
    callback ||
    (typeof host === 'function' && host) ||
    (typeof port === 'function' && port) ||
    null;
  this.sock = net.connect(port || SAM.DEFAULT_PORT);
  this.sock.setEncoding('ASCII');
  this._setupListeners();
};

proto.end = function (data, encoding) {
  if (this.sock) {
    this.sock.end(data, encoding);
    this.sock = null;
    this.emit('close');
  }
};

proto._error = function (err) {
  this.emit('error', err);
  this.end();
};

proto._setupListeners = function () {
  var self = this;
  var bind = function (func) {
    return function () { func.apply(self, arguments); };
  };
  this.sock.on('connect', bind(this._onConnect));
  this.sock.on('data', bind(this._onData));
  this.sock.on('error', bind(this._error));
  this.sock.on('close', bind(this._onClose));
};

proto._onConnect = function () {
  var self = this;
  this.on('HELLO REPLY', function (args) {
    if (args.match(/RESULT=OK/)) self.emit('handshake', true);
    else self.emit('handshake', false, args);
  });
  this.sock.write('HELLO VERSION MIN=3.0 MAX=3.0\n');
};

proto._onClose = function (had_error) {
  if (had_error) this._error(new Error('Underlying socket closed due to an error'));
  else this.end();
};

SAM.COMMAND_LINE = /^([^\n]+)\n/;
proto._onData = function (data) {
  console.log(data);
  if (this.commandBuffer) {
    data = this.commandBuffer + data;
  }
  var cmd = data.match(SAM.COMMAND_LINE);
  while (cmd) {
    this._processCommand(cmd[1]);
    data = data.substring(cmd[1].length + 1);
    cmd = data.match(SAM.COMMAND_LINE);
  }
  this.commandBuffer = data;
};

proto._processCommand = function (cmd) {
  var command = parseCommand(cmd);
  this.emit(command.cmd, command.args);
};

SAM.COMMAND_PARTS = /(\S+ \S+) (.+)/;
function parseCommand (cmd) {
  var parts = cmd.match(SAM.COMMAND_PARTS);
  if (!parts) throw new Error('Malformed SAM command: ' + cmd);
  return {
    cmd: parts[1],
    args: parts[2]
  };
}

// playing around, making sure i understand the protocol

var samSock = new SAM();

samSock.on('handshake', function (success, args) {
  if (!success) throw new Error(args);
  console.log('handshake complete');
  samSock.sock.write('SESSION CREATE STYLE=STREAM ID=test3 DESTINATION=TRANSIENT\n');
});

samSock.on('SESSION STATUS', function (args) {
  if (!args.match(/RESULT=OK/)) throw new Error('Session not created: ' + args);
  console.log('session created');
  streamingTest();
});

samSock.on('error', function (err) {
  console.log('ERROR');
  console.dir(err);
  samSock.end();
});

samSock.on('close', function () {
  console.log('socket closed');
});

samSock.connect();

var pastethis_dot_i2p = "Okd5sN9hFWx-sr0HH8EFaxkeIMi6PC5eGTcjM1KB7uQ0ffCUJ2nVKzcsKZFHQc7pLONjOs2LmG5H-2SheVH504EfLZnoB7vxoamhOMENnDABkIRGGoRisc5AcJXQ759LraLRdiGSR0WTHQ0O1TU0hAz7vAv3SOaDp9OwNDr9u902qFzzTKjUTG5vMTayjTkLo2kOwi6NVchDeEj9M7mjj5ySgySbD48QpzBgcqw1R27oIoHQmjgbtbmV2sBL-2Tpyh3lRe1Vip0-K0Sf4D-Zv78MzSh8ibdxNcZACmZiVODpgMj2ejWJHxAEz41RsfBpazPV0d38Mfg4wzaS95R5hBBo6SdAM4h5vcZ5ESRiheLxJbW0vBpLRd4mNvtKOrcEtyCvtvsP3FpA-6IKVswyZpHgr3wn6ndDHiVCiLAQZws4MsIUE1nkfxKpKtAnFZtPrrB8eh7QO9CkH2JBhj7bG0ED6mV5~X5iqi52UpsZ8gnjZTgyG5pOF8RcFrk86kHxAAAA";
var stats_dot_i2p = "Okd5sN9hFWx-sr0HH8EFaxkeIMi6PC5eGTcjM1KB7uQ0ffCUJ2nVKzcsKZFHQc7pLONjOs2LmG5H-2SheVH504EfLZnoB7vxoamhOMENnDABkIRGGoRisc5AcJXQ759LraLRdiGSR0WTHQ0O1TU0hAz7vAv3SOaDp9OwNDr9u902qFzzTKjUTG5vMTayjTkLo2kOwi6NVchDeEj9M7mjj5ySgySbD48QpzBgcqw1R27oIoHQmjgbtbmV2sBL-2Tpyh3lRe1Vip0-K0Sf4D-Zv78MzSh8ibdxNcZACmZiVODpgMj2ejWJHxAEz41RsfBpazPV0d38Mfg4wzaS95R5hBBo6SdAM4h5vcZ5ESRiheLxJbW0vBpLRd4mNvtKOrcEtyCvtvsP3FpA-6IKVswyZpHgr3wn6ndDHiVCiLAQZws4MsIUE1nkfxKpKtAnFZtPrrB8eh7QO9CkH2JBhj7bG0ED6mV5~X5iqi52UpsZ8gnjZTgyG5pOF8RcFrk86kHxAAAA";

function streamingTest () {
  var streamSock = new SAM();
  streamSock.on('handshake', function (success, args) {
    if (!success) throw new Error(args);
    console.log('second handshake complete');
    console.log('attempting to connect to stats.i2p...');
    streamSock.sock.write('STREAM CONNECT ID=test3 DESTINATION=' + stats_dot_i2p + '\n');
  });
  streamSock.on('STREAM STATUS', function (args) {
    if (!args.match(/RESULT=OK/)) {
      console.log('retrying...');
      streamSock.end();
      return streamingTest();
    }
    streamSock.sock.write('GET / HTTP/1.0\r\n\r\n');
  });
  streamSock.connect();
}

