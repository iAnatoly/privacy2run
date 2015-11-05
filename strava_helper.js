/**
 * Created by avi on 8/31/15.
 */
var strava = require('strava-v3');


/**
 * gets OAUTH code from Strava
 */

exports.authenticate = function () {
    var authURL = strava.oauth.getRequestAccessURL({scope: "write"});
    console.log(authURL);
    return authURL;
};

/**
 *
 * Log into strava with auth cookie and processes teh activity
 *
 * @param w_token
 *      bearer token
 */

exports.processUser = function (w_token, onerror) {
    var yesterday = Date.now() / 1000 - 86400;
    var params = {'access_token':w_token, 'after': yesterday };

    strava.athlete.listActivities(params, function(err,payload) {
        if (err) {
            console.log(err);
            onerror(err);
        } else {
            for (var id in payload) {
                processActivity(payload[id], w_token);
            }
        }
    });
};

/**
 * Retrieves a bearer token with write scope, based on temp auth code
 *
 * @param code
 *      OAUTH temp code
 *
 */

exports.getWriteToken = function(code, callback) {
    var response = null;
    strava.oauth.getToken(code,function(err,payload) {
        if (err) {
            console.log(err);
            callback(err, null);
        } else {
            callback(null,{
                'token': payload.access_token,
                'id': payload.athlete.id,
                'name': payload.athlete.email,
                'valid': true
            });
        }
    });
    return response;
};

/**
 *
 * Log into strava with auth cookie and list all activities for the athlete
 *
 * @param w_token
 *      bearer token
 */

exports.getActivities = function (w_token, onsucces, onerror) {
    var params = {'access_token':w_token };

    strava.athlete.listActivities(params, function(err,payload) {
        if (err) {
            console.log(err);
            onerror(err);
        } else {
            onsucces(payload);
        }
    });
};

function isWorkout(activity) {
    return activity.type == 'Workout' && !activity.private;
}

function isInsignificant(activity) {
    return (activity.type == 'Run' && activity.distance <100.0) ||
        (activity.type == 'Ride' && activity.distance<100.0);
}

function processActivity(activity, w_token) {
    if (isWorkout(activity) || isInsignificant(activity)) {
        console.log('DEBUG: processing activity '+activity.name);

        var params = {
            'access_token': w_token,
            'id': activity.id
            ,'private': true,
            'name': '! ' + activity.name
        };
        strava.activities.delete(params, function (err, payload) {
            if (!err) {
                console.log(payload);
                console.log('INFO: processed activity: ' + activity.name + '\n');
            }
            else {
                console.log(err);
            }
        });
    }
}
