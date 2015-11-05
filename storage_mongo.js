/**
 * Created by avi on 9/3/15.
 */
var MongoClient = require('mongodb').MongoClient;

var url = 'mongodb://127.2.4.2:27017/privacy2run';

var store = {};

/**
 * load stored auth codes
 */

store.loadCodes = function (callback) {
    connectAndLogin(findDocuments, callback);
};

store.saveCode = function(item) {
    connectAndLogin(function(collection) {
        insertDocuments(collection, item);
    }, null);
};

store.updateCode = function(item) {
    connectAndLogin(function(collection) {
        updateDocument(collection, item);
    }, null);
};

var connectAndLogin = function (action, onSuccess) {
    MongoClient.connect(url, function(err, db) {
        if (err) {
            console.log(err);
        } else {
            console.log("Connected correctly to server");
            db.authenticate('rw', '******', function (err) {
                if (err) {
                    console.log(err);
                } else {
                    var collection = db.collection('auth_users');
                    action(collection, onSuccess);
                }
            });
        }
    });
};

var findDocuments = function(collection, callback) {

    collection.find({}).toArray(function(err, docs) {
        if (err) {
            console.log(err);
        } else {
            console.log("Found the following records");
            console.dir(docs);
            callback(docs);
        }
    });
};

var insertDocuments = function(collection, item) {
    collection.insert(item, function(err, result) {
        if (err) {
            console.log("Inserted a document: " + item);
        }
    });
};

var updateDocument = function(collection, item) {
    collection.update({ id: item.id }
        , { $set: item }, function(err, result) {
            console.log("Updated the document " + item);
        });
}

module.exports = store;

