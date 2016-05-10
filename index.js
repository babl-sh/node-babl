var _ = require('lodash');
var crypto = require('crypto');
var net = require('net');
var path = require('path');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var stat = Promise.promisify(require('fs').stat);


module.exports = (function() {
  function Babl(name, params) {
    params || (params = {});
    this.name = name;
    this.stdin = params.stdin;
    this.env = params.env;
    this.seed = crypto.randomBytes(16).toString('hex');

    process.env.QUARTZ_SOCKET = '/tmp/quartz_' + this.seed + '.sock';
    this.process = spawn(Babl.binPath());
  };

  Babl.module = function(name, params) {
    return new Babl(name, params).call();
  };

  Babl.binPath = function() {
    var platform = (process.platform.match(/(darwin|linux)/) || []).pop();
    var filename = 'babl-rpc_' + platform + '_amd64';
    return path.resolve(__dirname, './bin/' + filename);
  };

  Babl.prototype.call = function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      waitForSocket
        .call(self)
        .then(sendPayload)
        .then(resolve)
        .catch(reject);
    });
  };

  Babl.prototype.payload = function() {
    var params = this.params();
    params.Stdin === null && delete params.Stdin;
    params.Env === null && delete params.Env;

    return {
      method: 'babl.Module',
      params: [params],
      id: 1,
    };
  };

  Babl.prototype.toJSON = function() {
    return JSON.stringify(this.payload());
  };

  Babl.prototype.params = function() {
    return {
      Name: this.name,
      Stdin: new Buffer(this.stdin ? this.stdin : '').toString('base64') || null,
      Env: (!_.isEmpty(this.env) && this.env) || null,
    }
  };

  // private

  function waitForSocket() {
    var self = this;
    var retries = 0;
    var maxRetries = 10;
    var delay = 1;

    function retry(resolve, reject, lastError) {
      if (lastError.code === 'ENOENT' && ++retries <= maxRetries) {
        setTimeout(wait, delay * Math.pow(2, retries), resolve, reject);
      } else {
        reject(lastError);
      }
    }

    function wait(resolve, reject) {
      stat(process.env.QUARTZ_SOCKET)
        .then(function() {
          resolve(self);
        })
        .catch(function(error) {
          retry(resolve, reject, error);
        });
    }

    return new Promise(wait);
  };

  function sendPayload(babl) {
    var response = new Buffer('');

    return new Promise(function(resolve, reject) {
      var socket = net.connect({ path: process.env.QUARTZ_SOCKET }, function() {
        socket.write(babl.toJSON());
      });

      socket.on('data', function(data) {
        response = Buffer.concat([response, data]);
        data.slice(-1).toString() === '\n' && socket.end();
      });

      socket.on('end', function() {
        resolve(response);
      });

      socket.on('error', reject);

      socket.on('close', process.exit.bind(process));
    });
  }

  return Babl;
})();
