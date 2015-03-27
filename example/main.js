'use strict';
 
var Clug = require('../')
  , os      = require('os')
  , config  = require('./config')
;
 
new Clug({
  'server': {
    logPath: config.server.logPath,
    logLevel: config.server.logLevel,
    num: Math.max(os.cpus().length,3),
    sticky: config.server.port
  }
});