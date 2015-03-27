'use strict';

var http   = require('http')
  , cluster = require('cluster')
  , config = require('./config')
;

var server = http.createServer(function(req, res) {
  console.log('Request', new Date());
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

if(cluster.isMaster){
  server.listen(config.server.port, function(){
    console.info('Server listening on port', config.server.port);
  });
} else {
  process.on('message', function(message, connection) {
    if (message !== 'sticky-session:connection') {
      return;
    }
    server.emit('connection', connection);
  });
}

