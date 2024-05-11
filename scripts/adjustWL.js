const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractCallQuery,
	ReceiptStatusError,
	Hbar,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	TransactionId,
	// eslint-disable-next-line no-unused-vars
	TransactionReceipt,
	HbarUnit,
} = require('@hashgraph/sdk');
require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
let abi;

const { requestMultiSig } = require('./reqMultiSig.js');

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);
const contractName = process.env.CONTRACT_NAME ?? null;

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const readlineSync = require('readline-sync');

const env = process.env.ENVIRONMENT ?? null;
let client;
let isMultiSig = false;
const nodeId = [new AccountId(3)];

// check-out the deployed script - test read-only method
const main = async () => {
	if (getArgFlag('h')) {
		console.log('Usage: node adjustWL.js [-add 0.0.XXXX] [-rem 0.0.XXX] [-check] [-multisig]');
		console.log('       -add			add account');
		console.log('       -rem			remove account');
		console.log('       -check			query WL');
		console.log('       -multisig		if multisig needed');
		process.exit(0);
	}
	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	const isAdd = getArgFlag('add');
	const isRemove = getArgFlag('rem');
	const isCheck = getArgFlag('check');
	isMultiSig = getArgFlag('multisig');

	let operation = '';
	let accountId;
	if (isAdd) {
		accountId = AccountId.fromString(getArg('add'));
		operation = 'add ' + accountId.toString();
	}
	else if (isRemove) {
		accountId = AccountId.fromString(getArg('rem'));
		operation = 'remove ' + accountId.toString();
	}
	else if (isCheck) {
		operation = 'check';
	}
	else {
		console.log('No operation specified - exiting');
		process.exit(1);
	}

	console.log('\n-Using ENIVRONMENT:', env);
	console.log('\n-Using Operator:', operatorId.toString());

	if (env.toUpperCase() == 'TEST') {
		client = Client.forTestnet();
		console.log('interacting in *TESTNET*');
	}
	else if (env.toUpperCase() == 'MAIN') {
		client = Client.forMainnet();
		console.log('interacting in *MAINNET*');
	}
	else {
		console.log('ERROR: Must specify either MAIN or TEST as environment in .env file');
		return;
	}

	client.setOperator(operatorId, operatorKey);

	// import ABI
	const json = JSON.parse(fs.readFileSync(`./artifacts/contracts/${contractName}.sol/${contractName}.json`, 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');


	console.log('Using contract: ',
		contractId.toString());

	// confirm action
	const proceed = readlineSync.keyInYNStrict('Do you want to ' + operation + ' the WL?');

	if (proceed) {
		if (isAdd) {
			await addAddressToWL(accountId);
		}
		else if (isRemove) {
			await removeAddressFromWL(accountId);
		}

		// check the allowance WL
		await getAllowanceWL();
	}
	else {
		console.log('User aborted');
		return;
	}

};

async function getAllowanceWL() {
	try {
		console.log('\n-getAllowanceWhitelist Query');
		// generate function call with function name and parameters
		const functionCallAsUint8Array = encodeFunctionCall('getAllowanceWhitelist', []);

		// query the contract
		const contractCall = await new ContractCallQuery()
			.setContractId(contractId)
			.setFunctionParameters(functionCallAsUint8Array)
			.setQueryPayment(new Hbar(0.5, HbarUnit.Hbar))
			.setGas(100000)
			.execute(client);

		const results = decodeFunctionResult('getAllowanceWhitelist', contractCall.bytes);
		const wlAccountsEVM = results.wl;
		if (wlAccountsEVM.length == 0) {
			console.log('No accounts in the WL!');
		}
		else {
			for (let a = 0; a < wlAccountsEVM.length; a++) {
				const acctAsEVM = wlAccountsEVM[a];
				console.log('\tFound account:', acctAsEVM, ' / ', AccountId.fromEvmAddress(0, 0, acctAsEVM).toString());
			}
		}
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(JSON.stringify(err, null, 2));
		}
		else {
			console.log(JSON.stringify(err, null, 2), err);
		}
	}
}

/**
 * Decodes the result of a contract's function execution
 * @param functionName the name of the function within the ABI
 * @param resultAsBytes a byte array containing the execution result
 */
function decodeFunctionResult(functionName, resultAsBytes) {
	const functionAbi = abi.find(func => func.name === functionName);
	const functionParameters = functionAbi.outputs;
	console.log(
		'\n -Decoding:',
		functionName,
		'\n -outputs expected:',
		JSON.stringify(functionParameters, null, 3));
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

function encodeFunctionCall(functionName, parameters) {
	const functionAbi = abi.find((func) => func.name === functionName && func.type === 'function');
	const encodedParametersHex = web3.eth.abi.encodeFunctionCall(functionAbi, parameters).slice(2);
	return Buffer.from(encodedParametersHex, 'hex');
}

/**
 * Helper method to add to WL
 * @param {AccountId} address
 * @returns {TransactionReceipt}
 */
async function addAddressToWL(address) {
	const gasLim = 400000;
	const params = new ContractFunctionParameters()
		.addAddress(address.toSolidityAddress());
	const [addToWLRx, , ] = await contractExecuteFcn(contractId, gasLim, 'addAllowanceWhitelist', params);
	return addToWLRx.status.toString();
}

/**
 * Helper method to add to WL
 * @param {AccountId} address
 * @returns {TransactionReceipt}
 */
async function removeAddressFromWL(address) {
	const gasLim = 400000;
	const params = new ContractFunctionParameters()
		.addAddress(address.toSolidityAddress());
	const [callHbarRx, , ] = await contractExecuteFcn(contractId, gasLim, 'removeAllowanceWhitelist', params);
	return callHbarRx.status.toString();
}

/**
 * Helper function for calling the contract methods
 * @param {ContractId} cId the contract to call
 * @param {number | Long.Long} gasLim the max gas
 * @param {string} fcnName name of the function to call
 * @param {ContractFunctionParameters} params the function arguments
 * @param {string | number | Hbar | Long.Long | BigNumber} amountHbar the amount of hbar to send in the methos call
 * @returns {[TransactionReceipt, any, TransactionRecord]} the transaction receipt and any decoded results
 */
async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.setNodeAccountIds(nodeId)
		.setTransactionId(TransactionId.generate(operatorId))
		.freezeWith(client);

	let signedTx;
	if (isMultiSig) {
		const multiSigAccount = AccountId.fromString(process.env.MULTI_SIG_WALLET);
		console.log('Using multisig account:', multiSigAccount.toString());

		signedTx = await requestMultiSig(contractExecuteTx);
	}
	else {
		signedTx = await contractExecuteTx.sign(operatorKey);
	}

	const exectuedTx = await signedTx.execute(client);

	if (isMultiSig) {
		const payerForRecordAccount = AccountId.fromString(process.env.PAYER_FOR_RECORD);
		client.setOperator(payerForRecordAccount, operatorKey);
	}

	// get the results of the function call;
	const record = await exectuedTx.getRecord(client);
	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await exectuedTx.getReceipt(client);
	return [contractExecuteRx, contractResults, record];
}

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


main()
	.then(() => {
		process.exit(0);
	})
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
