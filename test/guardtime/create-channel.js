/*jslint node: true */
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var fs = require('fs');
var util = require('util');

var config = require('./config.json');
var helper = require('./helper.js');

logger.setLevel('DEBUG');

var client;
var chain;
var user;
var peers;
var orderer;
var cleanup;

if (!process.env.GOPATH){
	process.env.GOPATH = config.goPath;
}

logger.debug("GETTING STARTED");

return helper.init(false).then( function(args) {
	client = args.client;
	chain = args.chain;
	user = args.user;
	peers = args.peers;
	orderer = args.orderer;
	cleanup = args.cleanup;
	logger.debug('Reading the channel file.');
	logger.debug('channelFile '+config.channelFile);
	return helper.readFile(config.channelFile);
}).then( function(data){
	
	logger.debug('Successfully read the channel file.');
	var request = {
		envelope : data,
		name : config.chainName,
		orderer : orderer
	};
	// send to orderer
	logger.debug('Creating the channel.');
	return client.createChannel(request);

}).then( function(chainResult) {
	chain = chainResult;
	if(chain){
		var testOrderers = chain.getOrderers();
		if( testOrderers ) {
			var testOrderer = testOrderers[0];
			if( testOrderer === orderer ){
				logger.info('Successfully created the channel "'+config.chainName+'".');
			}else{
				throw new Error('Chain did not have the orderer.');
			}
		}
	}
}).catch( function(err) {
	logger.error(err.stack ? err.stack : err);
}).then( function(){
	cleanup();
} );



