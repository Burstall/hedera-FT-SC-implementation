const {
	Client,
	AccountId,
	PrivateKey,
	ContractCreateFlow,
	ContractFunctionParameters,
	ContractExecuteTransaction,
	TokenAssociateTransaction,
	AccountInfoQuery,
	ContractInfoQuery,
	ReceiptStatusError,
	TokenId,
} = require('@hashgraph/sdk');
const fs = require('fs');
// const { hethers } = require('@hashgraph/hethers');
require('dotenv').config();

// Get operator from .env file
const operatorKey = PrivateKey.fromString(process.env.PRIVATE_KEY);
const operatorId = AccountId.fromString(process.env.ACCOUNT_ID);

const tokenName = process.env.TOKEN_NAME;
const tokenSymbol = process.env.TOKEN_SYMBOL;
const tokenDecimal = Number(process.env.TOKEN_DECIMALS);
const tokenInitalSupply = Number(process.env.TOKEN_INITALSUPPLY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);

async function contractDeployFcn(bytecode, gasLim) {
	const contractCreateTx = new ContractCreateFlow().setBytecode(bytecode).setGas(gasLim);
	const contractCreateSubmit = await contractCreateTx.execute(client);
	const contractCreateRx = await contractCreateSubmit.getReceipt(client);
	const contractId = contractCreateRx.contractId;
	const contractAddress = contractId.toSolidityAddress();
	return [contractId, contractAddress];
}

const main = async () => {
	const json = JSON.parse(fs.readFileSync('./artifacts/contracts/FungibleTokenCreator.sol/FungibleTokenCreator.json'));

	const contractBytecode = json.bytecode;

	console.log('\n- Deploying contract...');
	const gasLimit = 100000;

	const [contractId, contractAddress] = await contractDeployFcn(contractBytecode, gasLimit);

	console.log(`Contract created with ID: ${contractId} / ${contractAddress}`);

	// Create FT using precompile function
	const createToken = new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(300000)
		.setPayableAmount(20)
		.setFunction('createFungible',
			/*
			*	FT NAME
			*	FT SYMBOL
			*	FT Initial Supply
			*	FT Decimals
			*	FT auto renew periood
			*/
			new ContractFunctionParameters()
				.addString(tokenName)
				.addString(tokenSymbol)
				.addUint256(tokenInitalSupply)
				.addUint256(tokenDecimal)
				.addUint32(7000000));

	const createTokenTx = await createToken.execute(client);

	const createTokenRx = await createTokenTx.getRecord(client);
	const tokenIdSolidityAddr = createTokenRx.contractFunctionResult.getAddress(0);
	const tokenId = TokenId.fromSolidityAddress(tokenIdSolidityAddr);

	console.log(`Token created with ID: ${tokenId} / ${tokenIdSolidityAddr}\n`);

	console.log('Using token: ', tokenId.toString());
	console.log('Using contract: ', contractId.toString());

	const acctBal = await getAccountBalance(operatorId, tokenId);
	if (acctBal < 0) {
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
	else {
		console.log('Token already associated - ', acctBal);
	}

	// Execute token transfer from TokenSender to Operator
	const tokenTransfer = new ContractExecuteTransaction()
		.setContractId(contractId)
		.setGas(4000000)
		.setFunction('transfer',
			new ContractFunctionParameters()
				.addAddress(tokenIdSolidityAddr)
				.addAddress(operatorId.toSolidityAddress())
				.addUint256(1000000),
		);

	try {
		const tokenTransferTx = await tokenTransfer.execute(client);
		const tokenTransferRx = await tokenTransferTx.getReceipt(client);
		const tokenTransferStatus = tokenTransferRx.status;

		console.log('Token transfer transaction status: ' + tokenTransferStatus.toString());

		console.log(operatorId.toString() + ' account balance for token ' + tokenId + ' is: ' + await getAccountBalance(operatorId, tokenId));

		console.log(contractId.toString() + ' account balance for token ' + tokenId + ' is: ' + await getContractBalance(contractId, tokenId));
	}
	catch (err) {
		if (err instanceof ReceiptStatusError) {
			console.log(err.status, err.name, err.message);
		}
	}
};

async function getAccountBalance(acctId, tokenId) {

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

async function getContractBalance(ctrctId, tokenId) {

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
