/*jslint node: true */
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var Peer = require('fabric-client/lib/Peer.js');
var Orderer = require('fabric-client/lib/Orderer.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var User = require('fabric-client/lib/User.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var fs = require('fs');
var util = require('util');

var config = require('./config.json');
var helper = require('./helper.js');
var cleanup;

logger.setLevel('INFO');

if (!process.env.GOPATH){
	process.env.GOPATH = config.goPath;
}

logger.debug("GETTING STARTED");

helper.init().then( function(args) {
	logger.debug('Successfully obtained enrolled user to deploy the chaincode');

	var nonce = utils.getNonce();
	var txId = hfc.buildTransactionID(nonce, args.user);
	cleanup = args.cleanup;

	logger.info('Registering for transaction events from '+txId+'.');
	args.events.forEach((eh) => {
		eh.registerTxEvent(txId.toString(), (tx, code) => {
			logger.info('Transaction event came back with code: ',code);
			logger.info('tx: ', tx);
			eh.unregisterTxEvent(txId);
		});
	});

	logger.info('Registering for block events.');
	args.events.forEach((eh) => {
		eh.registerBlockEvent( (block) => {
			logger.info('Block ',block.header.number,' came back with hash: ',block.header.data_hash);
			var metadata = block.metadata.metadata;
			logger.info('   signature : ',metadata[4]);
		});
	});

	// send proposal to endorser
	var request = {
		chaincodeId: config.chaincodeID,
		chaincodeVersion: config.chaincodeVersion,
		fcn: 'invoke',
		args: ['move', 'b', 'a','100'],
		chainId: config.chainName,
		txId: txId,
		nonce: nonce
	};

	return args.chain.sendTransactionProposal(request).then( function(results){
		args.results = results;
		return args;
	});

}).then( function(args) {
	var results = args.results;
	var proposalResponses = results[0];
	var proposal = results[1];
	var header = results[2];
	proposalResponses.forEach( function(reply){
		var response = reply.response;
		if (!response || response.status !== 200) {
			throw new Error('Failed: the proposal to invoke the move() function was rejected.');
		}
	});
	logger.debug('Acquired endorsement for the move() transaction.');
	
	var request = {
		proposalResponses: proposalResponses,
		proposal: proposal,
		header: header
	};
	return args.chain.sendTransaction(request);

}).then( function(transactionResult) {
	if( transactionResult.status === 'SUCCESS' ){
		logger.info('move() transaction completed successfully.');
	}else{
		logger.error('Invocation transaction was rejected.');
		throw new Error('Invocation transaction was rejected.');
	}
}).catch( function(err) {
		//eventhub.disconnect();
		logger.error(err.stack ? err.stack : err);
}).then( function() {
	return helper.sleep(20000);
}).then( function() {
	cleanup();
});



