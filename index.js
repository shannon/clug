'use strict';
 
var cluster         = require('cluster')
  , winston         = require('winston')
  , net             = require('net')
  , crypto          = require('crypto')
  , Path            = require('path')
  , debug           = process.execArgv.join(' ').indexOf('--debug') !== -1
;
 
function Clug(config){
  var self = this;
  this.config = config;
 
  if (cluster.isMaster && !debug) {
    cluster.setupMaster({ silent: true });
     
    cluster.on('fork', function(worker){
      worker.on('message', function(msg){
        if(worker.logger && msg.console){
          var isLevel = ['debug', 'info', 'warn', 'error', 'notice'].indexOf(msg.args[0]) !== -1;
          msg.args.splice(isLevel ? 1 : 0, 0, 'worker ' + msg.worker + ':');
          
          if(msg.console === 'log' && !isLevel){
            worker.logger.debug.apply(worker.logger, msg.args);
          } else {
            worker.logger[msg.console].apply(worker.logger, msg.args);
          }
        }
      });
    });
 
    cluster.on('exit', function(worker, code, signal) {
      logger.debug('Worker ' + worker.id + ' died');
    });
 
    var forks = [];
    for(var w in config){
      forks.push(this.fork(w));
    }
 
    process.on('SIGTERM', function () {
      console.log('Gracefully shutting down');
      setTimeout(function check(){
        if(forks.some(function(workers){ return workers.length; })){
          setTimeout(check, 100);
        } else {
          process.exit(0);
        }
      }, 100);
    });
 
  } else {
 
    if(!cluster.isMaster){
      ['log', 'info', 'warn', 'error'].forEach(function(method){
        var original = console[method];
        console[method] = function(){
          original.apply(console, arguments);
          process.send({ console: method, args: [].slice.call(arguments), worker: cluster.worker.id });
        };
      });
    }
 
    if(process.env.CLUSTER_WORKER){
      require(Path.resolve(process.env.CLUSTER_WORKER));
    } else {
      for(var w in config){
        require(Path.resolve(w));
      }
    }
  }
}
 
Clug.prototype.fork = function(name){
  var self    = this;
  var config  = this.config[name];
  var workers = [];
  var logger;
  
  
  if(config.logLevel){
    logger = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)({ level: config.logLevel, timestamp: true, colorize: true }),
        new winston.transports.File({ filename: Path.join((config.logPath || __dirname), 'clug-' + config.logLevel + '.log'), level: config.logLevel, maxsize: 102400 })
      ],
      exceptionHandlers: [
        new (winston.transports.Console)({ timestamp: true, colorize: true }),
        new winston.transports.File({ filename: Path.join((config.logPath || __dirname), 'clug-exception.log'), maxsize: 102400 })
      ]
    });
  }
  
  if(config.sticky){
    config.sticky = [].concat(config.sticky); //ensure array format even for single number
    
    config.sticky.forEach(function(port){
      net.createServer(function(connection) {
         
        connection._handle.readStop(); //see https://github.com/elad/node-cluster-socket.io/issues/4
        var hash   = self.hashIp(connection.remoteAddress);
        var worker = workers[hash % workers.length];

        worker.send('sticky-session:connection', connection);
      }).listen(port, function(){
        if(logger){
          logger.debug('Master:', 'Server listening on port', port);
        }
      });
    });
  }
 
  function fork(){
    var _worker = workers[workers.length] = cluster.fork({ CLUSTER_WORKER: name }); 
    _worker.logger = logger;
    
    cluster.on('exit', function(worker, code, signal) {
      if(worker === _worker && signal !== 'SIGTERM'){
        if(signal === 'SIGTERM'){
          workers.splice(workers.indexOf(_worker), 1);
        } else {
          _worker = workers[workers.indexOf(_worker)] = cluster.fork({ CLUSTER_WORKER: name });
          _worker.logger = logger;
        }
      }
    });
  }
 
  for(var n = 0; n < config.num; n++){
    fork();
  }
  
  return workers;
}

Clug.prototype.hashIp = function(address) {
  return parseInt(crypto.createHash('md5').update(address, 'ascii').digest('hex').substr(-4), 16);
}

module.exports = Clug;