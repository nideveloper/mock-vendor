var express = require('express');
var nconf = require('nconf');
var mysql = require('mysql');
var app = express();
var verisk_response = require('./json/verisk_mock_response.json');
require("string_score");

var yearBusinessStarted;
var cache = {};

nconf.argv()
       .env()
       .file({ file: 'config.json' });

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use(express.json());       // to support JSON-encoded bodies

app.get('/', function (req, res) {
    res.send("This is a mock Verisk API");
});

app.post('/verisk/load', function (req, res) {
    var id = this.loadData(req.body);
    res.send({"status": "loaded", "id": id});
});

/**
 * Returns a bad request if an id is passed which isn't in the cache
 */
function checkCacheHit(id, res) {
    //make sure data is in cache
    if(!cache[id]){
        res.status(400);
        res.send({"error": "No record in cache, please load the data and retry"});
    }
}

app.get('/verisk/yearBusinessStarted/:id', function (req, res) {
    var recordID = req.params.id;
    console.log('loading verisk year business started for user '+recordID);
    checkCacheHit(recordID, res);
    res.send({"value": cache[recordID].yearBusinessStarted.value, "location": cache[recordID].yearBusinessStarted.path, "vendor": "verisk"});
});

app.get('/verisk/latitude/:id', function (req, res) {
    var recordID = req.params.id;
    console.log('loading latitude for user '+recordID);
    checkCacheHit(recordID, res);
    res.send({"value": cache[recordID].latitude.value, "location": cache[recordID].latitude.path, "vendor": "verisk"});
});

app.get('/verisk/longitude/:id', function (req, res) {
    var recordID = req.params.id;
    console.log('loading longitude for user '+recordID);
    checkCacheHit(recordID, res);
    res.send({"value": cache[recordID].longitude.value, "location":  cache[recordID].longitude.path, "vendor": "verisk"});
});

app.get('/verisk/numEmployees/:id', function (req, res) {
    var recordID = req.params.id;
    console.log('loading longitude for user '+recordID);
    checkCacheHit(recordID, res);
    res.send({"value": cache[recordID].numEmployees.value, "location": cache[recordID].numEmployees.path, "vendor": "verisk"});
});

initializeNullData = function() {
    let responseObject = {};
    responseObject.yearBusinessStarted = {"value":null, "path": null};
    responseObject.latitude = {"value":null, "path": null};
    responseObject.longitude = {"value":null, "path": null};
    responseObject.numEmployees = {"value":null, "path": null};

    return responseObject;
}

hashCode = function(s){
  return s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0);              
}

extractDataToDomainObject = function(bestMatch) {
    var domainObject = {};

    domainObject.yearBusinessStarted = {    "path": "$["+bestMatch.index+"]/pdr/businessDetails/yearBusinessStarted", 
                                            "value": bestMatch.report.businessDetails.yearBusinessStarted};

    domainObject.latitude =            {    "path":"$["+bestMatch.index+"]/pdr/address/geoData/latitude",
                                            "value": bestMatch.report.address.geoData.latitude};

    domainObject.longitude =           {    "path": "$["+bestMatch.index+"]/pdr/address/geoData/longitude",
                                            "value":bestMatch.report.address.geoData.longitude};

    domainObject.numEmployees =        {    "path": "$["+bestMatch.index+"]/pdr/businessDetails/numEmployees",
                                            "value": bestMatch.report.businessDetails.numEmployees};

    return domainObject;
}

findBestMatchingReport = function(verisk_response, requestedBusiness) {
    var bestMatch = {report:{}, score: 0, index:0};

    for(var index in verisk_response) {
        var business = verisk_response[index];
        if(null != business.pdr){
            var pdrScore = requestedBusiness.address1.score(business.pdr.address.address1);
            console.log("score is "+pdrScore + " for address "+requestedBusiness.address1+ " compared to " + business.pdr.address.address1);

            if(pdrScore > bestMatch.score) {
                bestMatch.report = business.pdr;
                bestMatch.score = pdrScore;
                bestMatch.index = index;
            }
        }
    }

    return bestMatch;
}

loadData = function(requestedBusiness) {

    var cacheID = hashCode(JSON.stringify(requestedBusiness));

    //If it is already in the cache don't reload
    if(typeof cache[cacheID] != "undefined"){
        console.log("data already in cache");
        return cacheID;
    }

    cache[cacheID] = initializeNullData();

    console.log("created new cache entry id - "+ cacheID);

    var bestMatchingReport = findBestMatchingReport(verisk_response, requestedBusiness);

    console.log("DATS chose "+ JSON.stringify(bestMatchingReport.report) +" with a highest match score of "+bestMatchingReport.score+" from verisk full response " + JSON.stringify(verisk_response) );

    if(bestMatchingReport.score > 0) {
        cache[cacheID] = extractDataToDomainObject(bestMatchingReport);
    }

    return cacheID;
}

var server = app.listen(process.env.PORT || 5000, function () {
  var host = server.address().address;
  var port = server.address().port;

  console.log('Proxy listening at http://%s:%s', host, port);
});