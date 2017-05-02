/*jslint node: true */
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('DEPLOY');

var hfc = require('fabric-client');
var utils = require('fabric-client/lib/utils.js');
var User = require('fabric-client/lib/User.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');
var fs = require('fs');
var util = require('util');

var config = require('./config.json');
var helper = require('./helper.js');

logger.setLevel('INFO');

var chain;
var cleanup;
var client;
var instantiateConfirmation;

if (!process.env.GOPATH){
	process.env.GOPATH = config.goPath;
}

logger.debug("GETTING STARTED");

helper.init().then( function(args) {
	chain = args.chain;
	cleanup = args.cleanup;
	client = args.client;
	helper.setupChaincodeDeploy();
	logger.debug('building install proposal.');
	// Snip begin
	var nonce = utils.getNonce();
	var txId = hfc.buildTransactionID(nonce, args.user);

	// logger.info('Registering for install events from '+txId+'.');
	// args.events.forEach((eh) => {
	// 	eh.registerTxEvent(txId.toString(), (tx, code) => {
	// 		logger.info('Install Transaction event came back with code: ',code);
	// 		eh.unregisterTxEvent(txId);
	// 	});
	// });

	var request = {
		targets: args.peers,
		chaincodePath: config.chaincodePath,
		chaincodeId: config.chaincodeID,
		chaincodeVersion: config.chaincodeVersion,
		txId: txId,
		nonce: nonce
	};
	logger.debug('Sending install proposal.');
	return client.installChaincode(request).then(function(results){
		logger.debug('Acquired endorsement for the install proposal.');
		args.results = results;
		return args;
	});

}).then( function(args) {
	var responses = args.results[0];
	responses.forEach( function(reply){
		var response = reply.response;
		if (!response || response.status !== 200) {
			throw new Error('Failed to install the Chaincode.');
		}
	});
	logger.info('Chaincode Installation Succeeded.');
	return helper.sleep(2000).then( () => args );

}).then( function(args) {
	
	logger.debug('Time to initialize the chain.');
	return chain.initialize().then( () => args );
}).then( function(args) {
	logger.debug('The chain was initialized.');
	var nonce = utils.getNonce();
	var txId = hfc.buildTransactionID(nonce, args.user);

	var request = {
		chaincodePath: config.chaincodePath,
		chaincodeId: config.chaincodeID,
		chaincodeVersion: config.chaincodeVersion,
		fcn: 'init',
		args: ['a', '100', 'b', '200'],
		chainId: config.chainName,
		txId: txId,
		nonce: nonce
	};

	logger.debug('Time to send the Instantiate Proposal.');
	return chain.sendInstantiateProposal(request).then( function(results){
		var proposalResponses = results[0];
		var proposal = results[1];
		var header = results[2];
		proposalResponses.forEach( function(reply){
			logger.debug(util.format(reply));
			var response = reply.response;
			if (!response || response.status !== 200) {
				throw new Error('Failed: the proposal to instantiate the Chaincode was rejected.');
			}
		});
		logger.debug('Acquired endorsement for the Chaincode Instantiation.');

		logger.debug('Registering for instantiation events from '+txId+'.');
		instantiateConfirmation = new Promise( function( resolve, reject ){
			args.events.forEach((eh) => {
				eh.registerTxEvent(txId.toString(), (tx, code) => {
					logger.debug('Instantiation Transaction event came back with code: ',code);
					logger.debug('tx: ', tx);
					eh.unregisterTxEvent(txId);
					if( code === 'VALID' ){
						resolve();
					}else{
						reject('Instantiation code was '+code);
					}
				});
			});
		});
		
		logger.debug('Time to send the instantiation transaction.');
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			header: header
		};
		return chain.sendTransaction(request);
	});

}).then( function(transactionResult) {
	if( transactionResult.status === 'SUCCESS' ){
		logger.info('Chaincode instantiation approved.');
	}else{
		logger.error('Instantion transaction was rejected.');
		throw new Error('Instantion transaction was rejected.');
	}
}).catch( function(err) {
		logger.error(err.stack ? err.stack : err);
}).then( function() {
	logger.info('Waiting for confirmation of chaincode instantiation.');
	return Promise.all( [ instantiateConfirmation ] );
}).then( function() {
	logger.info('Received confirmation of chaincode instantiation.');
	cleanup();
});



