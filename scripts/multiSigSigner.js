require('dotenv').config();
const {
	AccountId,
	PrivateKey,
	Client,
	Mnemonic,
	Transaction,
	Hbar,
	HbarUnit,
	AccountCreateTransaction,
	KeyList,
	PublicKey,
	AccountUpdateTransaction,
	TransactionId,
	TransferTransaction,
	ContractExecuteTransaction,
} = require('@hashgraph/sdk');
const fs = require('fs');
const readlineSync = require('readline-sync');
const { requestMultiSig } = require('./reqMultiSig.js');
require('dotenv').config();

let publicKeyList = process.env.MULTI_SIG_PUBLIC_KEYS.split(',') || null;
let privateKeyList = process.env.MULTI_SIG_PRIVATE_KEYS.split(',') || null;
let multiSigThreshold = Number(process.env.MULTI_SIG_THRESHOLD) || null;

// add signature documented to require only single node to be used.
const nodeId = [new AccountId(3)];

function getArg(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);
	let customValue;

	if (customIndex > -1) {
		// Retrieve the value after --custom
		customValue = process.argv[customIndex + 1];
	}

	return customValue;
}

function getArgFlag(arg) {
	const customIndex = process.argv.indexOf(`-${arg}`);

	if (customIndex > -1) {
		return true;
	}

	return false;
}

// read in from transaction bytes, add signature and export transaction bytes

// execute signed tx if signature list complete.

// update keys on an account based to convert to multi sig

async function main() {
	if (getArgFlag('h')) {
		console.log('Usage: node multiSigSigner.js [-generate]');
		console.log('       			[-query [-bytes <TRANSACTIONBYTES as base64>]');
		console.log('       			[-sign [-privatekeys \'302ABC,302QQA\'] [-bytes <TRANSACTIONBYTES as base64>]');
		console.log('			[-newaccount [-threshold Y] [-initialbal Z] [-publickeys \'MFC,BRV,GAS\']]');
		console.log('			[-convert -account 0.0.XXXX [[-threshold Y] [-publickeys \'MFC,BRV,GAS\']] [-singlekey]');
		console.log('			[-update -account 0.0.XXXX [[-threshold Y] [-publickeys \'MFC,BRV,GAS\']]');
		console.log('       -generate 		create a new public / private keypair');
		console.log('       -query 			displays tx details of MULTI_SIG_BYTES or overide on commandline with -bytes');
		console.log('       -sign 			query then sign tx details of MULTI_SIG_BYTES or overide on commandline with -bytes');
		console.log('       	-privatekeys 		overide private key(s) as csv else env MULTI_SIG_PRIVATE_KEYS');
		console.log('       -newaccount 		create a new multi signature secured account');
		console.log('       	-threshold 		overide threshold (e.g. 2 of X public keys) else env MULTI_SIG_THRESHOLD');
		console.log('       	-publickeys 		overide public keys (as csv) else env MULTI_SIG_PUBLIC_KEYS');
		console.log('       -convert 		update keys on account to multisig / back to single key of operator');
		console.log('       	-account 		looks to .env MULTI_SIG_ADJUST_ACCOUNT or overide here -> 0.0.XXX the account to operate on');
		console.log('       	-threshold 		overide threshold (e.g. 2 of X public keys) else env MULTI_SIG_THRESHOLD');
		console.log('       	-publickeys 		overide public keys (as csv) else env MULTI_SIG_PUBLIC_KEYS');
		console.log('       	-oldkey 		old account key overide -> looks to OLD_KEY in .env and if not specified tries operator key');
		console.log('       	-singlekey	 	convert back to an account on single key (the operator -> MY_ACCOUNT_ID fron .env)');
		console.log('       -update 			update a multiSig account to a new multiSig key set');
		console.log('       	-account 		looks to .env MULTI_SIG_ADJUST_ACCOUNT or overide here -> 0.0.XXX the account to operate on');
		console.log('       	-threshold 		overide threshold (e.g. 2 of X public keys) else env MULTI_SIG_THRESHOLD');
		console.log('       	-publickeys 		overide public keys (as csv) else env MULTI_SIG_PUBLIC_KEYS');
		process.exit(0);
	}

	const isQuery = getArgFlag('query');

	const isNewAccount = getArgFlag('newaccount');
	const isConvertAccount = getArgFlag('convert');
	const isUpdateAccont = getArgFlag('update');
	const isSingleKeyUpdate = getArgFlag('singlekey');

	if (getArgFlag('sign') || isQuery) {
		let txBytesAsBase64 = process.env.MULTI_SIG_BYTES;
		if (getArgFlag('bytes')) txBytesAsBase64 = getArg('bytes');

		if (!txBytesAsBase64) {
			console.log('No tx supplied to query - exiting');
			return;
		}

		console.log('\n-Decoding...');

		const txAsBytes = Uint8Array.from(Buffer.from(txBytesAsBase64, 'base64'));

		console.log('\n-Reconstructing transaction...');

		const tx = Transaction.fromBytes(txAsBytes);

		console.log(JSON.stringify(tx));

		// TODO: extend for FT / NFT / SC calls

		console.log('\n* memo: ' + tx._transactionMemo +
			'\n* maxTxFee: ' + new Hbar(tx._maxTransactionFee._valueInTinybar, HbarUnit.Tinybar).toString() +
			'\n* proposed tx type: ' + tx.constructor.name + ' : ' + getTransactionType(tx) +
			'\n* proposed hbar tx: ' + getHbarTransfers(tx));

		if (isQuery) return;

		const sign = readlineSync.keyInYNStrict('Do you want to sign the proposed tx?');

		if (sign) {
			// not recomended but adding for flexibility
			if (getArgFlag('privatekeys')) privateKeyList = getArg('privatekeys').split(',');
			if (!privateKeyList || privateKeyList.length == 0 || privateKeyList[0] == '') {
				console.log('No private keys supplied - exiting');
				return;
			}
			else {
				console.log('\n-Private Keys loaded');
			}

			for (let k = 0; k < privateKeyList.length; k++) {
				const pk = PrivateKey.fromString(privateKeyList[k]);
				const signedTxAsBytes = await pk.signTransaction(tx);
				const signedTxBytesAsBase64 = Buffer.from(signedTxAsBytes).toString('base64');
				console.log('\n*Signed - tx@' + k + ' *\n' +
				'-------Copy between lines-------\n' +
				pk.publicKey + ':' + signedTxBytesAsBase64 +
				'\n-------Copy between lines-------');
			}

		}
		else {
			console.log('User aborted');
			return;
		}
	}
	else if (getArgFlag('generate')) {
		console.log('Generating new keys...');
		// Generate New key
		const mnemonic = await Mnemonic.generate();
		const newPrivateKey = await mnemonic.toPrivateKey();

		const outputString = 'Mnemonic:\n'
			+ mnemonic.toString()
			+ '\nNew Private Key:\n'
			+ newPrivateKey.toString()
			+ '\nNew Public Key:\n'
			+ newPrivateKey.publicKey
			+ '\n\nNew mnemonic:\n'
			+ mnemonic;

		const save = readlineSync.keyInYNStrict('Do you want to save your new generated keys to file?\n**HIGHLY RECOMMENDED as if lost the wallet could become inaccessible**');

		if (save) {
			const startTime = new Date();
			const timestamp = startTime.toISOString().split('.')[0].replaceAll(':', '-');
			const filename = `./PK-${timestamp}.txt`;
			fs.writeFileSync(filename, outputString, { flag: 'w' }, function(err) {
				if (err) {
					console.log('ERROR occured - printing to console:\n', outputString);
					return console.error(err);
				}
				// read it back in to be sure it worked.
				fs.readFile(filename, 'utf-8', function(err) {
					if (err) {
						console.log('ERROR reading back the file - printing to console:\n', outputString);
						return console.error(err);
					}
					console.log('Keys saved', filename);
				});
			});
		}
		else {
			console.log(outputString);
		}
	}
	else if (isNewAccount || isConvertAccount || isUpdateAccont) {
		const operatorId = AccountId.fromString(process.env.MY_ACCOUNT_ID);
		const operatorKey = PrivateKey.fromString(process.env.MY_PRIVATE_KEY);
		const env = process.env.ENVIRONMENT || null;
		let client;

		if (!env || !operatorId || !operatorKey) {
			console.log('Please check environment variables ar set -> MY_PRIVATE_KEY / MY_PRIVATE_KEY / ENVIRONMENT');
			process.exit(1);
		}

		if (getArgFlag('threshold')) {
			multiSigThreshold = Number(getArg('threshold'));
		}

		let initialBalance = 10;
		if (getArgFlag('initialbal')) {
			initialBalance = Number(getArg('initialbal'));
		}

		if (getArgFlag('publickeys')) {
			publicKeyList = getArg('publickeys').split(',');
		}

		console.log(`- Using account: ${operatorId} as payer`);
		console.log('- Using ENVIRONMENT:', env);
		console.log('- Using threshold:', multiSigThreshold);
		if (isNewAccount) console.log('- Using Initial Balance:', initialBalance);

		if (env == 'TEST') {
			client = Client.forTestnet();
			console.log('operating in *TESTNET*');
		}
		else if (env == 'MAIN') {
			client = Client.forMainnet();
			console.log('operating in *MAINNET*');
		}
		else {
			console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
			return;
		}

		const keyList = [];
		for (const p in publicKeyList) {
			const publicKey = PublicKey.fromString(publicKeyList[p]);
			keyList.push(publicKey);
			if (!isSingleKeyUpdate) console.log('-Adding public key:', publicKey.toString());
		}

		if (isNewAccount) {
			const proceed = readlineSync.keyInYNStrict('Do you want to create the account as a multi signature wallet?');

			if (proceed) {
				const thresholdKey = new KeyList(keyList, multiSigThreshold);
				console.log('The ' + multiSigThreshold + '/' + keyList.length + ' threshold key structure' + thresholdKey);
				const newAcctId = await multiSigAccountCreator(initialBalance, thresholdKey, operatorId, operatorKey, client);
				console.log('\n\nPlease note down the new account ID:', newAcctId.toString());
			}
			else {
				console.log('User aborted');
				return;
			}
		}
		else {
			let accountIdString = process.env.MULTI_SIG_ADJUST_ACCOUNT;
			if (getArgFlag('account')) accountIdString = getArg('account');
			if (!accountIdString) {
				console.log('Please specify the account to update either with -account or in .env MULTI_SIG_ADJUST_ACCOUNT');
				return;
			}
			const accountId = AccountId.fromString(accountIdString);
			if (isConvertAccount) {
				if (isSingleKeyUpdate) {
					const proceed = readlineSync.keyInYNStrict('Do you want to revert the account to a single signature wallet?');

					if (proceed) {
						await updateKeysOnAccount(accountId, new KeyList(), operatorKey, operatorId, operatorKey, client);
					}
					else {
						console.log('User aborted');
						return;
					}
				}
				else {
					let oldkey = process.env.OLD_KEY;
					if (getArgFlag('oldkey')) oldkey = getArg('oldkey');
					const oldKeyAsKey = oldkey ? PrivateKey.fromString(oldkey) : operatorKey;
					if (oldKeyAsKey == operatorKey) {
						console.log('\n-Using operator key as old key');
					}
					else {
						console.log('\n-Using OLD_KEY from env file');
					}

					console.log('\n-**Account update requires the new keys to sign too**\n');

					const proceed = readlineSync.keyInYNStrict('Do you want change the account to a multiSig wallet?');

					if (proceed) {
						const thresholdKey = new KeyList(keyList, multiSigThreshold);
						console.log('The ' + multiSigThreshold + '/' + keyList.length + ' threshold key structure' + thresholdKey);
						await updateKeysOnAccount(accountId, oldKeyAsKey, thresholdKey, operatorId, operatorKey, client);
					}
					else {
						console.log('User aborted');
						return;
					}
				}
			}
			else if (isUpdateAccont) {
				// designed as multi sig to multi sig
				// pass in an empty keylist as old key and the method will ask for multi sig based on type.
				const proceed = readlineSync.keyInYNStrict('Do you want to update the multisig on the wallet?');

				if (proceed) {
					const thresholdKey = new KeyList(keyList, multiSigThreshold);
					console.log('The ' + multiSigThreshold + '/' + keyList.length + ' threshold key structure' + thresholdKey);
					await updateKeysOnAccount(accountId, new KeyList(), keyList, operatorId, operatorKey, client);
				}
				else {
					console.log('User aborted');
					return;
				}
			}
		}
	}
	else {
		console.log('No eligible arguments supplied - please check usage ruinning the command with a -h switch');
	}
}

/**
 * Helper function to create new accounts
 * @param {PrivateKey} privateKey new accounts private key
 * @param {string | number} initialBalance initial balance in hbar
 * @param {KeyList} thresholdKey the threshold key
 * @param {AccountId} operatorId the account paying for the execution to generate the tx id
 * @param {PrivateKey} operatorKey the key to sign for payment
 * @param {Client} client
 * @returns {AccountId} the nrewly created Account ID object
 */
async function multiSigAccountCreator(initialBalance, thresholdKey, operatorId, operatorKey, client) {
	console.log('Creating multisig account');

	const acctCreateTx = await new AccountCreateTransaction()
		.setInitialBalance(new Hbar(initialBalance))
		.setKey(thresholdKey)
		.setTransactionId(TransactionId.generate(operatorId))
		.setNodeAccountIds(nodeId)
		.freezeWith(client);

	const signedTx = await acctCreateTx.sign(operatorKey);
	const response = await signedTx.execute(client);

	const receipt = await response.getReceipt(client);

	console.log('Result:', receipt.status.toString());
	return receipt.accountId;
}

/**
 * Helper function to change keys that can handle multi sig
 * @param {AccountId} accountToChange
 * @param {Key} oldKey
 * @param {Key} newKey
 * @param {AccountId} operatorId the account paying for the execution to generate the tx id
 * @param {PrivateKey} operatorKey the key to sign for payment
 * @param {Client} client configured with the operator who is paying
 */
async function updateKeysOnAccount(accountToChange, oldKey, newKey, operatorId, operatorKey, client) {
	let signedTx;
	const transaction = new AccountUpdateTransaction()
		.setAccountId(accountToChange)
		.setKey(newKey)
		.setTransactionId(TransactionId.generate(operatorId))
		.setNodeAccountIds(nodeId)
		.freezeWith(client);

	signedTx = await transaction.sign(operatorKey);

	// all keys need to sign
	if (oldKey instanceof KeyList) {
		// multi sig required
		signedTx = await requestMultiSig(signedTx);
	}
	else {
		signedTx = await signedTx.sign(oldKey);
	}

	if (newKey instanceof KeyList) {
		// multi sig required
		signedTx = await requestMultiSig(signedTx);
	}
	else {
		signedTx = await signedTx.sign(newKey);
	}

	const txResponse = await signedTx.execute(client);
	const receipt = await txResponse.getReceipt(client);
	const transactionStatus = receipt.status;

	console.log('Account update: ' + transactionStatus.toString());
}

/**
 * Encapsulation of transaction processing to get hbar movements
 * @param {Transaction} tx
 * @returns {string} findings
 */
function getHbarTransfers(tx) {
	let outputStr = '';

	const hbarTransfers = tx._hbarTransfers;
	for (const t in hbarTransfers) {
		const hbarTransfer = hbarTransfers[t];
		outputStr += '\n\t' + hbarTransfer.accountId.toString() + '\t->\t' + new Hbar(hbarTransfer.amount._valueInTinybar, HbarUnit.Tinybar).toString();
	}

	return outputStr ? outputStr : 'No Hbar transfers found';
}

/**
 * decode the transaction type
 * @param {Transaction} transaction
 * @returns {string} identified type
 */
function getTransactionType(transaction) {
	if (transaction instanceof AccountUpdateTransaction) {
		return `Account Update : ${transaction._accountId}`;
	}
	else if (transaction instanceof TransferTransaction) {
		return 'Transfer Transaction';
	}
	else if (transaction instanceof ContractExecuteTransaction) {
		return `${transaction.contractId} : gas -> ${transaction.gas}`;
	}

	return 'Type unidentifed - please share bytes with the devs';
}

main();