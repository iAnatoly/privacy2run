#!/bin/env node
//  OpenShift sample Node application
var express = require('express');
var fs      = require('fs');
var url     = require('url');
var strava  = require('./strava_helper.js');
var storage = require('./storage_mongo.js');


/**
 *  Define the sample application.
 */
var SampleApp = function() {

    //  Scope.
    var self = this;


    /*  ================================================================  */
    /*  Helper functions.                                                 */
    /*  ================================================================  */

    /**
     *  Set up server IP address and port # using env variables/defaults.
     */
    self.setupVariables = function() {
        //  Set the environment variables we need.
        self.ipaddress = process.env.OPENSHIFT_NODEJS_IP || "127.0.0.1";
        self.port      = process.env.OPENSHIFT_NODEJS_PORT || 8080;
        self.start_time = Date.now();
        self.authCodes = {};
    };

    /**
     * return the server uptime in seconds
     */
    self.uptime = function () {
        return (Date.now() - self.start_time) / 1000;
    };


    /**
     *  Populate the cache.
     */
    self.populateCache = function() {
        if (typeof self.zcache === "undefined") {
            self.zcache = { 'index.html': '' };
        }

        //  Local cache for static content.
        self.zcache['index.html'] = fs.readFileSync('./index.html');
    };


    /**
     *  Retrieve entry (content) from cache.
     *  @param {string} key  Key identifying content to retrieve from cache.
     */
    self.cache_get = function(key) { return self.zcache[key]; };


    /**
     *  terminator === the termination handler
     *  Terminate server on receipt of the specified signal.
     *  @param {string} sig  Signal to terminate on.
     */
    self.terminator = function(sig){
        if (typeof sig === "string") {
           console.log('%s: Received %s - terminating ...', Date(Date.now()), sig);
           process.exit(1);
        }
        console.log('%s: Node server stopped.', Date(Date.now()) );
    };


    /**
     *  Setup termination handlers (for exit and a list of signals).
     */
    self.setupTerminationHandlers = function(){
        //  Process on exit and signals.
        process.on('exit', function() { self.terminator(); });

        // Removed 'SIGPIPE' from the list - bugz 852598.
        ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGILL', 'SIGTRAP', 'SIGABRT',
         'SIGBUS', 'SIGFPE', 'SIGUSR1', 'SIGSEGV', 'SIGUSR2', 'SIGTERM'
        ].forEach(function(element, index, array) {
            process.on(element, function() { self.terminator(element); });
        });
    };


    /*  ================================================================  */
    /*  App server functions (main app logic here).                       */
    /*  ================================================================  */

    /**
     *  Create the routing table entries + handlers for the application.
     */
    self.createRoutes = function() {
        self.routes = { };

        self.routes['/'] = function(req, res) {
            res.setHeader('Content-Type', 'text/html');
            res.send(self.cache_get('index.html') );
        };

        self.routes['/debug-oauth'] = function(req, res) {
            // TODO: remove (debug only)
            for (var id in self.authCodes) {
                var code = self.authCodes[id];
                res.write(code.token.substring(0,3) + ':' + code.name.substring(0,3) + '->' + code.valid);
            }
            res.send();
        };

        self.routes['/athletes/:id'] = function(req, res) {
            if (req.params.id in self.authCodes) {
                strava.getActivities(self.authCodes[req.params.id].token, function (activities) {
                    activities.forEach(function(activity) {

                        res.write(activity.type + ',' + activity.distance + ',' + activity.average_speed + ',' + activity.average_heartrate + ','+activity.max_heartrate+'\n');
                    });
                    res.send();
                }, function (err) {
                    res.send(err);
                });
            } else {
                res.send("invalid id");
            }

        };
        self.routes['/oauth'] = function(req, res) {
            // TODO: handle state
            var queryData = url.parse(req.url, true).query;
            if (queryData.code) {
                strava.getWriteToken(queryData.code, function(err, token) {
                    if (!err) {
                        if (token.id in self.authCodes) {
                            storage.updateCode(token);
                        } else {
                            storage.saveCode(token);
                        }
                        self.authCodes[token.id] = token;
                        self.LoadDataAndStartBackgroundThread();
                        res.send('Received OAUTH code: ' + queryData.code);
                    } else
                    {
                        res.send('Cannot get token: '+err);
                    }
                });
            } else {
                res.redirect(302, strava.authenticate());
            }
        };

        self.routes['/uptime'] = function(req, res) {
            res.send('Success\nUptime: '+self.uptime());
        };
    };




    /**
     *  Initialize the server (express) and create the routes and register
     *  the handlers.
     */
    self.initializeServer = function() {
        self.createRoutes();
        self.app = express();

        //  Add handlers for the app (from the routes).
        for (var r in self.routes) {
            self.app.get(r, self.routes[r]);
        }
    };

    self.initializeBackgroundProcessing  = function(frequency) {
        console.info('Setting up scheduler with frequency of '+ frequency);
        self.background = setInterval(function () {
            for (var id in self.authCodes) {
                var token = self.authCodes[id];
                console.log(token);
                if (token.valid) {
                    strava.processUser(token.token, function() {
                        console.warn('Invalidating authcode '+token.token);
                        self.authCodes[id].valid = false;
                    });
                }
            }
        }, 10000 * frequency);
    };

    /**
     * Initialize the background processing
     */
    self.LoadDataAndStartBackgroundThread = function() {
        if (self.background) {
            clearInterval(self.background);
        }

        var frequency = Object.keys(self.authCodes).length;
        if (frequency == 0) {
            storage.loadCodes(function(docs) {
                docs.forEach(function(item) {
                    self.authCodes[item.id] = item;
                });
                console.log(self.authCodes);
                frequency = Object.keys(self.authCodes).length;

                if (frequency == 0) {
                    console.warn('Frequency is zero, nothing to process');
                } else {
                    self.initializeBackgroundProcessing(frequency);
                }
            });
        } else {
            self.initializeBackgroundProcessing(frequency);
        }
    };


    /**
     *  Initializes the sample application.
     */
    self.initialize = function() {
        console.log('DEBUG: in initialize')
        self.setupVariables();
        self.populateCache();
        self.setupTerminationHandlers();
        self.LoadDataAndStartBackgroundThread();

        // Create the express server and routes.
        self.initializeServer();
    };


    /**
     *  Start the server
     */
    self.start = function() {
        console.log('DEBUG: in start')
        //  Start the app on the specific interface (and port).
        self.app.listen(self.port, self.ipaddress, function() {
            console.log('%s: Node server started on %s:%d ...', Date(Date.now() ), self.ipaddress, self.port);
        });
    };

};   /*  Sample Application.  */



/**
 *  main():  Main code.
 */
var zapp = new SampleApp();
zapp.initialize();
zapp.start();

