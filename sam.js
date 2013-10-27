var net = require('net');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

// building the Node.js `net` interface over SAM
// http://nodejs.org/api/net.html
// http://www.i2p2.de/samv3.html

// creates a socket connection to the SAM bridge and performs
// the handshake.
//
// parses commands sent by the bridge and emits the commands as
// events (such as "HELLO REPLY" or "SESSION STATUS").
//
// if this.processCommands = false, will stop processing commands
// and instead forward the data via `data` events.
var BasicSocket = module.exports.BasicSocket = function () {
  EventEmitter.call(this);
  this.sock = null;
  this.commandBuffer = '';
  this.processCommands = true;
};

util.inherits(BasicSocket, EventEmitter);
var proto = BasicSocket.prototype;

var SAM = {};
SAM.DEFAULT_PORT = 7656;
SAM.DEFAULT_HOST = 'localhost';

proto._init = function (port, host) {
  port = port || SAM.DEFAULT_PORT;
  host = host || SAM.DEFAULT_HOST;
  this.sock = net.connect(port, host);
  this.sock.setEncoding('ASCII');
  this._setupListeners();
};

proto.write = function (data, encoding, callback) {
  this.sock.write(data, encoding, callback);
};

proto.end = function (data, encoding) {
  if (this.sock) {
    this.sock.end(data, encoding);
    this.sock = null;
    this.emit('close');
  }
};

proto.destroy = function () {
  this.sock.destroy();
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
  this.sock.on('end', bind(this._onEnd));
  this.sock.on('close', bind(this._onClose));
};

proto._onConnect = function () {
  var self = this;
  this.on('HELLO REPLY', function (args) {
    if (args.match(/RESULT=OK/)) self.emit('handshake', true);
    else self.emit('handshake', false, args);
  });
  this.write('HELLO VERSION MIN=3.0 MAX=3.0\n');
};

SAM.COMMAND_LINE = /^([^\n]+)\n/;
proto._onData = function (data) {
  if (!this.processCommands) {
    return this.emit('data', data);
  }
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

proto._onEnd = function () {
  this.emit('end');
  this.end();
};

proto._onClose = function (had_error) {
  if (had_error) this._error(new Error('Underlying socket closed due to an error'));
  else this.end();
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


var StreamSocket = function () {
  BasicSocket.call(this);
  var self = this;
  this.on('handshake', function (success, err) {
    if (!success) {
      return self._error('Handshake error! ' + err);
    }
    self.handshake = true;
    self._connectIfReady();
  });
};

util.inherits(StreamSocket, BasicSocket);
proto = StreamSocket.prototype;

proto.connect = function (destination, sessionId, connectionListener) {
  this._init();
  this.destination = destination;
  this.sessionId = sessionId;
  if (connectionListener) {
    this.on('connect', connectionListener);
  }
  this._connectIfReady();
};

proto.setEncoding = function (encoding) {
  this.encoding = encoding;
  if (!this.processCommands) {
    this.sock.setEncoding(encoding);
  }
};

proto._connectIfReady = function () {
  if (this.handshake && this.destination && this.sessionId) {
    this.write('STREAM CONNECT ID=' + this.sessionId + ' DESTINATION=' + this.destination + '\n');
    var self = this;
    this.on('STREAM STATUS', function (args) {
      if (!args.match(/RESULT=OK/)) {
        return self._error('Stream status error! ' + args);
      }
      if (self.encoding) {
        self.sock.setEncoding(self.encoding);
      }
      self.processCommands = false;
      self.emit('connect');
    });
  }
};





// create a session id with a BasicSocket
var master = new BasicSocket();

master.on('handshake', function (success, args) {
  if (!success) throw new Error(args);
  console.log('handshake complete');
  console.log('creating session');
  master.write('SESSION CREATE STYLE=STREAM ID=testing123 DESTINATION=TRANSIENT\n');
});

master.on('SESSION STATUS', function (args) {
  if (!args.match(/RESULT=OK/)) throw new Error('Session not created: ' + args);
  console.log('session created');
  streamingTest();
});

master.on('error', function (err) {
  console.log('ERROR');
  console.dir(err);
  master.end();
});

master.on('close', function () {
  console.log('master socket closed');
});

master._init();


// create a streaming socket and request stats.i2p
var stats_dot_i2p = "Okd5sN9hFWx-sr0HH8EFaxkeIMi6PC5eGTcjM1KB7uQ0ffCUJ2nVKzcsKZFHQc7pLONjOs2LmG5H-2SheVH504EfLZnoB7vxoamhOMENnDABkIRGGoRisc5AcJXQ759LraLRdiGSR0WTHQ0O1TU0hAz7vAv3SOaDp9OwNDr9u902qFzzTKjUTG5vMTayjTkLo2kOwi6NVchDeEj9M7mjj5ySgySbD48QpzBgcqw1R27oIoHQmjgbtbmV2sBL-2Tpyh3lRe1Vip0-K0Sf4D-Zv78MzSh8ibdxNcZACmZiVODpgMj2ejWJHxAEz41RsfBpazPV0d38Mfg4wzaS95R5hBBo6SdAM4h5vcZ5ESRiheLxJbW0vBpLRd4mNvtKOrcEtyCvtvsP3FpA-6IKVswyZpHgr3wn6ndDHiVCiLAQZws4MsIUE1nkfxKpKtAnFZtPrrB8eh7QO9CkH2JBhj7bG0ED6mV5~X5iqi52UpsZ8gnjZTgyG5pOF8RcFrk86kHxAAAA";

function streamingTest () {
  var sock = new StreamSocket();
  sock.setEncoding('utf8');

  sock.on('connect', function () {
    console.log('connected to stats.i2p');
  });

  sock.on('error', function (err) {
    console.error('streaming socket error! ' + err);
    master.end();
  });

  sock.on('close', function () {
    console.log('streaming socket closed');
    master.end();
  });

  sock.on('data', function (data) {
    console.log(data);
  });

  sock.connect(stats_dot_i2p, 'testing123', function () {
    sock.write('GET / HTTP/1.0\r\n\r\n');
  });
}

