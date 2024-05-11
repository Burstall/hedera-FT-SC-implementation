const {
	// eslint-disable-next-line no-unused-vars
	Transaction,
	PublicKey,
} = require('@hashgraph/sdk');
const readlineSync = require('readline-sync');

/**
 * Helper method encapsulatiing the multi sig process
 * @param {Transaction} transaction
 * @return {Transaction}
 */
async function requestMultiSig(transaction) {
	// encapsulate the request to multi sign for reuse
	console.log('\n-MultiSig signing\n');
	const txClockStart = new Date();

	const txAsBytes = transaction.toBytes();
	const txBytesAsBase64 = Buffer.from(txAsBytes).toString('base64');

	console.log('Please collect the additional signatures:\n\n' +
			'return format <public key1>:<signed bytes1>\n\nSpecify the number of signed tx to add\n\n-------Copy between lines-------\n' +
			txBytesAsBase64 + '\n-------Copy between lines-------');


	// wait on user entrys
	const howManySigs = readlineSync.question('How many signatures expected? ');
	console.log('\n\nExpecting ' + howManySigs + '\n\nPlease paste each seperately: ');
	const encodedSignedTxList = [];
	for (let e = 0; e < howManySigs; e++) {
		const prompt = '\nsigned-tx-' + e + '>$ ';
		const encodedSignedTx = readlineSync.prompt({ prompt: prompt });
		encodedSignedTxList.push(encodedSignedTx);
	}


	// for each tuple of public key:bytes
	let sigsFound = 0;
	for (let t = 0; t < encodedSignedTxList.length; t++) {
		const tuple = encodedSignedTxList[t];
		if (!tuple) continue;
		// split on :
		const [pubKey, encodedTx] = tuple.split(':');
		const publicKeyToAdd = PublicKey.fromString(pubKey);
		const signedTx = Uint8Array.from(Buffer.from(encodedTx, 'base64'));
		// add signatures
		await transaction.addSignature(publicKeyToAdd, signedTx);
		sigsFound++;
	}
	console.log('\n\n-Added ' + sigsFound + ' signatures');

	const txClockEnd = new Date();
	// check if 119 seconds or greater have elapsed
	if ((txClockEnd.getTime() - txClockStart.getTime()) >= 119000) {
		console.log('Likely time elapsed -- expect tx to fail');
	}

	return transaction;
}

module.exports = { requestMultiSig };