/**
 * Copyright 2016 IBM All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an 'AS IS' BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
/*jslint node: true */
'use strict';

var log4js = require('log4js');
var logger = log4js.getLogger('Helper');

var path = require('path');
var util = require('util');
var unzip = require('unzip-array');

var hfc = require('fabric-client');
var User = require('fabric-client/lib/User.js');
var EventHub = require('fabric-client/lib/EventHub.js');
var utils = require('fabric-client/lib/utils.js');
var copService = require('fabric-ca-client/lib/FabricCAClientImpl.js');

var config = require('./config.json');

var fs = require('fs');

logger.setLevel('INFO');

var	tlsOptions = {
	trustedRoots: [],
	verify: false
};

var getSubmitter = function(client) {
	var users = config.users;
	var username = users[0].username;
	var password = users[0].secret;
	var member;

	utils.setConfigSetting('key-value-store', 'fabric-client/lib/impl/FileKeyValueStore.js');
	logger.debug('storepath '+config.keyValueStore);
	return hfc.newDefaultKeyValueStore({
		path: config.keyValueStore
	}).then( function(store) {
		return client.setStateStore(store);
	}).then( function() {
		return client.getUserContext(username,true).then((user) => {
			if (user && user.isEnrolled()) {
				logger.debug('Successfully loaded member from persistence');
				return user;
			} else {
				logger.debug('caUrl '+config.caserver.ca_url);
				logger.debug('username '+username);
				logger.debug('password '+password);
				logger.debug('mspid '+config.mspname);
				var ca_client = new copService(config.caserver.ca_url, tlsOptions );
				// need to enroll it with CA server
				return ca_client.enroll({
					enrollmentID: username,
					enrollmentSecret: password
				}).then((enrollment) => {
					logger.debug('Successfully enrolled user \'' + username + '\'');

					member = new User(username);
					return member.setEnrollment(enrollment.key, enrollment.certificate, config.mspname);
				}).then(() => {
					return client.setUserContext(member);
				}).then(() => {
					return member;
				}).catch((err) => {
					logger.error('Failed to enroll and persist user. Error: ' + err.stack ? err.stack : err);
					throw new Error('Failed to obtain an enrolled user');
				});
			}
		});
	});
};

module.exports.processProposal = function(chain, results, proposalType) {
	var proposalResponses = results[0];
	logger.debug('deploy proposalResponses:'+JSON.stringify(proposalResponses));
	var proposal = results[1];
	var header = results[2];
	var all_good = true;
	for (var i in proposalResponses) {
		let one_good = false;
		if (proposalResponses && proposalResponses[i].response && proposalResponses[i].response.status === 200) {
			one_good = true;
			logger.debug(proposalType + ' proposal was good');
		} else {
			logger.error(proposalType + ' proposal was bad');
		}
		all_good = all_good & one_good;
		//FIXME:  App is supposed to check below things:
		// validate endorser certs, verify endorsement signature, and compare the WriteSet among the responses
		// to make sure they are consistent across all endorsers.
		// SDK will be enhanced to make these checks easier to perform.
	}
	if (all_good) {
		if (proposalType == 'deploy') {
			logger.debug(util.format('Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s', proposalResponses[0].response.status, proposalResponses[0].response.message, proposalResponses[0].response.payload, proposalResponses[0].endorsement.signature));
		} else {
			logger.debug('Successfully obtained transaction endorsements.');
		}
		var request = {
			proposalResponses: proposalResponses,
			proposal: proposal,
			header: header
		};
		return chain.sendTransaction(request);
	} else {
		logger.error('Failed to send Proposal or receive valid response. Response null or status is not 200. exiting...');
		throw new Error('Problems happened when examining proposal responses');
	}
};

module.exports.getArgs = function(chaincodeArgs) {
	var args = [];
	for (var i = 0; i < chaincodeArgs.length; i++) {
		args.push(chaincodeArgs[i]);
	}
	return args;
};

module.exports.getTxId = function() {
	return utils.buildTransactionID({
		length: 12
	});
};

var readFile = function(path){
	return new Promise(function(resolve, reject) {
		fs.readFile(path, function(err, data) {
			if (err) {
				reject(err);
			} else {
				resolve(data);
			}
		});
	});
};

var saveFile = function( filename, content ){
	return new Promise( function(resolve, reject){
		fs.writeFile( filename, content, function(err){
			if( err ){
				reject(err);
			} else {
				logger.info('saved file '+filename);
				resolve(filename);
			}
		});
	});
};

module.exports.readFile = readFile;
module.exports.getSubmitter = getSubmitter;
module.exports.saveFile = saveFile;

// temporarily set $GOPATH to the test fixture folder
module.exports.setupChaincodeDeploy = function() {
	process.env.GOPATH = path.join(__dirname, '../fixtures');
};


module.exports.sleep = function(ms) {
	return new Promise( function(resolve){ setTimeout(resolve, ms); });
};

module.exports.init = function(createChain) {
	if(typeof createChain === 'undefined'){
		createChain = true;
	}
	return new Promise( function(resolve){

		logger.debug('INIT');

		var client = new hfc();
		hfc.setConfigSetting('request-timeout', 30000);
		var chain;
		if( createChain ){
			chain = client.newChain(config.chainName);
		}
		var ordererPromise = readFile(config.orderer.tls_cacerts).then(function(data){
			logger.debug('Successfully read the file '+config.orderer.tls_cacerts);
			var caroots = Buffer.from(data).toString();
			return client.newOrderer( 
				config.orderer.orderer_url, 
				{
					'pem': caroots,
					'ssl-target-name-override': config.orderer.hostname
				}
			);
		}).then(function(orderer){
			if(chain){
				chain.addOrderer(orderer);
			}
			return orderer;
		});
		var peersAndEventsPromise = Promise.all(config.peers.map( function(peer) {
			logger.debug('reading file from '+peer.tls_cacerts);
			logger.debug('requests endpoint : '+peer.peer_url);
			logger.debug('ssl name override : '+peer.hostname);
					
			return readFile( peer.tls_cacerts ).then( function(data){
				var sslConfiguration = {
					pem: Buffer.from(data).toString(),
					'ssl-target-name-override': peer.hostname
				};
				var peerObject = client.newPeer( peer.peer_url, sslConfiguration );
				if(chain){
					chain.addPeer(peerObject);
				}

				var eh = new EventHub();
				eh.setPeerAddr( peer.event_url, sslConfiguration );
				eh.connect();
				return [peerObject,eh];
			});
		}));
		var submitterPromise = getSubmitter(client);	

		logger.debug('Promise.all');
		Promise.all( [ordererPromise,peersAndEventsPromise,submitterPromise] ).then( function(arr){
			logger.debug('INIT complete.');
			var peersAndEvents = unzip(arr[1]);
			var events = peersAndEvents[1];
			var cleanupFunction = function(){
				events.forEach( (eventhub) => {
					if (eventhub && eventhub.isconnected()) {
						logger.debug('Disconnecting the event hub');
						eventhub.disconnect();
					}
				});
			};
			resolve({
				client: client,
				chain: chain,
				orderer: arr[0],
				peers: peersAndEvents[0],
				user: arr[2],
				events: events,
				cleanup: cleanupFunction
			});
		}).catch((err) => {
			logger.error('Failed INIT. Error: ' + err.stack ? err.stack : err);
			throw new Error('????');
		});
	});
};
