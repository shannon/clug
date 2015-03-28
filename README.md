# clug
NodeJs Cluster management and logging tool

### What does this tool do?

* Simplifies cluster/worker setup
* Automatically revives dead workers
* Supports worker connection affinity (sticky sessions)
* Collects all worker logs in one place
* Automatically formats logs and writes them to a file
* Falls back to single process for debugging

### Usage

#### Basic

```
var Clug = require('clug');

Clug('./my-script', {
  logPath: '/var/logs/my-script'
});
```

This will automatically create workers that run ```my-script.js```. By Default it will create as many workers as there are cores on the sytem with a minimum of two (for resiliency).

#### Sticky sessions

master.js
```
var Clug = require('clug');

Clug('./my-script', {
  logPath: '/var/logs/my-script',
  sticky: 8001
});
```

This will automatically route requests to port 8001 to the same worker for every request from the same remote address. Clug automatically handles the intricacies of address sharing for workers so you can code your worker as if it was a master.

For Example:

worker.js
```
var http = require('http');

server.listen(8001, function(){
  console.info('Server listening on', 8001);
});
```

This worker listens on the same address as the master so it will be handled by clug.

### API

#### Clug(path:String, [opts:Object])
* path - path to script, used just like require
* opts - { logLevel:String, logPath:String, workers:Number, sticky:String|Number|Object}
  * logLevel - winston logger log level
  * logPath - directory to put logs into
  * workers - number of workers to create
  * sticky - address or addresses to setup sticky sessions for
    * may be port or socket path
    * may be object {host, port, path} (node v0.12+)
