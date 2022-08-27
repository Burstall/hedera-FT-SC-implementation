const {
	Client,
	AccountId,
	PrivateKey,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	TokenAssociateTransaction,
	AccountInfoQuery,
	TokenId,
	ContractId,
	ContractInfoQuery,
	ReceiptStatusError,
	TransferTransaction,
} = require('@hashgraph/sdk');
// const { hethers } = require('@hashgraph/hethers');
require('dotenv').config();
const fs = require('fs');
const Web3 = require('web3');
const web3 = new Web3();
let abi;

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const tokenId = TokenId.fromString(process.env.TOKEN_ID);
const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function contractExecuteFcn(cId, gasLim, fcnName, params, amountHbar) {
	const contractExecuteTx = await new ContractExecuteTransaction()
		.setContractId(cId)
		.setGas(gasLim)
		.setFunction(fcnName, params)
		.setPayableAmount(amountHbar)
		.execute(client);

	// get the results of the function call;
	const record = await contractExecuteTx.getRecord(client);
	console.log('record bytes:', JSON.stringify(record.contractFunctionResult.bytes, 4));
	console.log('Execution return', fcnName, JSON.stringify(contractExecuteTx, 3));
	const contractResults = decodeFunctionResult(fcnName, record.contractFunctionResult.bytes);
	const contractExecuteRx = await contractExecuteTx.getReceipt(client);
	return [contractExecuteRx, contractResults];
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
		JSON.stringify(functionParameters, 3));
	const resultHex = '0x'.concat(Buffer.from(resultAsBytes).toString('hex'));
	const result = web3.eth.abi.decodeParameters(functionParameters, resultHex);
	return result;
}

const main = async () => {
	// import ABI
	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json', 'utf8'));
	abi = json.abi;
	console.log('\n -Loading ABI...\n');
	let [acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
	let [contractTokenBal, contractHbarBal] = await getContractBalance(contractId);

	console.log('Using token: ',
		tokenId.toString(),
		'balance:',
		acctTokenBal,
		' -> ',
		accountHbarBal.toString());
	console.log('Using contract: ',
		contractId.toString(),
		'balance:',
		contractTokenBal,
		' -> ',
		contractHbarBal.toString());

	if (acctTokenBal < 0) {
		// associate
		// now associate the token to the operator account
		const associateToken = await new TokenAssociateTransaction()
			.setAccountId(operatorId)
			.setTokenIds([tokenId])
			.freezeWith(client)
			.sign(operatorKey);

		const associateTokenTx = await associateToken.execute(client);
		const associateTokenRx = await associateTokenTx.getReceipt(client);

		const associateTokenStatus = associateTokenRx.status;

		console.log('The associate transaction status: ' + associateTokenStatus.toString());
	}

	const tokenIdSolidityAddr = tokenId.toSolidityAddress();

	console.log('Transferring:', tokenId.toString(), tokenIdSolidityAddr);
	console.log('To:', operatorId.toString(), operatorId.toSolidityAddress());

	// Execute token transfer from TokenSender to Operator
	try {
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addAddress(operatorId.toSolidityAddress())
			.addUint256(1 * (10 ** tokenDecimal));
		const [tokenTransferRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'transfer', params);
		console.log('Function results', JSON.stringify(contractOutput, 3));
		console.log('Reciept', JSON.stringify(tokenTransferRx, 3));
		const tokenTransferStatus = tokenTransferRx.status;

		console.log('Token transfer transaction status: ' + tokenTransferStatus.toString());
		[acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		[contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(err.status, err.name, err.message);
		}
		else {
			console.log(err);
		}
	}

	// Execute burn
	try {
		console.log('\n -Attempting Burn..');
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(tokenIdSolidityAddr)
			.addUint256(5 * (10 ** tokenDecimal));
		const [burnTxRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'burnSupply', params, 0);
		console.log('Function results', JSON.stringify(contractOutput, 3));
		console.log('Reciept', JSON.stringify(burnTxRx, 3));
		const burnTxStatus = burnTxRx.status;

		console.log('Burn request: ' + burnTxStatus.toString());
		[acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		[contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(err.status, err.name, err.message);
		}
		else {
			console.log(err);
		}
	}

	// send hbar to contract
	try {
		console.log('\n -Attempting to send hbar to contract (Hederar JS SDK)..');
		const hbarTransferRx = await hbarTransferFcn(operatorId, contractId, 11);
		const tokenTransferStatus = hbarTransferRx.status;
		console.log('Hbar send *TO* contract status: ' + tokenTransferStatus.toString());
		[acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		[contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		console.log(err);
	}

	// move hbar from contract to operator
	try {
		console.log('\n -Attempting to retrieve hbar from contract');
		const gasLim = 400000;
		const params = new ContractFunctionParameters()
			.addAddress(operatorId.toSolidityAddress())
			.addUint256(11 * 1e8);
		const [callHbarRx, contractOutput] = await contractExecuteFcn(contractId, gasLim, 'callHbar', params);
		console.log('Function results', JSON.stringify(contractOutput, 3));
		console.log('Reciept', JSON.stringify(callHbarRx, 3));
		const callHbarStatus = callHbarRx.status;

		console.log('Move hbar *FROM* contract: ' + callHbarStatus.toString());
		[acctTokenBal, accountHbarBal] = await getAccountBalance(operatorId);
		[contractTokenBal, contractHbarBal] = await getContractBalance(contractId);
		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + acctTokenBal + ' -> ' + accountHbarBal.toString());

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + contractTokenBal + ' -> ' + contractHbarBal.toString());
	}
	catch (err) {
		console.log(err);
	}
};

async function hbarTransferFcn(sender, receiver, amount) {
	const transferTx = new TransferTransaction()
		.addHbarTransfer(sender, -amount)
		.addHbarTransfer(receiver, amount)
		.freezeWith(client);
	const transferSign = await transferTx.sign(operatorKey);
	const transferSubmit = await transferSign.execute(client);
	const transferRx = await transferSubmit.getReceipt(client);
	return transferRx;
}

async function getAccountBalance(acctId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());
	try {
		if (tokenBal) {
			balance = tokenBal.balance * (10 ** -tokenDecimal);
		}
		else {
			balance = -1;
		}
	}
	catch {
		balance = -1;
	}

	return [balance, info.balance];
}

async function getContractBalance(ctrctId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);

	let balance;

	const tokenMap = info.tokenRelationships;
	const tokenBal = tokenMap.get(tokenId.toString());
	if (tokenBal) {
		balance = tokenBal.balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return [balance, info.balance];
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
