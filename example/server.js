'use strict';

var http   = require('http')
  , config = require('./config')
;

var server = http.createServer(function(req, res) {
  console.log('Request', new Date());
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('okay');
});

server.listen(config.server.connection, function(){
  console.info('Server listening on', config.server.connection);
});