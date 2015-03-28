'use strict';
 
var Clug = require('../')
  , config  = require('./config')
;

var server = Clug('./server', {
  logLevel: config.server.logLevel,
  logPath: config.server.logPath,
  sticky: config.server.connection,
});