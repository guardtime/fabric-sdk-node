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

return helper.init().then( function(args) {
	client = args.client;
	chain = args.chain;
	user = args.user;
	peers = args.peers;
	orderer = args.orderer;
	cleanup = args.cleanup;
}).then( function() {
	var nonce = utils.getNonce();
	var txId = hfc.buildTransactionID(nonce, user);
	var request = {
		targets : peers,
		txId : 	txId,
		nonce : nonce
	};
	return chain.joinChannel(request);
}).then( function(results) {
	logger.debug(util.format('Join Channel R E S P O N S E : %j', results));
	if(results[0] && results[0].response && results[0].response.status == 200) {
		logger.info('Successfully joined peers to the channel');
	} else {
		throw new Error('Failed to join channel');
	}
}).catch( function(err) {
	logger.error(err.stack ? err.stack : err);
}).then( function(){
	cleanup();
} );



