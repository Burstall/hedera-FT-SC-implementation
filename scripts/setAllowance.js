const {
	Client,
	AccountId,
	PrivateKey,
	ContractId,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	TransactionId,
	// eslint-disable-next-line no-unused-vars
	TransactionReceipt,
	TokenId,
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
const tokenId = TokenId.fromString(process.env.TOKEN_ID);
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);

const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const readlineSync = require('readline-sync');

const env = process.env.ENVIRONMENT ?? null;
let client;
let isMultiSig = false;
const nodeId = [new AccountId(3)];

// check-out the deployed script - test read-only method
const main = async () => {
	if (getArgFlag('h')) {
		console.log('Usage: node setAllowance.js -amt X -acct 0.0.XXX [-multisig]');
		console.log('       -amt			amount to set as allowance');
		console.log('       -acct			account to have the allowance');
		console.log('       -multisig		if multisig needed');
		process.exit(0);
	}
	if (contractName === undefined || contractName == null) {
		console.log('Environment required, please specify CONTRACT_NAME for ABI in the .env file');
		return;
	}

	isMultiSig = getArgFlag('multisig');

	if (!getArgFlag('amt')) {
		console.log('Please specify amount for allowance with -amt');
		process.exit(1);
	}
	else if (!getArgFlag('acct')) {
		console.log('Please specify account for allowance with -acct');
		process.exit(1);
	}

	const accountId = AccountId.fromString(getArg('acct'));
	const amount = Number(getArg('amt'));

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
	const proceed = readlineSync.keyInYNStrict('Do you want to set an allowance of ' + amount +
		' of token ' + tokenId.toString() + ' for ' + accountId.toString() +
		'\n\t-token decimal of ' + tokenDecimal + ' assumed (' +
		amount * (10 ** tokenDecimal) + ') raw');

	if (proceed) {
		console.log(await approveAllowance(accountId, amount));
	}
	else {
		console.log('User aborted');
		return;
	}

};

async function approveAllowance(spender, amount) {
	const gasLim = 800000;
	const params = new ContractFunctionParameters()
		.addAddress(tokenId.toSolidityAddress())
		.addAddress(spender.toSolidityAddress())
		.addUint256(amount * (10 ** tokenDecimal));
	const [callHbarRx, , ] = await contractExecuteFcn(contractId, gasLim, 'approveAllowance', params);
	return callHbarRx.status.toString();

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
