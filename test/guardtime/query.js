
/*jslint node: true */
'use strict';

var utils = require('fabric-client/lib/utils.js');

var log4js = require('log4js');
var logger = log4js.getLogger('QUERY');

var config = require('./config.json');
var helper = require('./helper.js');

logger.setLevel('INFO');

helper.init().then( function(args) {
	logger.debug('Successfully obtained enrolled user to deploy the chaincode');

	var nonce = utils.getNonce();
	var txId = args.chain.buildTransactionID(nonce, args.user);

	// send query
	var request = {
		chaincodeId : config.chaincodeID,
		chaincodeVersion : config.chaincodeVersion,
		chainId: config.chainName,
		txId: txId,
		nonce: nonce,
		fcn: 'invoke',
		args: ['query','a']
	};
	return args.chain.queryByChaincode(request);
},
(err) => {
	logger.error('Failed to get submitter \'admin\'');
	throw new Error('Failed to get submitter \'admin\'. Error: ' + err.stack ? err.stack : err );
}).then((response_payloads) => {
	if (response_payloads) {
		for(let i = 0; i < response_payloads.length; i++) {
			var payloadString = response_payloads[i].toString('utf8');
			logger.info('Query result : '+payloadString);
			//t.equal(payloadString,'300','checking query results are correct that user b has 300 now after the move');
		}
	} else {
		throw new Error('response_payloads is null');
	}
},
(err) => {
	throw new Error('Failed to send query due to error: ' + err.stack ? err.stack : err);
}).catch((err) => {
	throw new Error('Failed to end to end test with error:' + err.stack ? err.stack : err);
});
