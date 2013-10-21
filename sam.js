var net = require('net');
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var SAM = module.exports = function () {
  EventEmitter.call(this);
  this.sock = null;
  this.connectCallback = null;
  this.handshakeComplete = false;
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
  if (this.sock) this.sock.end(data, encoding);
  this.emit('close');
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
  this.sock = null;
  if (had_error) this._error(new Error('Underlying socket closed due to an error'));
  else this.end();;
};

SAM.COMMAND_LINE = /^([^\n]+)\n/;
proto._onData = function (data) {
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

var samSock = new SAM();

samSock.on('handshake', function (success, args) {
  if (!success) throw new Error(args);
  console.log('handshake complete');
  samSock.sock.write('SESSION CREATE STYLE=STREAM ID=test2 DESTINATION=TRANSIENT\n');
});

samSock.on('SESSION STATUS', function (args) {
  if (!args.match(/RESULT=OK/)) throw new Error('Session not created: ' + args);
  console.log('session created');
});

samSock.connect();

