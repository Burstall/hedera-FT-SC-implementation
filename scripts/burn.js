const {
	Client,
	AccountId,
	PrivateKey,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	AccountInfoQuery,
	TokenId,
	ContractId,
	ContractInfoQuery,
	ReceiptStatusError,
} = require('@hashgraph/sdk');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const tokenId = TokenId.fromString(process.env.TOKEN_ID);
const contractId = ContractId.fromString(process.env.CONTRACT_ID);
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

const main = async () => {
	const acctBal = await getAccountBalance(operatorId);
	const ctrctBal = await getContractBalance(contractId);

	console.log('Using token: ',
		tokenId.toString(),
		'balance:',
		acctBal);
	console.log('Using contract: ',
		contractId.toString(),
		'balance:',
		ctrctBal);

	const tokenIdSolidityAddr = tokenId.toSolidityAddress();

	// Execute token transfer from TokenSender to Operator
	const tokenBurn = new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(4000000)
		.setFunction('burnSupply',
			new ContractFunctionParameters()
				.addAddress(tokenIdSolidityAddr)
				.addUint256(1 * (10 ** tokenDecimal)),
		);

	try {
		const tokenTransferTx = await tokenBurn.execute(client);
		const tokenTransferRx = await tokenTransferTx.getReceipt(client);
		const tokenTransferStatus = tokenTransferRx.status;

		console.log('Burn transaction status: ' + tokenTransferStatus.toString());

		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + await getAccountBalance(operatorId, tokenId));

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + await getContractBalance(contractId, tokenId));
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(err.status, err.name, err.message);
		}
	}
};

async function getAccountBalance(acctId) {

	const query = new AccountInfoQuery()
		.setAccountId(acctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	if (tokenMap) {
		balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return balance;
}

async function getContractBalance(ctrctId) {

	const query = new ContractInfoQuery()
		.setContractId(ctrctId);

	const info = await query.execute(client);

	let balance;
	const tokenMap = info.tokenRelationships;
	if (tokenMap) {
		balance = tokenMap.get(tokenId.toString()).balance * (10 ** -tokenDecimal);
	}
	else {
		balance = -1;
	}

	return balance;
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
