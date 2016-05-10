var Promise = require('bluebird');
var _ = require('lodash');
var net = require('net');

exports.retry = function(operation, delay, options) {
  options || (options = {});
  !_.isFunction(options.if) && (options.if = function() { return true; });

  return operation()
    .catch(function(reason) {
      if (options.if(reason)) {
        return Promise
          .delay(delay)
          .then(exports.retry.bind(null, operation, delay * 2, options));
      } else {
        return Promise.reject(reason);
      }
    })
};

exports.dispatch = function(babl) {
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

    socket.on('close', babl.process.kill.bind(babl.process));
  });
};
