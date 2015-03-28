'use strict';
 
var Cluster         = require('cluster')
  , OS               = require('os')
  , Winston         = require('winston')
  , Net             = require('net')
  , Crypto          = require('crypto')
  , Path            = require('path')
  , debug           = process.execArgv.join(' ').indexOf('--debug') !== -1
;

function _hashIp(ip) {
  return parseInt(Crypto.createHash('md5').update(ip, 'ascii').digest('hex').substr(-4), 16);
}

function _fork(path, workers){
  var _worker = workers[workers.length] = Cluster.fork({ CLUG_PATH: path }); 

  Cluster.on('exit', function(worker, code, signal) {
    if(worker === _worker && signal !== 'SIGTERM'){
      if(signal === 'SIGTERM'){
        workers.splice(workers.indexOf(_worker), 1);
      } else {
        _worker = workers[workers.indexOf(_worker)] = Cluster.fork({ CLUG_PATH: path });
      }
    }
  });
}

function _stringifyStickyOpts(opts){
  if(typeof opts === 'object'){
    return opts.socket || ((opts.host || '') + ':' + opts.port);
  } else {
    return opts.toString();
  }
}

function Clug(path, opts){
  var self      = this;
  var workers   = [];
  var logger;
  
  if(process.env.CLUG_PATH && process.env.CLUG_PATH !== path){
    return null;
  }
  
  //default options
  opts.logLevel   = opts.logLevel  || 'debug';
  opts.logPath    = opts.logPath   || __dirname;
  opts.workers    = opts.workers   || (Math.max(OS.cpus().length, 2)); 
  opts.sticky     = [].concat(opts.sticky || []); //ensure array format even for single value
 
  if (Cluster.isMaster && !debug) { //===== Master code ====================================
    
    logger = new (Winston.Logger)({
      transports: [
        new (Winston.transports.Console)({ level: opts.logLevel, timestamp: true, colorize: true }),
        new Winston.transports.File({ 
          filename: Path.join(opts.logPath, 'clug-' + opts.logLevel + '.log'), 
          level: opts.logLevel, 
          maxsize: 102400 
        })
      ],
      exceptionHandlers: [
        new (Winston.transports.Console)({ timestamp: true, colorize: true }),
        new Winston.transports.File({ filename: Path.join(opts.logPath, 'clug-exception.log'), maxsize: 102400 })
      ]
    });
    
    Cluster.setupMaster({ silent: true });
    
    Cluster.on('fork', function(worker){
      worker.on('message', function(msg){
        if(msg.console){
          var isLevel = ['debug', 'info', 'warn', 'error', 'notice'].indexOf(msg.args[0]) !== -1;
          msg.args.splice(isLevel ? 1 : 0, 0, 'worker ' + msg.worker + ':');
          
          if(msg.console === 'log' && !isLevel){
            logger.debug.apply(logger, msg.args);
          } else {
            logger[msg.console].apply(logger, msg.args);
          }
        }
      });
    });
 
    Cluster.on('exit', function(worker, code, signal) {
      logger.debug('Worker ' + worker.id + ' died');
    });
    
    opts.sticky.forEach(function(stickyOpts){
      Net.createServer(function(connection) {
        connection._handle.readStop(); //see https://github.com/elad/node-cluster-socket.io/issues/4
        var hash   = _hashIp(connection.remoteAddress);
        var worker = workers[hash % workers.length];
        var conn   = _stringifyStickyOpts(stickyOpts);
        
        worker.send('sticky-connection:' + conn, connection);
      }).listen(stickyOpts, function(){
        if(logger){
          logger.debug('Master:', 'Server listening on', stickyOpts);
        }
      });
    });
 
    process.on('SIGTERM', function () {
      console.log('Gracefully shutting down');
      setTimeout(function check(){
        if(workers.length){
          setTimeout(check, 100);
        } else {
          process.exit(0);
        }
      }, 100);
    });
    
    for(var n = 0; n < opts.workers; n++){
      _fork(path, workers);
    }
  } else { //===== Worker code ====================================
    
    if(!Cluster.isMaster){
      // wrap console code
      ['log', 'info', 'warn', 'error'].forEach(function(method){
        var original = console[method];
        console[method] = function(){
          original.apply(console, arguments);
          process.send({ console: method, args: [].slice.call(arguments), worker: Cluster.worker.id });
        };
      });
      
      // wrap net listen code
      var _listen = Net.Server.prototype.listen;
      Net.Server.prototype.listen = function(){
        var self = this;
        var conn = _stringifyStickyOpts(arguments[0]);
        
        var isSticky = opts.sticky.some(function(stickyOpts){
          return conn === _stringifyStickyOpts(stickyOpts);
        });
        
        if(isSticky){
          process.on('message', function(message, connection) {
            if (message !== 'sticky-connection:' + conn) {
              return;
            }
            self.emit('connection', connection);
          });
        } else {
          _listen.apply(this, arguments);
        }
        return this;
      }
    }
    
    return require(Path.resolve(path));
  }
}

Clug.cluster  = Cluster;
Clug.os       = OS;

module.exports = Clug;