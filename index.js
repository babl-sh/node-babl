var _ = require('lodash');
var crypto = require('crypto');
var net = require('net');
var path = require('path');
var Promise = require('bluebird');
var spawn = require('child_process').spawn;
var stat = Promise.promisify(require('fs').stat);
var utils = require('./utils');
var request = require('request');


module.exports = (function() {
  function Babl(name, params) {
    params || (params = {});
    this.name = name;
    this.stdin = params.stdin;
    this.env = params.env;
    this.seed = crypto.randomBytes(16).toString('hex');
    this.endpoint = params.endpoint;

    process.env.QUARTZ_SOCKET = '/tmp/quartz_' + this.seed + '.sock';
    this.process = spawn(Babl.binPath(), this.binParams());
  };

  Babl.module = function(name, params) {
    return new Babl(name, params)
      .call()
      .then(Babl.fetchPayload)
      .then(JSON.stringify)
      .then(Buffer.from);
  };

  Babl.call = function(name, params) {
    return new Babl(name, params).call();
  };

  Babl.fetchPayload = function(buffer) {
    return new Promise(function(resolve, reject) {
      var obj = JSON.parse(buffer);
      var result = obj.result;

      if (result.PayloadUrl) {
        request({
          url: result.PayloadUrl,
          method: 'get',
        }, function(error, response, body) {
          if (error) {
            reject(error);
          } else {
            result.Stdout = Buffer.from(body).toString('base64');
            resolve(obj);
          }
        })
      } else {
        resolve(obj);
      }
    });
  };

  Babl.binPath = function() {
    var platform = (process.platform.match(/(darwin|linux)/) || []).pop();
    var filename = 'babl-rpc_' + platform + '_amd64';

    return path.resolve(__dirname, './bin/' + filename);
  };

  Babl.prototype.call = function() {
    var self = this;

    return new Promise(function(resolve, reject) {
      utils
        .retry(function() {
          return stat(process.env.QUARTZ_SOCKET);
        }, 1, {
          if: function(reason) { return reason.code === 'ENOENT'; }
        })
        .timeout(10000)
        .then(function() { return self; })
        .then(utils.dispatch)
        .then(resolve)
        .catch(reject);
    });
  };

  Babl.prototype.binParams = function() {
    var result = [];
    if (this.endpoint) {
      result.push('-endpoint', this.endpoint);
    }
    return result;
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

  return Babl;
})();
